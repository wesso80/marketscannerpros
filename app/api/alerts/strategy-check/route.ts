import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { sendAlertEmail } from '@/lib/email';
import { sendPushToUser } from '@/lib/pushServer';
import { DEFAULT_BACKTEST_STRATEGY, isBacktestStrategy } from '@/lib/strategies/registry';

/**
 * Backtest Strategy Alerts Checker
 * 
 * Checks for buy/sell signals from backtest strategies
 * Should be called by cron every 15 minutes
 * 
 * GET/POST /api/alerts/strategy-check
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
    console.warn('[strategy-check] ensureSmartAlertSchema warning:', e);
  }
}

interface StrategyAlert {
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
  smart_alert_context: {
    strategy?: string;
    timeframe?: string;
  } | null;
}

interface BacktestSignal {
  hasSignal: boolean;
  signalType: 'buy' | 'sell' | 'none';
  strategy: string;
  price: number;
  lastTrade?: {
    side: string;
    entry: number;
    exit: number;
    returnPercent: number;
  };
}

export async function GET(req: NextRequest) {
  return checkStrategyAlerts(req);
}

export async function POST(req: NextRequest) {
  return checkStrategyAlerts(req);
}

async function checkStrategyAlerts(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureSmartAlertSchema();

    // Get all active strategy alerts
    const alerts = await q<StrategyAlert>(`
      SELECT id, workspace_id, symbol, condition_type, condition_value,
             is_recurring, notify_email, notify_push, name, cooldown_minutes, 
             triggered_at, smart_alert_context
      FROM alerts 
      WHERE is_active = true 
        AND is_smart_alert = true
        AND condition_type IN (
          'strategy_buy_signal', 'strategy_sell_signal',
          'strategy_entry', 'strategy_exit'
        )
        AND (expires_at IS NULL OR expires_at > NOW())
    `);

    if (alerts.length === 0) {
      return NextResponse.json({ checked: 0, triggered: 0, message: 'No active strategy alerts' });
    }

    // Group alerts by symbol+strategy to minimize API calls
    const alertGroups = new Map<string, StrategyAlert[]>();
    for (const alert of alerts) {
      const rawStrategy = alert.smart_alert_context?.strategy;
      const strategy = rawStrategy && isBacktestStrategy(rawStrategy)
        ? rawStrategy
        : DEFAULT_BACKTEST_STRATEGY;
      const timeframe = alert.smart_alert_context?.timeframe || 'daily';
      const key = `${alert.symbol}|${strategy}|${timeframe}`;
      if (!alertGroups.has(key)) {
        alertGroups.set(key, []);
      }
      alertGroups.get(key)!.push(alert);
    }

    const host = req.headers.get('host') || 'localhost:5000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    const triggered: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    // Calculate date range (last 30 days for signal detection)
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    for (const [key, alertsForGroup] of alertGroups) {
      const [symbol, strategy, timeframe] = key.split('|');

      try {
        // Run backtest for this symbol/strategy to get current signals
        const btHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (process.env.CRON_SECRET) btHeaders['x-cron-secret'] = process.env.CRON_SECRET;

        const backtestRes = await fetch(`${baseUrl}/api/backtest`, {
          method: 'POST',
          headers: btHeaders,
          body: JSON.stringify({
            symbol,
            strategy,
            startDate,
            endDate,
            initialCapital: 10000,
            timeframe
          }),
          cache: 'no-store'
        });

        if (!backtestRes.ok) {
          errors.push(`Backtest failed for ${symbol}/${strategy}: ${backtestRes.status}`);
          continue;
        }

        const backtestData = await backtestRes.json();
        const trades = backtestData.trades || [];
        const lastTrade = trades[trades.length - 1];

        // Detect current signal based on recent trades
        const signal = detectCurrentSignal(trades, endDate);

        // Check each alert for this group
        for (const alert of alertsForGroup) {
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

            let shouldTrigger = false;
            let alertMessage = '';

            switch (alert.condition_type) {
              case 'strategy_buy_signal':
                if (signal.signalType === 'buy') {
                  shouldTrigger = true;
                  alertMessage = `🟢 BUY SIGNAL: ${strategy.toUpperCase()} triggered on ${symbol} at $${signal.price.toFixed(2)}`;
                }
                break;

              case 'strategy_sell_signal':
                if (signal.signalType === 'sell') {
                  shouldTrigger = true;
                  alertMessage = `🔴 SELL SIGNAL: ${strategy.toUpperCase()} triggered on ${symbol} at $${signal.price.toFixed(2)}`;
                }
                break;

              case 'strategy_entry':
                if (signal.hasSignal && signal.signalType === 'buy') {
                  shouldTrigger = true;
                  alertMessage = `📈 ENTRY SIGNAL: ${strategy.toUpperCase()} suggests entering ${symbol} at $${signal.price.toFixed(2)}`;
                }
                break;

              case 'strategy_exit':
                if (signal.hasSignal && signal.signalType === 'sell' && lastTrade) {
                  shouldTrigger = true;
                  const pnl = lastTrade.returnPercent >= 0 ? `+${lastTrade.returnPercent.toFixed(2)}%` : `${lastTrade.returnPercent.toFixed(2)}%`;
                  alertMessage = `📉 EXIT SIGNAL: ${strategy.toUpperCase()} suggests exiting ${symbol} (Last trade: ${pnl})`;
                }
                break;
            }

            if (shouldTrigger) {
              // Update alert as triggered
              await q(`
                UPDATE alerts 
                SET triggered_at = NOW(), 
                    trigger_count = trigger_count + 1,
                    last_price = $2,
                    is_active = CASE WHEN is_recurring THEN true ELSE false END
                WHERE id = $1
              `, [alert.id, signal.price]);

              // Record in alert history
              await q(`
                INSERT INTO alert_history (workspace_id, alert_id, symbol, condition_type, condition_value, triggered_price, notification_sent, notification_type)
                VALUES ($1, $2, $3, $4, $5, $6, true, 'strategy')
              `, [alert.workspace_id, alert.id, symbol, alert.condition_type, alert.condition_value, signal.price]);

              // Send notifications
              const alertName = alert.name || `${strategy} Alert`;
              
              if (alert.notify_email) {
                try {
                  // Get user email
                  const users = await q<{ email: string }>(`
                    SELECT email FROM user_subscriptions WHERE workspace_id = $1
                  `, [alert.workspace_id]);
                  
                  if (users[0]?.email) {
                    await sendAlertEmail({
                      to: users[0].email,
                      alertName,
                      symbol,
                      message: alertMessage,
                      alertType: 'smart'
                    });
                  }
                } catch (emailErr) {
                  console.error('Email notification failed:', emailErr);
                }
              }

              if (alert.notify_push) {
                try {
                  await sendPushToUser(alert.workspace_id, {
                    title: `⚡ ${alertName}`,
                    body: alertMessage,
                    tag: `strategy-${alert.id}`,
                    data: { type: 'strategy_alert', symbol, strategy }
                  });
                } catch (pushErr) {
                  console.error('Push notification failed:', pushErr);
                }
              }

              triggered.push(alert.id);
            }
          } catch (alertErr) {
            errors.push(`Alert ${alert.id} error: ${alertErr}`);
          }
        }
      } catch (groupErr) {
        errors.push(`Group ${key} error: ${groupErr}`);
      }
    }

    return NextResponse.json({
      checked: alerts.length,
      triggered: triggered.length,
      skipped: skipped.length,
      errors: errors.length,
      triggeredIds: triggered,
      errorDetails: errors.slice(0, 5) // Limit error output
    });

  } catch (error: any) {
    console.error('Strategy check error:', error);
    // Return 200 with error details — prevents cron exit-22 for transient failures
    return NextResponse.json({
      ok: false,
      checked: 0,
      triggered: 0,
      error: error?.message || 'Strategy check failed',
      timestamp: new Date().toISOString(),
    });
  }
}

// Detect if there's a current signal based on recent trades
function detectCurrentSignal(trades: any[], today: string): BacktestSignal {
  if (!trades || trades.length === 0) {
    return { hasSignal: false, signalType: 'none', strategy: '', price: 0 };
  }

  const lastTrade = trades[trades.length - 1];
  const lastExitDate = lastTrade.exitDate?.split(' ')[0] || lastTrade.exitDate;
  const lastEntryDate = lastTrade.entryDate?.split(' ')[0] || lastTrade.entryDate;

  // Check if the last trade is very recent (within 1 day for daily, same day for intraday)
  const todayDate = new Date(today);
  const exitDate = new Date(lastExitDate);
  const entryDate = new Date(lastEntryDate);
  const daysDiff = Math.abs(todayDate.getTime() - exitDate.getTime()) / (1000 * 60 * 60 * 24);

  // Recent exit = sell signal
  if (daysDiff <= 1 && lastTrade.exit) {
    return {
      hasSignal: true,
      signalType: 'sell',
      strategy: '',
      price: lastTrade.exit,
      lastTrade: {
        side: lastTrade.side,
        entry: lastTrade.entry,
        exit: lastTrade.exit,
        returnPercent: lastTrade.returnPercent
      }
    };
  }

  // Check for recent entry
  const entryDaysDiff = Math.abs(todayDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24);
  if (entryDaysDiff <= 1) {
    return {
      hasSignal: true,
      signalType: 'buy',
      strategy: '',
      price: lastTrade.entry,
      lastTrade: {
        side: lastTrade.side,
        entry: lastTrade.entry,
        exit: lastTrade.exit || 0,
        returnPercent: lastTrade.returnPercent || 0
      }
    };
  }

  // Look at second-to-last trade for patterns
  if (trades.length >= 2) {
    const prevTrade = trades[trades.length - 2];
    
    // If there's a gap, might indicate new signal forming
    if (lastTrade.side === 'LONG' && prevTrade.returnPercent > 0) {
      // Winning streak - potential continuation
      return {
        hasSignal: true,
        signalType: 'buy',
        strategy: '',
        price: lastTrade.exit || lastTrade.entry,
        lastTrade
      };
    }
  }

  return { hasSignal: false, signalType: 'none', strategy: '', price: lastTrade.exit || lastTrade.entry || 0 };
}
