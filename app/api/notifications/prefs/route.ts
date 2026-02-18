import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { ensureNotificationSchema } from '@/lib/notifications/tradeEvents';

type NotificationPrefsRow = {
  in_app_enabled: boolean;
  email_enabled: boolean;
  email_to: string | null;
  discord_enabled: boolean;
  discord_webhook_url: string | null;
};

function toSafeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (!/^\S+@\S+\.\S+$/.test(email)) return null;
  return email.slice(0, 320);
}

function toSafeWebhook(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const webhook = value.trim();
  if (!webhook) return null;
  if (!/^https:\/\//i.test(webhook)) return null;
  return webhook.slice(0, 1000);
}

export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureNotificationSchema();

    const rows = await q<NotificationPrefsRow>(
      `SELECT in_app_enabled, email_enabled, email_to, discord_enabled, discord_webhook_url
         FROM notification_prefs
        WHERE workspace_id = $1
        LIMIT 1`,
      [session.workspaceId]
    );

    let prefs = rows[0];

    if (!prefs) {
      const fallbackRows = await q<{ email: string | null }>(
        `SELECT email
           FROM user_subscriptions
          WHERE workspace_id = $1
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
          LIMIT 1`,
        [session.workspaceId]
      ).catch(() => [] as Array<{ email: string | null }>);

      const fallbackEmail = toSafeEmail(fallbackRows[0]?.email);

      prefs = {
        in_app_enabled: true,
        email_enabled: Boolean(fallbackEmail),
        email_to: fallbackEmail,
        discord_enabled: false,
        discord_webhook_url: null,
      };
    }

    return NextResponse.json({ success: true, prefs });
  } catch (error) {
    console.error('[notifications/prefs] GET error:', error);
    return NextResponse.json({ error: 'Failed to load notification preferences' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureNotificationSchema();

    const body = await req.json().catch(() => ({}));

    const inAppEnabled = body?.inAppEnabled !== false;
    const emailEnabled = body?.emailEnabled === true;
    const discordEnabled = body?.discordEnabled === true;

    const emailTo = toSafeEmail(body?.emailTo);
    const discordWebhookUrl = toSafeWebhook(body?.discordWebhookUrl);

    if (emailEnabled && !emailTo) {
      return NextResponse.json({ error: 'Valid email is required when email notifications are enabled' }, { status: 400 });
    }

    if (discordEnabled && !discordWebhookUrl) {
      return NextResponse.json({ error: 'Valid Discord webhook URL is required when Discord notifications are enabled' }, { status: 400 });
    }

    await q(
      `INSERT INTO notification_prefs (
         workspace_id,
         in_app_enabled,
         email_enabled,
         email_to,
         discord_enabled,
         discord_webhook_url,
         updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (workspace_id)
       DO UPDATE SET
         in_app_enabled = EXCLUDED.in_app_enabled,
         email_enabled = EXCLUDED.email_enabled,
         email_to = EXCLUDED.email_to,
         discord_enabled = EXCLUDED.discord_enabled,
         discord_webhook_url = EXCLUDED.discord_webhook_url,
         updated_at = NOW()`,
      [
        session.workspaceId,
        inAppEnabled,
        emailEnabled,
        emailTo,
        discordEnabled,
        discordWebhookUrl,
      ]
    );

    return NextResponse.json({
      success: true,
      prefs: {
        in_app_enabled: inAppEnabled,
        email_enabled: emailEnabled,
        email_to: emailTo,
        discord_enabled: discordEnabled,
        discord_webhook_url: discordWebhookUrl,
      },
    });
  } catch (error) {
    console.error('[notifications/prefs] POST error:', error);
    return NextResponse.json({ error: 'Failed to save notification preferences' }, { status: 500 });
  }
}