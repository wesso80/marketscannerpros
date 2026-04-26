import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { q } from '@/lib/db';

export const runtime = 'nodejs';

const DEFAULT_CHANNEL_KEY = 'msp-alerts';

function isDiscordWebhookUrl(value: string): boolean {
  return /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(value);
}

async function getWebhookUrl(channelKey: string): Promise<{ source: string; url: string | null }> {
  const envUrl =
    process.env.ADMIN_DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_ADMIN_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL ||
    '';

  if (envUrl.trim()) {
    return { source: 'environment', url: envUrl.trim() };
  }

  const rows = await q<{ webhook_url: string | null }>(
    `SELECT webhook_url
     FROM discord_bridge_channels
     WHERE channel_key = $1
     LIMIT 1`,
    [channelKey],
  );

  return { source: 'discord_bridge_channels', url: rows[0]?.webhook_url?.trim() || null };
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const channelKey = typeof body?.channelKey === 'string' && body.channelKey.trim()
    ? body.channelKey.trim()
    : DEFAULT_CHANNEL_KEY;

  const { source, url } = await getWebhookUrl(channelKey);
  if (!url) {
    console.error('[admin-discord-test] No Discord webhook configured', { channelKey, source });
    return NextResponse.json(
      { ok: false, sent: false, channelKey, source, error: 'Discord webhook not configured' },
      { status: 400 },
    );
  }

  if (!isDiscordWebhookUrl(url)) {
    console.error('[admin-discord-test] Invalid Discord webhook URL format', { channelKey, source });
    return NextResponse.json(
      { ok: false, sent: false, channelKey, source, error: 'Invalid Discord webhook URL format' },
      { status: 400 },
    );
  }

  const environment = process.env.RENDER_SERVICE_NAME
    ? 'production'
    : process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
  const timestamp = new Date().toISOString();

  const payload = {
    username: 'MSP Admin Terminal',
    embeds: [
      {
        title: 'MarketScanner Pros Alert',
        description: 'Private admin research alert',
        color: 0x10B981,
        fields: [
          { name: 'Type', value: 'ADMIN_TEST', inline: true },
          { name: 'Message', value: 'MSP Discord webhook test successful', inline: false },
          { name: 'Environment', value: environment, inline: true },
          { name: 'Data Status', value: 'Test payload', inline: true },
          { name: 'Timestamp', value: timestamp, inline: false },
        ],
        footer: { text: 'Internal research only - not financial advice' },
        timestamp,
      },
    ],
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    const responseText = await response.text().catch(() => '');

    console.log('[admin-discord-test] Discord response', {
      channelKey,
      source,
      status: response.status,
      ok: response.ok,
      responseText: responseText.slice(0, 300),
    });

    return NextResponse.json({
      ok: response.ok,
      sent: response.ok,
      channelKey,
      source,
      discordStatus: response.status,
      discordStatusText: response.statusText,
      responseSnippet: responseText.slice(0, 300),
    }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Discord webhook request failed';
    console.error('[admin-discord-test] Discord request failed', { channelKey, source, error: message });
    return NextResponse.json(
      { ok: false, sent: false, channelKey, source, error: message },
      { status: 502 },
    );
  }
}