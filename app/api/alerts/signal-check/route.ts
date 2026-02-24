import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { sendAlertEmail } from '@/lib/email';
import { sendPushToUser } from '@/lib/pushServer';

/**
 * Scanner Signal Alerts Checker
 * 
 * Checks for buy/sell signals from the scanner
 * Should be called by cron every 5-15 minutes
 * 
 * GET/POST /api/alerts/signal-check
 * Headers: x-cron-secret: <CRON_SECRET>
 */

const CRON_SECRET = process.env.CRON_SECRET;

interface SignalAlert {
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
  last_derivative_value: number | null;
  smart_alert_context: any;
}

interface ScanResult {
  symbol: string;
  score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  signals: {
    bullish: number;
    bearish: number;
    neutral: number;
  };
  price?: number;
}

export async function GET(req: NextRequest) {
  return checkSignalAlerts(req);
}

export async function POST(req: NextRequest) {
  return checkSignalAlerts(req);
}

async function checkSignalAlerts(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all active signal alerts
    const alerts = await q<SignalAlert>(`
      SELECT id, workspace_id, symbol, condition_type, condition_value,
             is_recurring, notify_email, notify_push, name, cooldown_minutes, 
             triggered_at, last_derivative_value, smart_alert_context
      FROM alerts 
      WHERE is_active = true 
        AND is_smart_alert = true
        AND condition_type IN (
          'scanner_buy_signal', 'scanner_sell_signal',
          'scanner_score_above', 'scanner_score_below',
          'scanner_bullish_flip', 'scanner_bearish_flip'
        )
        AND (expires_at IS NULL OR expires_at > NOW())
    `);

    if (alerts.length === 0) {
      return NextResponse.json({ checked: 0, triggered: 0, message: 'No active signal alerts' });
    }

    // Group alerts by symbol to minimize API calls
    const symbolAlerts = new Map<string, SignalAlert[]>();
    for (const alert of alerts) {
      const sym = alert.symbol?.toUpperCase() || 'MARKET';
      if (!symbolAlerts.has(sym)) {
        symbolAlerts.set(sym, []);
      }
      symbolAlerts.get(sym)!.push(alert);
    }

    // Fetch scanner data for each unique symbol
    const host = req.headers.get('host') || 'localhost:5000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    const triggered: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];
    const scannedSymbols: string[] = [];

    for (const [symbol, alertsForSymbol] of symbolAlerts) {
      try {
        // Skip MARKET alerts - they need different handling
        if (symbol === 'MARKET') continue;

        // Determine asset type (crypto or equity)
        const isCrypto = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'MATIC', 'LINK', 'DOT'].includes(symbol);
        const assetType = isCrypto ? 'crypto' : 'equity';

        // Run scanner for this symbol
        const scanHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (process.env.CRON_SECRET) scanHeaders['x-cron-secret'] = process.env.CRON_SECRET;

        const scanRes = await fetch(`${baseUrl}/api/scanner/run`, {
          method: 'POST',
          headers: scanHeaders,
          body: JSON.stringify({
            type: assetType,
            timeframe: 'daily',
            minScore: 0,
            symbols: [symbol]
          }),
          cache: 'no-store'
        });

        if (!scanRes.ok) {
          errors.push(`Scanner failed for ${symbol}: ${scanRes.status}`);
          continue;
        }

        const scanData = await scanRes.json();
        const result = scanData.results?.[0] as ScanResult | undefined;

        if (!result) {
          errors.push(`No scan result for ${symbol}`);
          continue;
        }

        scannedSymbols.push(symbol);

        // Check each alert for this symbol
        for (const alert of alertsForSymbol) {
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

            const checkResult = checkSignalCondition(alert, result);

            if (checkResult.triggered) {
              await triggerSignalAlert(alert, checkResult, result);
              triggered.push(alert.id);
            } else {
              // Update last known value for flip detection
              await q(`
                UPDATE alerts 
                SET last_derivative_value = $1,
                    smart_alert_context = $2,
                    last_checked_at = NOW()
                WHERE id = $3
              `, [result.score, JSON.stringify({ direction: result.direction, signals: result.signals }), alert.id]);
            }
          } catch (err) {
            errors.push(`Error checking alert ${alert.id}: ${err}`);
          }
        }
      } catch (err) {
        errors.push(`Error scanning ${symbol}: ${err}`);
      }
    }

    return NextResponse.json({
      checked: alerts.length,
      triggered: triggered.length,
      skipped: skipped.length,
      scannedSymbols,
      triggeredIds: triggered,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Signal alert check error:', error);
    return NextResponse.json({ error: 'Failed to check signal alerts' }, { status: 500 });
  }
}

interface CheckResult {
  triggered: boolean;
  value?: number;
  threshold?: number;
  message?: string;
  context?: Record<string, any>;
}

function checkSignalCondition(alert: SignalAlert, scan: ScanResult): CheckResult {
  const { condition_type, condition_value, smart_alert_context } = alert;
  const prevDirection = smart_alert_context?.direction;
  const prevScore = alert.last_derivative_value;

  switch (condition_type) {
    case 'scanner_buy_signal': {
      // Trigger when score is above threshold AND direction is bullish
      const minScore = condition_value || 65;
      if (scan.score >= minScore && scan.direction === 'bullish') {
        return {
          triggered: true,
          value: scan.score,
          threshold: minScore,
          message: `🟢 BUY SIGNAL: ${scan.symbol} score ${scan.score}/100 (${scan.signals.bullish} bullish signals)`,
          context: { 
            direction: scan.direction, 
            signals: scan.signals,
            price: scan.price 
          },
        };
      }
      break;
    }

    case 'scanner_sell_signal': {
      // Trigger when score is below threshold AND direction is bearish
      const maxScore = condition_value || 35;
      if (scan.score <= maxScore && scan.direction === 'bearish') {
        return {
          triggered: true,
          value: scan.score,
          threshold: maxScore,
          message: `🔴 SELL SIGNAL: ${scan.symbol} score ${scan.score}/100 (${scan.signals.bearish} bearish signals)`,
          context: { 
            direction: scan.direction, 
            signals: scan.signals,
            price: scan.price 
          },
        };
      }
      break;
    }

    case 'scanner_score_above': {
      if (scan.score >= condition_value) {
        return {
          triggered: true,
          value: scan.score,
          threshold: condition_value,
          message: `📈 ${scan.symbol} score reached ${scan.score}/100 (threshold: ${condition_value})`,
          context: { direction: scan.direction, signals: scan.signals },
        };
      }
      break;
    }

    case 'scanner_score_below': {
      if (scan.score <= condition_value) {
        return {
          triggered: true,
          value: scan.score,
          threshold: condition_value,
          message: `📉 ${scan.symbol} score dropped to ${scan.score}/100 (threshold: ${condition_value})`,
          context: { direction: scan.direction, signals: scan.signals },
        };
      }
      break;
    }

    case 'scanner_bullish_flip': {
      // Trigger when direction flips from bearish/neutral to bullish
      if (scan.direction === 'bullish' && prevDirection && prevDirection !== 'bullish') {
        return {
          triggered: true,
          value: scan.score,
          message: `🐂 BULLISH FLIP: ${scan.symbol} turned bullish! Score: ${scan.score}/100 (was ${prevDirection})`,
          context: { 
            prevDirection, 
            newDirection: scan.direction,
            signals: scan.signals 
          },
        };
      }
      break;
    }

    case 'scanner_bearish_flip': {
      // Trigger when direction flips from bullish/neutral to bearish
      if (scan.direction === 'bearish' && prevDirection && prevDirection !== 'bearish') {
        return {
          triggered: true,
          value: scan.score,
          message: `🐻 BEARISH FLIP: ${scan.symbol} turned bearish! Score: ${scan.score}/100 (was ${prevDirection})`,
          context: { 
            prevDirection, 
            newDirection: scan.direction,
            signals: scan.signals 
          },
        };
      }
      break;
    }
  }

  return { triggered: false };
}

async function triggerSignalAlert(alert: SignalAlert, result: CheckResult, scan: ScanResult) {
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
      workspace_id, alert_id, symbol, condition_type, condition_value, 
      triggered_price, triggered_at, notification_sent
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
    [
      alert.workspace_id,
      alert.id,
      alert.symbol,
      alert.condition_type,
      result.value || 0,
      scan.price || 0,
      alert.notify_email || alert.notify_push
    ]
  );

  // Update alert
  if (alert.is_recurring) {
    await q(
      `UPDATE alerts 
       SET triggered_at = NOW(), 
           trigger_count = trigger_count + 1,
           last_derivative_value = $1,
           smart_alert_context = $2,
           last_checked_at = NOW()
       WHERE id = $3`,
      [scan.score, JSON.stringify(result.context), alert.id]
    );
  } else {
    // One-time alert - deactivate
    await q(
      `UPDATE alerts 
       SET triggered_at = NOW(), 
           trigger_count = trigger_count + 1, 
           is_active = false,
           last_derivative_value = $1,
           smart_alert_context = $2,
           last_checked_at = NOW()
       WHERE id = $3`,
      [scan.score, JSON.stringify(result.context), alert.id]
    );
  }

  // Send email notification
  if (alert.notify_email && userEmail) {
    try {
      await sendAlertEmail({
        to: userEmail,
        symbol: alert.symbol,
        alertName: alert.name || 'Signal Alert',
        message: result.message || `Scanner signal triggered: ${alert.condition_type.replace(/_/g, ' ')}`,
        value: result.value || scan.score,
        threshold: result.threshold || Number(alert.condition_value),
        alertType: 'smart',
      });
      console.log(`📧 Email sent for signal alert: ${alert.name || alert.condition_type}`);
    } catch (emailErr) {
      console.error('Failed to send signal alert email:', emailErr);
    }
  }

  // Send push notification
  if (alert.notify_push) {
    try {
      await sendPushToUser(alert.workspace_id, {
        title: `🎯 ${alert.name || 'Signal Alert'}`,
        body: result.message || `${alert.symbol}: ${alert.condition_type.replace(/_/g, ' ')}`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        tag: `signal-${alert.id}`,
        data: { url: '/tools/scanner', alertId: alert.id },
      });
      console.log(`🔔 Push sent for signal alert: ${alert.name || alert.condition_type}`);
    } catch (pushErr) {
      console.error('Failed to send signal alert push:', pushErr);
    }
  }

  console.log(`✅ Signal alert triggered: ${alert.name || alert.condition_type} for ${alert.symbol}`);
}
