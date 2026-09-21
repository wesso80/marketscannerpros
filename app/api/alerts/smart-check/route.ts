import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { q } from '@/lib/db';
import { sendAlertEmail } from '@/lib/email';
import { sendPushToUser } from '@/lib/pushServer';
import { fetchMPE } from '@/lib/goldenEggFetchers';

/**
 * Smart Alerts Checker
 * 
 * Checks derivatives-based alerts (OI, Funding, Fear/Greed, L/S Ratio)
 * Should be called by cron every 5-15 minutes
 * 
 * GET/POST /api/alerts/smart-check
 * Headers: x-cron-secret: <CRON_SECRET>
 */

const CRON_SECRET = process.env.CRON_SECRET;

/** Ensure smart alert columns exist (self-healing schema) */
async function ensureSmartAlertSchema() {
  try {
    await q(`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS is_smart_alert BOOLEAN DEFAULT false`);
    await q(`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS smart_alert_context JSONB`);
    await q(`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS last_derivative_value DECIMAL(20, 8)`);
    await q(`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS cooldown_minutes INT DEFAULT 60`);
  } catch (e) {
    console.warn('[smart-check] ensureSmartAlertSchema warning:', e);
  }
}

interface SmartAlert {
  id: string;
  workspace_id: string;
  symbol: string;
  condition_type: string;
  condition_value: number;
  is_recurring: boolean;
  notify_email: boolean;
  notify_push: boolean;
  name: string;
  cooldown_minutes: number;
  triggered_at: string | null;
}

interface DerivativesData {
  oi: {
    total: { value: number; change24h: number; formatted: string };
    btc: { value: number; change24h: number };
    eth: { value: number; change24h: number };
  } | null;
  funding: {
    btc: { fundingRatePercent: number };
    eth: { fundingRatePercent: number };
    average: { fundingRatePercent: number };
  } | null;
  longShort: {
    btc: { longShortRatio: number };
    eth: { longShortRatio: number };
    average: { longShortRatio: number };
  } | null;
  fearGreed: {
    value: number;
    classification: string;
  } | null;
}

export async function GET(req: NextRequest) {
  return checkSmartAlerts(req);
}

export async function POST(req: NextRequest) {
  return checkSmartAlerts(req);
}

async function checkSmartAlerts(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || '';
  if (CRON_SECRET) {
    const a = Buffer.from(secret);
    const b = Buffer.from(CRON_SECRET);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    await ensureSmartAlertSchema();

    // Get all active smart alerts
    const alerts = await q<SmartAlert>(`
      SELECT id, workspace_id, symbol, condition_type, condition_value,
             is_recurring, notify_email, notify_push, name, cooldown_minutes, triggered_at
      FROM alerts 
      WHERE is_active = true 
        AND is_smart_alert = true
        AND (expires_at IS NULL OR expires_at > NOW())
    `);

    // Fetch the CoinGecko derivatives aggregate once and derive every smart-alert
    // derivative metric from that single payload. This avoids fan-out to three
    // routes that all depend on the same large /derivatives response.
    const derivativesBundle = await fetchDerivativesData(req);
    const derivativesData = derivativesBundle.data;
    
    // Save snapshot for historical analysis
    await saveSnapshot(derivativesData);

    // Persist the exact same per-coin payload — no second provider fetch.
    await savePerCoinSnapshots(derivativesBundle.multi);

    // Save stablecoin supply snapshot
    await saveStablecoinSnapshot(req);

    if (alerts.length === 0) {
      return NextResponse.json({ checked: 0, triggered: 0, message: 'No active smart alerts', snapshotSaved: true });
    }

    const triggered: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const alert of alerts) {
      try {
        // Check cooldown
        if (alert.triggered_at) {
          const lastTrigger = new Date(alert.triggered_at);
          const cooldownMs = (alert.cooldown_minutes || 60) * 60 * 1000;
          if (Date.now() - lastTrigger.getTime() < cooldownMs) {
            skipped.push(alert.id);
            continue;
          }
        }

        const result = checkSmartCondition(alert, derivativesData);
        
        // If the basic check didn't trigger, try extended conditions (portfolio/MPE/state)
        const finalResult = result.triggered
          ? result
          : await checkExtendedCondition(alert, derivativesData);

        if (finalResult.triggered) {
          await triggerSmartAlert(alert, finalResult);
          triggered.push(alert.id);
        }
      } catch (err) {
        errors.push(`Error checking alert ${alert.id}: ${err}`);
      }
    }

    return NextResponse.json({
      checked: alerts.length,
      triggered: triggered.length,
      skipped: skipped.length,
      triggeredIds: triggered,
      errors: errors.length > 0 ? errors : undefined,
      dataSnapshot: {
        oi24hChange: derivativesData.oi?.total?.change24h,
        avgFunding: derivativesData.funding?.average?.fundingRatePercent,
        avgLS: derivativesData.longShort?.average?.longShortRatio,
        fearGreed: derivativesData.fearGreed?.value,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Smart alert check error:', error);
    // Return 200 with error details — prevents cron exit-22 for transient failures
    return NextResponse.json({
      ok: false,
      checked: 0,
      triggered: 0,
      error: error?.message || 'Failed to check smart alerts',
      timestamp: new Date().toISOString(),
    });
  }
}

const INTERNAL_FETCH_TIMEOUT_MS = 35_000; // derivatives payload can be large; provider timeout is 30s

function internalRequestHeaders(): HeadersInit {
  return CRON_SECRET ? { 'x-cron-secret': CRON_SECRET } : {};
}

async function fetchInternalJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: internalRequestHeaders(),
      signal: AbortSignal.timeout(INTERNAL_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[smart-check] Internal fetch failed ${res.status}: ${new URL(url).pathname}`);
      return null;
    }
    return await res.json();
  } catch (error) {
    console.warn(`[smart-check] Internal fetch error: ${new URL(url).pathname}`, error);
    return null;
  }
}

async function fetchDerivativesData(req: NextRequest): Promise<{ data: DerivativesData; multi: any | null }> {
  const host = req.headers.get('host') || 'localhost:5000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  const [multiRes, fgRes] = await Promise.all([
    fetchInternalJson(`${baseUrl}/api/crypto-derivatives?mode=multi`),
    fetchInternalJson(`${baseUrl}/api/fear-greed`),
  ]);

  const coins: any[] = Array.isArray(multiRes?.coins) ? multiRes.coins : [];
  const symbols = coins.map((coin) => String(coin.symbol || '').toUpperCase()).filter(Boolean);

  // Compare against the nearest stored snapshot at least 20h old. Unlike the
  // legacy in-memory anchor this survives deploys/restarts and is explicit.
  const previousRows = symbols.length > 0
    ? await q<{ symbol: string; total_oi: number }>(
        `SELECT DISTINCT ON (symbol) symbol, total_oi
         FROM derivatives_snapshots
         WHERE symbol = ANY($1::text[])
           AND captured_at < NOW() - INTERVAL '20 hours'
           AND total_oi IS NOT NULL
         ORDER BY symbol, captured_at DESC`,
        [symbols],
      ).catch(() => [])
    : [];

  const previousOi = new Map<string, number>(
    previousRows.map((row) => [String(row.symbol).toUpperCase(), Number(row.total_oi) || 0]),
  );

  const oiChange = (symbol: string, current: number): number => {
    const previous = previousOi.get(symbol) || 0;
    return previous > 0 && current > 0 ? ((current - previous) / previous) * 100 : 0;
  };

  const btcCoin = coins.find((coin) => String(coin.symbol).toUpperCase() === 'BTC');
  const ethCoin = coins.find((coin) => String(coin.symbol).toUpperCase() === 'ETH');

  const currentOi = (coin: any): number => Number(coin?.aggregatedOI?.totalOI) || 0;
  const fundingPct = (coin: any): number | null => {
    const value = Number(coin?.aggregatedFunding?.fundingRatePct);
    return Number.isFinite(value) ? value : null;
  };

  let comparableCurrentOi = 0;
  let comparablePreviousOi = 0;
  for (const coin of coins) {
    const symbol = String(coin.symbol || '').toUpperCase();
    const current = currentOi(coin);
    const previous = previousOi.get(symbol) || 0;
    if (current > 0 && previous > 0) {
      comparableCurrentOi += current;
      comparablePreviousOi += previous;
    }
  }
  const aggregateOiChange = comparablePreviousOi > 0
    ? ((comparableCurrentOi - comparablePreviousOi) / comparablePreviousOi) * 100
    : 0;
  const totalOi = coins.reduce((sum, coin) => sum + currentOi(coin), 0);

  const availableFunding = coins
    .map((coin) => fundingPct(coin))
    .filter((value): value is number => value !== null);
  const avgFunding = availableFunding.length
    ? availableFunding.reduce((sum, value) => sum + value, 0) / availableFunding.length
    : 0;

  const fundingSentiment = (rate: number): 'Bullish' | 'Bearish' | 'Neutral' =>
    rate > 0.03 ? 'Bullish' : rate < -0.01 ? 'Bearish' : 'Neutral';

  // Legacy compatibility only. This is a funding-implied positioning proxy,
  // not exchange-reported long/short account positioning.
  const positioningProxy = (rate: number): number =>
    Math.max(0.5, Math.min(1.5, 1 + rate / 0.05));
  const proxyValues = availableFunding.map(positioningProxy);
  const avgProxy = proxyValues.length
    ? proxyValues.reduce((sum, value) => sum + value, 0) / proxyValues.length
    : 1;
  const longPct = (avgProxy / (1 + avgProxy)) * 100;

  const makeFunding = (coin: any) => {
    const rate = fundingPct(coin);
    return rate === null ? null : { fundingRatePercent: rate };
  };
  const makeOi = (coin: any) => {
    if (!coin) return null;
    const symbol = String(coin.symbol || '').toUpperCase();
    const value = currentOi(coin);
    return {
      value,
      openInterest: value,
      change24h: oiChange(symbol, value),
      formatted: formatUsd(value),
    };
  };

  const data: DerivativesData = {
    oi: coins.length ? {
      total: {
        value: totalOi,
        openInterest: totalOi,
        change24h: aggregateOiChange,
        formatted: formatUsd(totalOi),
      } as any,
      btc: makeOi(btcCoin) as any,
      eth: makeOi(ethCoin) as any,
    } : null,
    funding: coins.length ? {
      btc: makeFunding(btcCoin) as any,
      eth: makeFunding(ethCoin) as any,
      average: {
        fundingRatePercent: avgFunding,
        sentiment: fundingSentiment(avgFunding),
      } as any,
    } : null,
    longShort: coins.length ? {
      btc: btcCoin ? { longShortRatio: positioningProxy(fundingPct(btcCoin) ?? 0) } as any : null as any,
      eth: ethCoin ? { longShortRatio: positioningProxy(fundingPct(ethCoin) ?? 0) } as any : null as any,
      average: {
        longShortRatio: avgProxy,
        longPercent: longPct,
        shortPercent: 100 - longPct,
        sentiment: avgProxy > 1.2 ? 'Bullish' : avgProxy < 0.8 ? 'Bearish' : 'Neutral',
      } as any,
    } : null,
    fearGreed: fgRes?.current ? {
      value: fgRes.current.value,
      classification: fgRes.current.classification,
    } : null,
  };

  return { data, multi: multiRes };
}

function formatUsd(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
}

interface CheckResult {
  triggered: boolean;
  value?: number;
  threshold?: number;
  message?: string;
  context?: Record<string, any>;
}

function checkSmartCondition(alert: SmartAlert, data: DerivativesData): CheckResult {
  const { condition_type, condition_value, symbol } = alert;
  
  // Get symbol-specific data or use averages
  const isEth = symbol?.toUpperCase().includes('ETH');
  const isBtc = symbol?.toUpperCase().includes('BTC') || !isEth;
  
  switch (condition_type) {
    case 'oi_surge': {
      const change = data.oi?.total?.change24h ?? 0;
      if (change >= condition_value) {
        return {
          triggered: true,
          value: change,
          threshold: condition_value,
          message: `🚨 Open Interest SURGE: +${change.toFixed(2)}% in 24h (threshold: ${condition_value}%)`,
          context: { totalOI: data.oi?.total?.formatted },
        };
      }
      break;
    }

    case 'oi_drop': {
      const change = data.oi?.total?.change24h ?? 0;
      if (change <= -condition_value) {
        return {
          triggered: true,
          value: change,
          threshold: -condition_value,
          message: `🚨 Open Interest DROP: ${change.toFixed(2)}% in 24h (threshold: -${condition_value}%)`,
          context: { totalOI: data.oi?.total?.formatted },
        };
      }
      break;
    }

    case 'funding_extreme_pos': {
      const rate = isBtc 
        ? data.funding?.btc?.fundingRatePercent 
        : data.funding?.eth?.fundingRatePercent;
      if (rate && rate >= condition_value) {
        return {
          triggered: true,
          value: rate,
          threshold: condition_value,
          message: `🔴 EXTREME FUNDING: ${rate.toFixed(4)}% (overleveraged longs - bearish signal)`,
          context: { avgFunding: data.funding?.average?.fundingRatePercent },
        };
      }
      break;
    }

    case 'funding_extreme_neg': {
      const rate = isBtc 
        ? data.funding?.btc?.fundingRatePercent 
        : data.funding?.eth?.fundingRatePercent;
      if (rate && rate <= -condition_value) {
        return {
          triggered: true,
          value: rate,
          threshold: -condition_value,
          message: `🟢 EXTREME NEGATIVE FUNDING: ${rate.toFixed(4)}% (overleveraged shorts - bullish signal)`,
          context: { avgFunding: data.funding?.average?.fundingRatePercent },
        };
      }
      break;
    }

    case 'ls_ratio_high': {
      const ratio = data.longShort?.average?.longShortRatio ?? 1;
      if (ratio >= condition_value) {
        return {
          triggered: true,
          value: ratio,
          threshold: condition_value,
          message: `⚠️ HIGH L/S RATIO: ${ratio.toFixed(2)} (crowded longs - squeeze risk)`,
          context: { btcLS: data.longShort?.btc?.longShortRatio },
        };
      }
      break;
    }

    case 'ls_ratio_low': {
      const ratio = data.longShort?.average?.longShortRatio ?? 1;
      if (ratio <= condition_value) {
        return {
          triggered: true,
          value: ratio,
          threshold: condition_value,
          message: `⚠️ LOW L/S RATIO: ${ratio.toFixed(2)} (crowded shorts - squeeze up risk)`,
          context: { btcLS: data.longShort?.btc?.longShortRatio },
        };
      }
      break;
    }

    case 'fear_extreme': {
      const value = data.fearGreed?.value ?? 50;
      if (value <= condition_value) {
        return {
          triggered: true,
          value,
          threshold: condition_value,
          message: `😱 EXTREME FEAR: ${value}/100 (${data.fearGreed?.classification}) — Market sentiment is fearful`,
          context: { classification: data.fearGreed?.classification },
        };
      }
      break;
    }

    case 'greed_extreme': {
      const value = data.fearGreed?.value ?? 50;
      if (value >= condition_value) {
        return {
          triggered: true,
          value,
          threshold: condition_value,
          message: `🤑 EXTREME GREED: ${value}/100 (${data.fearGreed?.classification}) — Market sentiment is extremely greedy`,
          context: { classification: data.fearGreed?.classification },
        };
      }
      break;
    }

    case 'oi_divergence_bull': {
      // OI increasing while price presumably down
      const oiChange = data.oi?.total?.change24h ?? 0;
      if (oiChange >= condition_value) {
        return {
          triggered: true,
          value: oiChange,
          threshold: condition_value,
          message: `📈 OI DIVERGENCE: OI +${oiChange.toFixed(2)}% — Open interest rising while price declining`,
          context: { totalOI: data.oi?.total?.formatted },
        };
      }
      break;
    }

    case 'oi_divergence_bear': {
      // OI decreasing significantly
      const oiChange = data.oi?.total?.change24h ?? 0;
      if (oiChange <= -condition_value) {
        return {
          triggered: true,
          value: oiChange,
          threshold: -condition_value,
          message: `📉 OI DIVERGENCE: OI ${oiChange.toFixed(2)}% — Open interest falling significantly`,
          context: { totalOI: data.oi?.total?.formatted },
        };
      }
      break;
    }
  }

  return { triggered: false };
}

/**
 * Extended condition checker for portfolio/MPE alerts
 * These require async DB or API lookups per workspace
 */
async function checkExtendedCondition(alert: SmartAlert, data: DerivativesData): Promise<CheckResult> {
  const { condition_type, condition_value, workspace_id, symbol } = alert;

  switch (condition_type) {
    case 'portfolio_drawdown': {
      // Trigger when portfolio unrealized P&L drops below -X%
      const rows = await q<{ total_cost: number; total_value: number }>(
        `SELECT COALESCE(SUM(avg_cost * quantity), 0) as total_cost,
                COALESCE(SUM(current_price * quantity), 0) as total_value
         FROM portfolio_positions
         WHERE workspace_id = $1 AND status = 'open'`,
        [workspace_id]
      );
      const { total_cost, total_value } = rows[0] || { total_cost: 0, total_value: 0 };
      if (total_cost > 0) {
        const drawdownPct = ((total_value - total_cost) / total_cost) * 100;
        if (drawdownPct <= -condition_value) {
          return {
            triggered: true,
            value: drawdownPct,
            threshold: -condition_value,
            message: `🔴 PORTFOLIO DRAWDOWN: ${drawdownPct.toFixed(2)}% (threshold: -${condition_value}%)`,
            context: { totalCost: total_cost, totalValue: total_value },
          };
        }
      }
      break;
    }

    case 'portfolio_daily_loss': {
      // Trigger when closed P&L today exceeds -$X
      const rows = await q<{ daily_pnl: number }>(
        `SELECT COALESCE(SUM(realized_pnl), 0) as daily_pnl
         FROM portfolio_closed
         WHERE workspace_id = $1
           AND closed_at >= CURRENT_DATE`,
        [workspace_id]
      );
      const dailyPnl = rows[0]?.daily_pnl ?? 0;
      if (dailyPnl <= -condition_value) {
        return {
          triggered: true,
          value: dailyPnl,
          threshold: -condition_value,
          message: `💰 DAILY LOSS LIMIT: $${Math.abs(dailyPnl).toFixed(2)} lost today (threshold: $${condition_value})`,
          context: { dailyPnl },
        };
      }
      break;
    }

    case 'mpe_above': {
      // Trigger when MPE composite exceeds threshold
      if (!symbol) break;
      const mpe = await fetchMPE(symbol, 'auto').catch(() => null);
      if (mpe && mpe.composite >= condition_value) {
        return {
          triggered: true,
          value: mpe.composite,
          threshold: condition_value,
          message: `🔥 MPE HIGH PRESSURE: ${symbol} MPE ${Math.round(mpe.composite)}/100 (threshold: ${condition_value})`,
          context: { time: mpe.time, volatility: mpe.volatility, liquidity: mpe.liquidity },
        };
      }
      break;
    }

    case 'mpe_below': {
      // Trigger when MPE composite drops below threshold
      if (!symbol) break;
      const mpe = await fetchMPE(symbol, 'auto').catch(() => null);
      if (mpe && mpe.composite <= condition_value) {
        return {
          triggered: true,
          value: mpe.composite,
          threshold: condition_value,
          message: `❄️ MPE LOW PRESSURE: ${symbol} MPE ${Math.round(mpe.composite)}/100 (threshold: ${condition_value})`,
          context: { time: mpe.time, volatility: mpe.volatility, liquidity: mpe.liquidity },
        };
      }
      break;
    }

    case 'state_machine_change': {
      // Trigger when symbol enters a specific state (condition_value is ignored, symbol required)
      if (!symbol) break;
      const smRows = await q<{ state: string; previous_state: string | null; updated_at: string }>(
        `SELECT state, previous_state, updated_at
         FROM symbol_state_machine
         WHERE workspace_id = $1 AND symbol = $2
         ORDER BY updated_at DESC LIMIT 1`,
        [workspace_id, symbol.toUpperCase()]
      );
      if (smRows[0] && smRows[0].previous_state && smRows[0].state !== smRows[0].previous_state) {
        // State changed recently — check if within last 30 minutes
        const updatedAt = new Date(smRows[0].updated_at);
        if (Date.now() - updatedAt.getTime() < 30 * 60 * 1000) {
          return {
            triggered: true,
            value: 0,
            message: `🔄 STATE CHANGE: ${symbol} moved from ${smRows[0].previous_state} → ${smRows[0].state}`,
            context: { oldState: smRows[0].previous_state, newState: smRows[0].state },
          };
        }
      }
      break;
    }
  }

  return { triggered: false };
}

async function triggerSmartAlert(alert: SmartAlert, result: CheckResult) {
  // Get user email
  let userEmail: string | null = null;
  if (alert.notify_email) {
    const userResult = await q<{ email: string }>(
      `SELECT email FROM user_subscriptions WHERE workspace_id = $1`,
      [alert.workspace_id]
    );
    userEmail = userResult[0]?.email || null;
  }

  // Record in history
  await q(
    `INSERT INTO alert_history (
      alert_id, workspace_id, triggered_at, triggered_price,
      symbol, condition_type, condition_value, notification_sent, notification_type
    ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8)`,
    [
      alert.id,
      alert.workspace_id,
      result.value || 0,
      alert.symbol || 'MARKET',
      alert.condition_type,
      alert.condition_value,
      !!userEmail,
      'email',
    ]
  );

  // Update alert
  if (alert.is_recurring) {
    await q(
      `UPDATE alerts 
       SET triggered_at = NOW(), 
           trigger_count = trigger_count + 1,
           last_derivative_value = $2,
           smart_alert_context = $3
       WHERE id = $1`,
      [alert.id, result.value, JSON.stringify(result.context || {})]
    );
  } else {
    await q(
      `UPDATE alerts 
       SET is_active = false, 
           triggered_at = NOW(), 
           trigger_count = trigger_count + 1,
           last_derivative_value = $2,
           smart_alert_context = $3
       WHERE id = $1`,
      [alert.id, result.value, JSON.stringify(result.context || {})]
    );
  }

  // Send email notification
  if (userEmail && result.message) {
    try {
      await sendAlertEmail({
        to: userEmail,
        alertName: alert.name || 'Smart Alert',
        symbol: alert.symbol || 'MARKET',
        message: result.message,
        value: result.value,
        threshold: result.threshold,
        alertType: 'smart',
      });
    } catch (emailErr) {
      console.error('Failed to send smart alert email:', emailErr);
    }
  }

  // Send push notification
  if (alert.notify_push && result.message) {
    try {
      await sendPushToUser(alert.workspace_id, {
        title: `🎯 ${alert.name || 'Smart Alert'}`,
        body: result.message,
        tag: `smart-alert-${alert.condition_type}`,
        data: {
          url: '/tools/scanner',
          type: 'smart_alert',
          alertId: alert.id,
          symbol: alert.symbol
        }
      });
      console.log(`🔔 Push sent for smart alert: ${alert.name || alert.condition_type}`);
    } catch (pushErr) {
      console.error('Failed to send smart alert push:', pushErr);
    }
  }
}

async function saveSnapshot(data: DerivativesData) {
  try {
    await q(
      `INSERT INTO smart_alert_snapshots (
        total_oi_usd, oi_change_24h,
        btc_oi, btc_oi_change, btc_funding_rate, btc_ls_ratio,
        eth_oi, eth_oi_change, eth_funding_rate, eth_ls_ratio,
        fear_greed_value, fear_greed_class,
        avg_funding_rate, avg_ls_ratio,
        raw_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        data.oi?.total?.value || null,
        data.oi?.total?.change24h || null,
        data.oi?.btc?.value || null,
        data.oi?.btc?.change24h || null,
        data.funding?.btc?.fundingRatePercent || null,
        data.longShort?.btc?.longShortRatio || null,
        data.oi?.eth?.value || null,
        data.oi?.eth?.change24h || null,
        data.funding?.eth?.fundingRatePercent || null,
        data.longShort?.eth?.longShortRatio || null,
        data.fearGreed?.value || null,
        data.fearGreed?.classification || null,
        data.funding?.average?.fundingRatePercent || null,
        data.longShort?.average?.longShortRatio || null,
        JSON.stringify(data),
      ]
    );
  } catch (err) {
    console.error('Failed to save snapshot:', err);
  }
}

/** Snapshot top-20 coin derivatives for historical funding rate / OI charting */
async function savePerCoinSnapshots(data: any | null) {
  try {
    if (!data?.coins?.length) {
      console.warn('[smart-check] Per-coin derivatives snapshot skipped: aggregate unavailable');
      return;
    }

    const values: any[][] = [];
    for (const coin of data.coins) {
      values.push([
        coin.symbol,
        coin.aggregatedFunding?.fundingRatePct ?? null,
        coin.aggregatedFunding?.annualised ?? null,
        coin.aggregatedFunding?.sentiment ?? null,
        coin.aggregatedOI?.totalOI ?? null,
        coin.aggregatedOI?.totalVolume24h ?? null,
        coin.aggregatedFunding?.exchangeCount ?? null,
        coin.price ?? null,
        coin.change24h ?? null,
      ]);
    }

    // Batch insert — one row per coin per snapshot
    for (const v of values) {
      await q(
        `INSERT INTO derivatives_snapshots
          (symbol, funding_rate_pct, annualised_pct, sentiment,
           total_oi, total_volume_24h, exchange_count, price, change_24h)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        v
      );
    }
    console.log(`[smart-check] Saved ${values.length} per-coin derivatives snapshots`);
  } catch (err) {
    console.error('Failed to save per-coin snapshots:', err);
  }
}

/** Snapshot USDT + USDC market cap for stablecoin liquidity tracking */
async function saveStablecoinSnapshot(req: NextRequest) {
  try {
    const host = req.headers.get('host') || 'localhost:5000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    const res = await fetch(`${baseUrl}/api/stablecoin-liquidity`, {
      cache: 'no-store',
      headers: internalRequestHeaders(),
      signal: AbortSignal.timeout(INTERNAL_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data?.usdt || !data?.usdc) return;

    await q(
      `INSERT INTO stablecoin_snapshots
        (usdt_market_cap, usdc_market_cap, total_stablecoin_cap, usdt_24h_change, usdc_24h_change)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        data.usdt.marketCap ?? null,
        data.usdc.marketCap ?? null,
        (data.usdt.marketCap ?? 0) + (data.usdc.marketCap ?? 0),
        data.usdt.change24h ?? null,
        data.usdc.change24h ?? null,
      ]
    );
    console.log('[smart-check] Saved stablecoin liquidity snapshot');
  } catch (err) {
    console.error('Failed to save stablecoin snapshot:', err);
  }
}
