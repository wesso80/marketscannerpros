import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { getPriceBySymbol } from '@/lib/coingecko';

/**
 * Debug endpoint for checking alert status
 * Shows current prices vs alert thresholds
 */

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get user's alerts
    const alerts = await q(`
      SELECT id, symbol, asset_type, condition_type, condition_value, 
             is_active, is_recurring, triggered_at, trigger_count, 
             last_price, last_checked_at, notify_push
      FROM alerts 
      WHERE workspace_id = $1
      ORDER BY created_at DESC
    `, [session.workspaceId]);

    // Get push subscriptions
    const pushSubs = await q(`
      SELECT id, endpoint, created_at 
      FROM push_subscriptions 
      WHERE workspace_id = $1
    `, [session.workspaceId]);

    // Check current prices for each unique symbol
    const symbolsChecked: Record<string, any> = {};
    
    for (const alert of alerts) {
      const key = `${alert.asset_type}:${alert.symbol}`;
      if (!symbolsChecked[key]) {
        try {
          if (alert.asset_type === 'crypto') {
            const priceData = await getPriceBySymbol(alert.symbol);
            symbolsChecked[key] = {
              symbol: alert.symbol,
              currentPrice: priceData?.price ?? null,
              error: priceData ? null : 'Failed to fetch price'
            };
          } else {
            symbolsChecked[key] = {
              symbol: alert.symbol,
              currentPrice: null,
              error: 'Stock price check skipped in debug'
            };
          }
        } catch (e: any) {
          symbolsChecked[key] = {
            symbol: alert.symbol,
            currentPrice: null,
            error: e.message
          };
        }
      }
    }

    // Annotate alerts with current prices and trigger status
    const alertsWithStatus = alerts.map((alert: any) => {
      const priceInfo = symbolsChecked[`${alert.asset_type}:${alert.symbol}`];
      const currentPrice = priceInfo?.currentPrice;
      
      let wouldTrigger = false;
      if (currentPrice !== null) {
        if (alert.condition_type === 'price_above') {
          wouldTrigger = currentPrice >= alert.condition_value;
        } else if (alert.condition_type === 'price_below') {
          wouldTrigger = currentPrice <= alert.condition_value;
        }
      }

      return {
        id: alert.id,
        symbol: alert.symbol,
        condition: `${alert.condition_type} ${alert.condition_value}`,
        isActive: alert.is_active,
        isRecurring: alert.is_recurring,
        notifyPush: alert.notify_push,
        currentPrice,
        wouldTrigger,
        triggerCount: alert.trigger_count,
        lastTriggered: alert.triggered_at,
        lastChecked: alert.last_checked_at,
        lastPrice: alert.last_price
      };
    });

    // Check VAPID configuration
    const vapidConfigured = !!(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY
    );

    return NextResponse.json({
      workspaceId: session.workspaceId,
      totalAlerts: alerts.length,
      activeAlerts: alerts.filter((a: any) => a.is_active).length,
      pushSubscriptions: pushSubs.length,
      vapidConfigured,
      alerts: alertsWithStatus,
      prices: Object.values(symbolsChecked),
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Alert debug error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
