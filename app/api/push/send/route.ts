import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import webpush from 'web-push';

/**
 * Push Notification Send API
 * Internal use only - called by alert triggers
 * 
 * POST - Send push notification to user
 */

// Configure web-push with VAPID keys
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:support@marketscannerpros.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export interface PushPayload {
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
  };
}

export async function POST(req: NextRequest) {
  try {
    // Verify internal call (from alert system)
    const authHeader = req.headers.get('authorization');
    const internalKey = authHeader?.replace('Bearer ', '');
    
    if (internalKey !== process.env.INTERNAL_API_KEY && internalKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return NextResponse.json({ 
        error: 'Push notifications not configured',
        hint: 'Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars'
      }, { status: 500 });
    }

    const body = await req.json();
    const { workspaceId, payload } = body as { workspaceId: string; payload: PushPayload };

    if (!workspaceId || !payload) {
      return NextResponse.json({ error: 'Missing workspaceId or payload' }, { status: 400 });
    }

    // Get all subscriptions for this user
    const subscriptions = await q(`
      SELECT id, endpoint, p256dh_key, auth_key
      FROM push_subscriptions 
      WHERE workspace_id = $1
    `, [workspaceId]);

    if (subscriptions.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: 'No push subscriptions found for user' 
      });
    }

    const results = {
      sent: 0,
      failed: 0,
      removed: 0
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
          JSON.stringify(payload),
          {
            TTL: 60 * 60 * 24, // 24 hours
            urgency: 'high'
          }
        );

        results.sent++;
      } catch (error: any) {
        console.error(`[push] Error sending to ${sub.endpoint}:`, error.statusCode);
        results.failed++;

        // Remove invalid subscriptions (410 Gone or 404 Not Found)
        if (error.statusCode === 410 || error.statusCode === 404) {
          await q(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id]);
          results.removed++;
        }
      }
    }

    return NextResponse.json({ 
      success: true,
      results
    });

  } catch (error: any) {
    console.error('[push] Error sending notification:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
