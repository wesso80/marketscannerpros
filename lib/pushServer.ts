import webpush from 'web-push';
import { q } from './db';

/**
 * Server-side Push Notification Utility
 * Use this to send push notifications from API routes
 */

// Configure web-push with VAPID keys
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL_RAW = process.env.VAPID_EMAIL || 'support@marketscannerpros.app';
const VAPID_EMAIL = VAPID_EMAIL_RAW.startsWith('mailto:') ? VAPID_EMAIL_RAW : `mailto:${VAPID_EMAIL_RAW}`;

let isConfigured = false;

function ensureConfigured() {
  if (!isConfigured && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    isConfigured = true;
  }
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    url?: string;
    alertId?: string;
    symbol?: string;
    type?: string;
    [key: string]: any;
  };
}

export interface SendPushResult {
  success: boolean;
  sent: number;
  failed: number;
  removed: number;
}

/**
 * Send push notification to a specific user
 */
export async function sendPushToUser(
  workspaceId: string, 
  payload: PushNotificationPayload
): Promise<SendPushResult> {
  ensureConfigured();
  
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[push] VAPID keys not configured');
    return { success: false, sent: 0, failed: 0, removed: 0 };
  }

  // Get all subscriptions for this user
  const subscriptions = await q(`
    SELECT id, endpoint, p256dh_key, auth_key
    FROM push_subscriptions 
    WHERE workspace_id = $1
  `, [workspaceId]);

  if (subscriptions.length === 0) {
    return { success: false, sent: 0, failed: 0, removed: 0 };
  }

  const results = {
    success: false,
    sent: 0,
    failed: 0,
    removed: 0
  };

  // Add defaults to payload
  const fullPayload = {
    icon: '/logo.png',
    badge: '/badge.png',
    ...payload
  };

  // Send to all subscriptions
  for (const sub of subscriptions) {
    try {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh_key,
          auth: sub.auth_key
        }
      };

      await webpush.sendNotification(
        pushSubscription,
        JSON.stringify(fullPayload),
        {
          TTL: 60 * 60 * 24, // 24 hours
          urgency: 'high'
        }
      );

      results.sent++;
    } catch (error: any) {
      console.error(`[push] Error sending to ${sub.endpoint.slice(0, 50)}:`, error.statusCode);
      results.failed++;

      // Remove invalid subscriptions (410 Gone or 404 Not Found)
      if (error.statusCode === 410 || error.statusCode === 404) {
        await q(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id]);
        results.removed++;
      }
    }
  }

  results.success = results.sent > 0;
  return results;
}

/**
 * Send push notification to multiple users
 */
export async function sendPushToUsers(
  workspaceIds: string[], 
  payload: PushNotificationPayload
): Promise<{ total: number; successful: number }> {
  const results = { total: workspaceIds.length, successful: 0 };
  
  for (const workspaceId of workspaceIds) {
    const result = await sendPushToUser(workspaceId, payload);
    if (result.success) results.successful++;
  }
  
  return results;
}

/**
 * Pre-built notification templates
 */
export const PushTemplates = {
  priceAlert: (symbol: string, condition: string, price: number) => ({
    title: `📊 Price Alert: ${symbol}`,
    body: `${symbol} ${condition} $${price.toLocaleString()}`,
    tag: `price-alert-${symbol}`,
    data: { url: '/tools/scanner', type: 'price_alert', symbol }
  }),
  
  oiAlert: (symbol: string, change: number) => ({
    title: `📈 OI Alert: ${symbol}`,
    body: `${symbol} Open Interest ${change > 0 ? 'surged' : 'dropped'} ${Math.abs(change).toFixed(1)}%`,
    tag: `oi-alert-${symbol}`,
    data: { url: '/tools/scanner', type: 'oi_alert', symbol }
  }),
  
  fundingAlert: (symbol: string, rate: number) => ({
    title: `⚠️ Funding Alert: ${symbol}`,
    body: `${symbol} funding rate ${rate > 0 ? 'high' : 'negative'}: ${(rate * 100).toFixed(4)}%`,
    tag: `funding-alert-${symbol}`,
    data: { url: '/tools/scanner', type: 'funding_alert', symbol }
  }),
  
  fearGreedAlert: (index: number, level: string) => ({
    title: `🎭 Market Sentiment: ${level}`,
    body: `Fear & Greed Index at ${index} (${level})`,
    tag: 'fear-greed-alert',
    data: { url: '/tools/scanner', type: 'fear_greed_alert' }
  }),
  
  portfolioAlert: (symbol: string, pnlPercent: number) => ({
    title: pnlPercent > 0 ? `🚀 ${symbol} Gain` : `⚠️ ${symbol} Loss`,
    body: `Your ${symbol} position is ${pnlPercent > 0 ? 'up' : 'down'} ${Math.abs(pnlPercent).toFixed(1)}%`,
    tag: `portfolio-${symbol}`,
    data: { url: '/tools/portfolio', type: 'portfolio_alert', symbol }
  }),
  
  scannerAlert: (count: number, assetType: string) => ({
    title: '🔍 New Scanner Signals',
    body: `${count} ${assetType} symbols match your criteria`,
    tag: 'scanner-alert',
    data: { url: '/tools/scanner', type: 'scanner_alert' }
  })
};
