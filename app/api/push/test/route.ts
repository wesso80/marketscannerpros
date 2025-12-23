import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import webpush from 'web-push';

/**
 * Push Notification Test API
 * Allows users to test their push notification setup
 * 
 * POST - Send a test push notification to current user
 */

// Configure web-push with VAPID keys
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:support@marketscannerpros.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return NextResponse.json({ 
        error: 'Push notifications not configured on server',
        hint: 'VAPID keys need to be set in environment variables'
      }, { status: 500 });
    }

    // Get user's subscriptions
    const subscriptions = await q(`
      SELECT id, endpoint, p256dh_key, auth_key
      FROM push_subscriptions 
      WHERE workspace_id = $1
    `, [session.workspaceId]);

    if (subscriptions.length === 0) {
      return NextResponse.json({ 
        error: 'No push subscriptions found',
        hint: 'Enable push notifications first'
      }, { status: 400 });
    }

    const testPayload = {
      title: '🔔 Test Notification',
      body: 'Push notifications are working! You\'ll receive alerts here.',
      icon: '/logo.png',
      badge: '/badge.png',
      tag: 'test-notification',
      data: {
        url: '/tools/scanner',
        type: 'test'
      }
    };

    const results = {
      sent: 0,
      failed: 0
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
          JSON.stringify(testPayload),
          {
            TTL: 60 * 60, // 1 hour
            urgency: 'normal'
          }
        );

        results.sent++;
      } catch (error: any) {
        console.error(`[push test] Error sending to subscription:`, error.statusCode);
        results.failed++;

        // Remove invalid subscriptions
        if (error.statusCode === 410 || error.statusCode === 404) {
          await q(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id]);
        }
      }
    }

    return NextResponse.json({ 
      success: results.sent > 0,
      message: results.sent > 0 
        ? `Test notification sent to ${results.sent} device(s)`
        : 'Failed to send test notification',
      results
    });

  } catch (error: any) {
    console.error('[push test] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
