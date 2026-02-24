import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { sendAlertEmail } from '@/lib/email';
import { sendPushToUser } from '@/lib/pushServer';

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
  const secret = req.headers.get('x-cron-secret');
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all active smart alerts
    const alerts = await q<SmartAlert>(`
      SELECT id, workspace_id, symbol, condition_type, condition_value,
             is_recurring, notify_email, notify_push, name, cooldown_minutes, triggered_at
      FROM alerts 
      WHERE is_active = true 
        AND is_smart_alert = true
        AND (expires_at IS NULL OR expires_at > NOW())
    `);

    if (alerts.length === 0) {
      return NextResponse.json({ checked: 0, triggered: 0, message: 'No active smart alerts' });
    }

    // Fetch all derivatives data once
    const derivativesData = await fetchDerivativesData(req);
    
    // Save snapshot for historical analysis
    await saveSnapshot(derivativesData);

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
        
        if (result.triggered) {
          await triggerSmartAlert(alert, result);
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
  } catch (error) {
    console.error('Smart alert check error:', error);
    return NextResponse.json({ error: 'Failed to check smart alerts' }, { status: 500 });
  }
}

async function fetchDerivativesData(req: NextRequest): Promise<DerivativesData> {
  const host = req.headers.get('host') || 'localhost:5000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  const [oiRes, fundingRes, lsRes, fgRes] = await Promise.all([
    fetch(`${baseUrl}/api/open-interest`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    fetch(`${baseUrl}/api/funding-rates`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    fetch(`${baseUrl}/api/long-short-ratio`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    fetch(`${baseUrl}/api/fear-greed`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
  ]);

  return {
    oi: oiRes ? {
      total: oiRes.total,
      btc: oiRes.btc,
      eth: oiRes.eth,
    } : null,
    funding: fundingRes ? {
      btc: fundingRes.btc,
      eth: fundingRes.eth,
      average: fundingRes.average,
    } : null,
    longShort: lsRes ? {
      btc: lsRes.btc,
      eth: lsRes.eth,
      average: lsRes.average,
    } : null,
    fearGreed: fgRes?.current ? {
      value: fgRes.current.value,
      classification: fgRes.current.classification,
    } : null,
  };
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
          message: `😱 EXTREME FEAR: ${value}/100 (${data.fearGreed?.classification}) - contrarian BUY signal`,
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
          message: `🤑 EXTREME GREED: ${value}/100 (${data.fearGreed?.classification}) - consider taking profits`,
          context: { classification: data.fearGreed?.classification },
        };
      }
      break;
    }

    case 'oi_divergence_bull': {
      // OI increasing while price presumably down - accumulation
      const oiChange = data.oi?.total?.change24h ?? 0;
      if (oiChange >= condition_value) {
        return {
          triggered: true,
          value: oiChange,
          threshold: condition_value,
          message: `📈 BULLISH DIVERGENCE: OI +${oiChange.toFixed(2)}% - smart money accumulating`,
          context: { totalOI: data.oi?.total?.formatted },
        };
      }
      break;
    }

    case 'oi_divergence_bear': {
      // OI decreasing significantly - distribution/deleveraging
      const oiChange = data.oi?.total?.change24h ?? 0;
      if (oiChange <= -condition_value) {
        return {
          triggered: true,
          value: oiChange,
          threshold: -condition_value,
          message: `📉 BEARISH DIVERGENCE: OI ${oiChange.toFixed(2)}% - distribution/deleveraging`,
          context: { totalOI: data.oi?.total?.formatted },
        };
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
