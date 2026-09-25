import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { q } from '@/lib/db';
import { describeConditionMet, parseGlobalQuote, type AlertQuote } from '@/lib/alerts/priceConditions';
import { sendAlertEmail } from '@/lib/email';
import { sendPushToUser, PushTemplates } from '@/lib/pushServer';
import { getPriceBySymbol } from '@/lib/coingecko';
import { avTakeToken } from '@/lib/avRateGovernor';
import { decideAlert, isStaleStockQuote } from '@/lib/alerts/alertTiming';

/**
 * Alert Price Checker
 * 
 * This endpoint checks all active alerts against current prices
 * and triggers notifications when conditions are met.
 * 
 * Should be called by a cron job every 1-5 minutes.
 * 
 * POST /api/alerts/check
 * Headers: x-cron-secret: <CRON_SECRET>
 */

const CRON_SECRET = process.env.CRON_SECRET;

interface Alert {
  id: string;
  workspace_id: string;
  symbol: string;
  asset_type: string;
  condition_type: string;
  condition_value: number;
  is_recurring: boolean;
  notify_email: boolean;
  notify_push: boolean;
  name: string;
  last_price: number | string | null;
  triggered_at: string | Date | null;
  cooldown_minutes: number | null;
}

// GET - also runs the check (for cron services that only support GET)
export async function GET(req: NextRequest) {
  return checkAlerts(req);
}

// POST - main check endpoint
export async function POST(req: NextRequest) {
  return checkAlerts(req);
}

async function checkAlerts(req: NextRequest) {
  // Verify cron secret (timing-safe comparison)
  const secret = req.headers.get('x-cron-secret') || '';
  if (CRON_SECRET) {
    const a = Buffer.from(secret);
    const b = Buffer.from(CRON_SECRET);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // Get all active alerts (exclude smart alerts - they have their own check routes)
    const alerts = await q<Alert>(`
      SELECT id, workspace_id, symbol, asset_type, condition_type, 
             condition_value, is_recurring, notify_email, notify_push, name,
             last_price, triggered_at, cooldown_minutes
      FROM alerts 
      WHERE is_active = true 
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (is_smart_alert = false OR is_smart_alert IS NULL)
        AND condition_type IN ('price_above', 'price_below', 'percent_change_up', 'percent_change_down')
    `);

    if (alerts.length === 0) {
      return NextResponse.json({ checked: 0, triggered: 0 });
    }

    // Group alerts by symbol to minimize API calls
    const symbolGroups: Record<string, Alert[]> = {};
    for (const alert of alerts) {
      const key = `${alert.asset_type}:${alert.symbol}`;
      if (!symbolGroups[key]) symbolGroups[key] = [];
      symbolGroups[key].push(alert);
    }

    console.log(`[Alert Check] Found ${alerts.length} active alerts across ${Object.keys(symbolGroups).length} symbols`);

    const triggered: string[] = [];
    const errors: string[] = [];
    const skippedStale: string[] = [];

    // Check each symbol group
    for (const [key, groupAlerts] of Object.entries(symbolGroups)) {
      const [assetType, symbol] = key.split(':');
      
      try {
        // Fetch current price (and the % change the same quote reports)
        const quote = await fetchQuote(symbol, assetType);
        console.log(`[Alert Check] ${symbol} price: ${quote?.price ?? null} change: ${quote?.changePercent ?? null}%`);
        
        if (quote === null) {
          errors.push(`Failed to fetch price for ${symbol}`);
          continue;
        }
        const price = quote.price;

        // A stock quote from before the latest session that has opened is stale: fire nothing on it (TR-17).
        if (assetType !== 'crypto' && isStaleStockQuote(quote)) {
          skippedStale.push(`${symbol} (quote from ${quote.asOfDate})`);
          continue;
        }

        // Check each alert for this symbol: condition met, plus cross / cooldown / once-per-period rules (TR-17)
        for (const alert of groupAlerts) {
          const decision = decideAlert(alert, quote);
          const shouldTrigger = decision.fire;
          console.log(`[Alert Check] ${alert.symbol} ${alert.condition_type} ${alert.condition_value} vs ${price} (${quote.changePercent ?? 'n/a'}%) = ${decision.fire ? 'TRIGGER' : `no (${decision.reason})`}`);
          
          if (shouldTrigger) {
            try {
              await triggerAlert(alert, quote);
              triggered.push(alert.id);
              console.log(`[Alert Check] ✅ Alert ${alert.id} triggered successfully`);
            } catch (triggerErr) {
              console.error(`[Alert Check] ❌ Failed to trigger alert ${alert.id}:`, triggerErr);
              errors.push(`Failed to trigger ${alert.symbol}: ${triggerErr}`);
            }
          } else {
            // Update last_price for tracking
            await q(
              `UPDATE alerts SET last_price = $1, last_checked_at = NOW() WHERE id = $2`,
              [price, alert.id]
            );
          }
        }
      } catch (err) {
        console.error(`[Alert Check] Error checking ${symbol}:`, err);
        errors.push(`Error checking ${symbol}: ${err}`);
      }
    }

    return NextResponse.json({
      checked: alerts.length,
      triggered: triggered.length,
      triggeredIds: triggered,
      skippedStale: skippedStale.length > 0 ? skippedStale : undefined,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Alert check error:', error);
    // Return 200 with error details — prevents cron exit-22 for transient failures
    return NextResponse.json({
      ok: false,
      checked: 0,
      triggered: 0,
      error: error?.message || 'Failed to check alerts',
      timestamp: new Date().toISOString(),
    });
  }
}

// Fetch current price and % change based on asset type
async function fetchQuote(symbol: string, assetType: string): Promise<AlertQuote | null> {
  try {
    if (assetType === 'crypto') {
      // Use CoinGecko commercial API for crypto prices (24h change comes with the same call)
      const result = await getPriceBySymbol(symbol);
      if (!result || !Number.isFinite(result.price)) return null;
      return { price: result.price, changePercent: Number.isFinite(result.change24h) ? result.change24h : null };
    } else {
      // Use Alpha Vantage for stocks
      const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
      if (!apiKey) return null;
      
      await avTakeToken();
      const res = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&entitlement=realtime&apikey=${apiKey}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      // Handles both realtime and delayed response formats; % change is vs previous close
      return parseGlobalQuote(data);
    }
  } catch {
    return null;
  }
}

// Trigger an alert - record history and send notifications
async function triggerAlert(alert: Alert, quote: AlertQuote) {
  const triggerPrice = quote.price;
  console.log(`[Alert] Triggering alert ${alert.id} for ${alert.symbol} at $${triggerPrice}`);
  
  const conditionMet = describeConditionMet(alert.symbol, alert.condition_type, alert.condition_value, quote, alert.asset_type);
  const isPercentAlert = alert.condition_type.startsWith('percent_change_');
  
  // Get user email for notifications
  let userEmail: string | null = null;
  if (alert.notify_email) {
    try {
      const userResult = await q<{ email: string }>(
        `SELECT email FROM user_subscriptions WHERE workspace_id = $1`,
        [alert.workspace_id]
      );
      userEmail = userResult[0]?.email || null;
      console.log(`[Alert] User email: ${userEmail || 'not found'}`);
    } catch (e) {
      console.error(`[Alert] Failed to get user email:`, e);
    }
  }
  
  // Record in history (optional - don't fail if table doesn't exist)
  try {
    await q(
      `INSERT INTO alert_history (
        alert_id, workspace_id, triggered_at, trigger_price, condition_met,
        symbol, condition_type, condition_value, notification_sent, notification_channel
      ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9)`,
      [
        alert.id,
        alert.workspace_id,
        triggerPrice,
        conditionMet,
        alert.symbol,
        alert.condition_type,
        alert.condition_value,
        !!userEmail,
        alert.notify_email && alert.notify_push ? 'both' : alert.notify_email ? 'email' : 'push',
      ]
    );
  } catch (historyError) {
    console.error(`[Alert] Failed to record history (non-fatal):`, historyError);
  }

  // Update alert status - THIS IS CRITICAL
  try {
    if (alert.is_recurring) {
      await q(
        `UPDATE alerts 
         SET triggered_at = NOW(), trigger_count = trigger_count + 1, last_price = $1, last_checked_at = NOW()
         WHERE id = $2`,
        [triggerPrice, alert.id]
      );
    } else {
      await q(
        `UPDATE alerts 
         SET is_active = false, triggered_at = NOW(), trigger_count = trigger_count + 1, last_price = $1, last_checked_at = NOW()
         WHERE id = $2`,
        [triggerPrice, alert.id]
      );
    }
    console.log(`[Alert] Updated alert status for ${alert.id}`);
  } catch (updateError) {
    console.error(`[Alert] CRITICAL - Failed to update alert status:`, updateError);
    throw updateError; // Re-throw so we know something is wrong
  }

  // Update daily trigger count (optional - don't fail if no quota row)
  try {
    await q(
      `INSERT INTO alert_quotas (workspace_id, tier, total_triggers_today)
       VALUES ($1, 'free', 1)
       ON CONFLICT (workspace_id) 
       DO UPDATE SET total_triggers_today = alert_quotas.total_triggers_today + 1`,
      [alert.workspace_id]
    );
  } catch (quotaError) {
    console.error(`[Alert] Failed to update quota (non-fatal):`, quotaError);
  }

  // Send email notification
  if (alert.notify_email && userEmail) {
    try {
      const formattedPrice = triggerPrice >= 1 ? triggerPrice.toFixed(2) : triggerPrice.toFixed(6);
      await sendAlertEmail({
        to: userEmail,
        subject: `🔔 Price Alert: ${alert.symbol} - ${alert.name || conditionMet}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f172a; color: #fff;">
            <h1 style="color: #10b981; margin-bottom: 20px;">🔔 Price Alert Triggered</h1>
            
            <div style="background: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
              <h2 style="color: #fff; margin: 0 0 10px 0; font-size: 24px;">${alert.symbol}</h2>
              <p style="color: #94a3b8; margin: 0 0 15px 0;">${alert.name || 'Price Alert'}</p>
              
              <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                <div>
                  <span style="color: #64748b; font-size: 12px;">CURRENT PRICE</span>
                  <p style="color: #10b981; font-size: 28px; font-weight: bold; margin: 5px 0;">$${formattedPrice}</p>
                </div>
                <div>
                  <span style="color: #64748b; font-size: 12px;">TARGET</span>
                  <p style="color: #fff; font-size: 28px; font-weight: bold; margin: 5px 0;">${isPercentAlert ? `${alert.condition_type === 'percent_change_down' ? '-' : '+'}${Math.abs(Number(alert.condition_value))}%` : `$${alert.condition_value}`}</p>
                </div>
              </div>
              
              <p style="color: #fbbf24; margin-top: 15px; font-size: 14px;">
                ${conditionMet}
              </p>
            </div>
            
            <a href="https://marketscannerpros.app/tools/workspace?tab=alerts"
               style="display: inline-block; background: #10b981; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              View All Alerts →
            </a>
            
            <p style="color: #64748b; font-size: 12px; margin-top: 30px;">
              ${alert.is_recurring ? '🔄 This is a recurring alert and will trigger again.' : 'This alert has been automatically deactivated.'}
            </p>
            
            <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;" />
            <p style="color: #64748b; font-size: 11px;">
              MarketScanner Pros • <a href="https://marketscannerpros.app/tools/workspace?tab=alerts" style="color: #64748b;">Manage Alerts</a>
            </p>
          </div>
        `,
      });
      console.log(`📧 Alert email sent to ${userEmail}: ${alert.symbol}`);
    } catch (emailError) {
      console.error(`Failed to send alert email:`, emailError);
    }
  }

  // Send push notification
  if (alert.notify_push) {
    try {
      await sendPushToUser(alert.workspace_id, {
        title: `📊 ${alert.symbol} Alert`,
        body: conditionMet,
        tag: `price-alert-${alert.symbol}`,
        data: {
          url: '/tools/scanner',
          type: 'price_alert',
          symbol: alert.symbol,
          alertId: alert.id
        }
      });
      console.log(`🔔 Push notification sent for: ${alert.symbol}`);
    } catch (pushError) {
      console.error(`Failed to send push notification:`, pushError);
    }
  }

  // A user's alert is private: it is delivered only to that user's own channels
  // (email / push above). It is not posted to the shared site-wide Discord channel.

  console.log(`🔔 Alert triggered: ${alert.name || alert.symbol} - ${conditionMet}`);
}
