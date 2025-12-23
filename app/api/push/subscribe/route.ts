import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

/**
 * Push Notification Subscription API
 * 
 * POST - Subscribe to push notifications
 * DELETE - Unsubscribe from push notifications
 * GET - Check subscription status
 */

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { endpoint, keys } = body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 });
    }

    // Store subscription in database
    await q(`
      INSERT INTO push_subscriptions (workspace_id, endpoint, p256dh_key, auth_key, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (workspace_id, endpoint) 
      DO UPDATE SET p256dh_key = $3, auth_key = $4, updated_at = NOW()
    `, [session.workspaceId, endpoint, keys.p256dh, keys.auth]);

    return NextResponse.json({ 
      success: true, 
      message: 'Push subscription saved' 
    });

  } catch (error: any) {
    console.error('[push] Error saving subscription:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const endpoint = searchParams.get('endpoint');

    if (endpoint) {
      // Delete specific subscription
      await q(`
        DELETE FROM push_subscriptions 
        WHERE workspace_id = $1 AND endpoint = $2
      `, [session.workspaceId, endpoint]);
    } else {
      // Delete all subscriptions for this user
      await q(`
        DELETE FROM push_subscriptions 
        WHERE workspace_id = $1
      `, [session.workspaceId]);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Push subscription removed' 
    });

  } catch (error: any) {
    console.error('[push] Error removing subscription:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const subscriptions = await q(`
      SELECT endpoint, created_at, updated_at
      FROM push_subscriptions 
      WHERE workspace_id = $1
    `, [session.workspaceId]);

    return NextResponse.json({ 
      subscribed: subscriptions.length > 0,
      count: subscriptions.length,
      subscriptions: subscriptions.map((s: any) => ({
        endpoint: s.endpoint.substring(0, 50) + '...',
        createdAt: s.created_at,
        updatedAt: s.updated_at
      }))
    });

  } catch (error: any) {
    console.error('[push] Error checking subscription:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
