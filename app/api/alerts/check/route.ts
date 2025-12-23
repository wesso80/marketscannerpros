import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';

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
  // Verify cron secret (optional security)
  const secret = req.headers.get('x-cron-secret');
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all active alerts
    const alerts = await q<Alert>(`
      SELECT id, workspace_id, symbol, asset_type, condition_type, 
             condition_value, is_recurring, notify_email, notify_push, name
      FROM alerts 
      WHERE is_active = true 
        AND (expires_at IS NULL OR expires_at > NOW())
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

    const triggered: string[] = [];
    const errors: string[] = [];

    // Check each symbol group
    for (const [key, groupAlerts] of Object.entries(symbolGroups)) {
      const [assetType, symbol] = key.split(':');
      
      try {
        // Fetch current price
        const price = await fetchPrice(symbol, assetType);
        if (price === null) {
          errors.push(`Failed to fetch price for ${symbol}`);
          continue;
        }

        // Check each alert for this symbol
        for (const alert of groupAlerts) {
          const shouldTrigger = checkCondition(alert, price);
          
          if (shouldTrigger) {
            await triggerAlert(alert, price);
            triggered.push(alert.id);
          } else {
            // Update last_price for tracking
            await q(
              `UPDATE alerts SET last_price = $1, last_checked_at = NOW() WHERE id = $2`,
              [price, alert.id]
            );
          }
        }
      } catch (err) {
        errors.push(`Error checking ${symbol}: ${err}`);
      }
    }

    return NextResponse.json({
      checked: alerts.length,
      triggered: triggered.length,
      triggeredIds: triggered,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Alert check error:', error);
    return NextResponse.json({ error: 'Failed to check alerts' }, { status: 500 });
  }
}

// Fetch current price based on asset type
async function fetchPrice(symbol: string, assetType: string): Promise<number | null> {
  try {
    if (assetType === 'crypto') {
      // Use Binance for crypto
      const res = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`,
        { next: { revalidate: 0 } }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return parseFloat(data.price);
    } else {
      // Use Alpha Vantage for stocks
      const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
      if (!apiKey) return null;
      
      const res = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      const price = data['Global Quote']?.['05. price'];
      return price ? parseFloat(price) : null;
    }
  } catch {
    return null;
  }
}

// Check if alert condition is met
function checkCondition(alert: Alert, currentPrice: number): boolean {
  const { condition_type, condition_value } = alert;
  
  switch (condition_type) {
    case 'price_above':
      return currentPrice >= condition_value;
    case 'price_below':
      return currentPrice <= condition_value;
    // TODO: percent_change requires historical price tracking
    default:
      return false;
  }
}

// Trigger an alert - record history and send notifications
async function triggerAlert(alert: Alert, triggerPrice: number) {
  const conditionMet = formatConditionMet(alert, triggerPrice);
  
  // Record in history
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
      true, // We'll mark as sent even if delivery fails for now
      alert.notify_email && alert.notify_push ? 'both' : alert.notify_email ? 'email' : 'push',
    ]
  );

  // Update alert status
  if (alert.is_recurring) {
    // Just update trigger count and timestamp
    await q(
      `UPDATE alerts 
       SET triggered_at = NOW(), trigger_count = trigger_count + 1, last_price = $1
       WHERE id = $2`,
      [triggerPrice, alert.id]
    );
  } else {
    // Deactivate non-recurring alert
    await q(
      `UPDATE alerts 
       SET is_active = false, triggered_at = NOW(), trigger_count = trigger_count + 1, last_price = $1
       WHERE id = $2`,
      [triggerPrice, alert.id]
    );
  }

  // Update daily trigger count
  await q(
    `UPDATE alert_quotas 
     SET total_triggers_today = total_triggers_today + 1
     WHERE workspace_id = $1`,
    [alert.workspace_id]
  );

  // TODO: Send actual notifications
  // - Push notification via web push or service like OneSignal
  // - Email via SendGrid/Resend
  console.log(`🔔 Alert triggered: ${alert.name} - ${conditionMet}`);
}

function formatConditionMet(alert: Alert, price: number): string {
  const formattedPrice = price >= 1 ? price.toFixed(2) : price.toFixed(6);
  
  switch (alert.condition_type) {
    case 'price_above':
      return `${alert.symbol} crossed above $${alert.condition_value} (now $${formattedPrice})`;
    case 'price_below':
      return `${alert.symbol} dropped below $${alert.condition_value} (now $${formattedPrice})`;
    default:
      return `${alert.symbol} alert triggered at $${formattedPrice}`;
  }
}
