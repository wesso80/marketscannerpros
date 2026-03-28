import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/adminAuth';
import {
  listBridgeChannels,
  updateBridgeChannel,
  testBridgeChannel,
  type ChannelKey,
} from '@/lib/discord-bridge';

export const runtime = 'nodejs';

/** GET — list all bridge channel configs */
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const channels = await listBridgeChannels();
  return NextResponse.json({ channels });
}

/** POST — update channel config or test a channel */
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action === 'test') {
    const channelKey = body?.channelKey as ChannelKey;
    if (!channelKey) {
      return NextResponse.json({ error: 'channelKey required' }, { status: 400 });
    }
    // Accept optional webhookUrl so users can test before saving
    const webhookUrl = typeof body?.webhookUrl === 'string' ? body.webhookUrl.trim() : undefined;
    if (webhookUrl && !/^https:\/\/discord\.com\/api\/webhooks\//.test(webhookUrl)) {
      return NextResponse.json({ error: 'Invalid Discord webhook URL' }, { status: 400 });
    }
    const sent = await testBridgeChannel(channelKey, webhookUrl || undefined);
    return NextResponse.json({ sent });
  }

  if (action === 'update') {
    const channelKey = body?.channelKey as string;
    if (!channelKey) {
      return NextResponse.json({ error: 'channelKey required' }, { status: 400 });
    }

    const webhookUrl = typeof body?.webhookUrl === 'string' ? body.webhookUrl.trim() : undefined;
    if (webhookUrl !== undefined && webhookUrl && !/^https:\/\/discord\.com\/api\/webhooks\//.test(webhookUrl)) {
      return NextResponse.json({ error: 'Invalid Discord webhook URL format' }, { status: 400 });
    }

    await updateBridgeChannel(channelKey, {
      webhook_url: webhookUrl === '' ? null : webhookUrl,
      enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined,
      cooldown_minutes: typeof body?.cooldownMinutes === 'number' ? body.cooldownMinutes : undefined,
    });

    return NextResponse.json({ success: true });
  }

  if (action === 'bulk-update') {
    const updates = body?.channels;
    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: 'channels array required' }, { status: 400 });
    }

    for (const ch of updates) {
      const channelKey = ch?.channelKey;
      if (!channelKey) continue;

      const webhookUrl = typeof ch?.webhookUrl === 'string' ? ch.webhookUrl.trim() : undefined;
      if (webhookUrl !== undefined && webhookUrl && !/^https:\/\/discord\.com\/api\/webhooks\//.test(webhookUrl)) {
        continue; // skip invalid
      }

      await updateBridgeChannel(channelKey, {
        webhook_url: webhookUrl === '' ? null : webhookUrl,
        enabled: typeof ch?.enabled === 'boolean' ? ch.enabled : undefined,
        cooldown_minutes: typeof ch?.cooldownMinutes === 'number' ? ch.cooldownMinutes : undefined,
      });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
