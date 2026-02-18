import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { q } from '../lib/db';
import { sendAlertEmail } from '../lib/email';
import { ensureNotificationSchema } from '../lib/notifications/tradeEvents';

type TradeEventType = 'TRADE_ENTERED' | 'TRADE_CLOSED' | 'TRADE_CLOSE_FAILED';
type DeliveryChannel = 'in_app' | 'email' | 'discord';

interface TradeEventRow {
  id: number;
  workspace_id: string;
  event_type: TradeEventType;
  aggregate_id: string;
  dedupe_key: string;
  payload: Record<string, unknown> | string;
  occurred_at: string;
  status: 'pending' | 'processing' | 'notified' | 'failed';
  attempts: number;
}

interface NotificationPrefs {
  in_app_enabled: boolean;
  email_enabled: boolean;
  email_to: string | null;
  discord_enabled: boolean;
  discord_webhook_url: string | null;
}

const WORKER_ID = `notification_router_${process.pid}`;
const MAX_ATTEMPTS = 8;

function asObject(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, any>;
    } catch {
      return {};
    }
  }
  return {};
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function notificationCopy(event: TradeEventRow, payload: Record<string, any>) {
  const symbol = asString(payload.symbol || payload.ticker).toUpperCase();
  const side = asString(payload.side || '').toUpperCase();
  const outcome = asString(payload.outcome || '').toLowerCase();
  const pl = asNumber(payload.pl);

  if (event.event_type === 'TRADE_ENTERED') {
    return {
      title: `${symbol || 'Trade'} entered`,
      body: `${side || 'Position'} opened${payload.entryPrice != null ? ` at ${payload.entryPrice}` : ''}.`,
      href: '/tools/journal',
    };
  }

  if (event.event_type === 'TRADE_CLOSED') {
    const plLabel = pl != null ? ` P&L ${pl >= 0 ? '+' : ''}${pl.toFixed(2)}.` : '';
    return {
      title: `${symbol || 'Trade'} closed`,
      body: `${outcome ? `Outcome: ${outcome}.` : 'Trade closed.'}${plLabel}`,
      href: '/tools/journal',
    };
  }

  return {
    title: `${symbol || 'Trade'} close failed`,
    body: asString(payload.error || 'Close attempt failed.').slice(0, 250),
    href: '/tools/journal',
  };
}

async function claimNextEvent(): Promise<TradeEventRow | null> {
  const rows = await q<TradeEventRow>(
    `WITH next_event AS (
       SELECT id
       FROM trade_events
       WHERE status IN ('pending', 'failed')
         AND attempts < $1
       ORDER BY occurred_at ASC, id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE trade_events te
     SET status = 'processing',
         processing_at = NOW(),
         attempts = te.attempts + 1,
         updated_at = NOW(),
         last_error = NULL
     FROM next_event
     WHERE te.id = next_event.id
     RETURNING te.*`,
    [MAX_ATTEMPTS]
  );

  return rows[0] || null;
}

async function markEventNotified(eventId: number) {
  await q(
    `UPDATE trade_events
     SET status = 'notified', notified_at = NOW(), updated_at = NOW(), processing_at = NULL
     WHERE id = $1`,
    [eventId]
  );
}

async function markEventFailed(eventId: number, error: string) {
  await q(
    `UPDATE trade_events
     SET status = 'failed', updated_at = NOW(), processing_at = NULL, last_error = $2
     WHERE id = $1`,
    [eventId, error.slice(0, 2000)]
  );
}

async function alreadyDelivered(workspaceId: string, eventId: number, channel: DeliveryChannel, recipient: string): Promise<boolean> {
  const rows = await q<{ id: number }>(
    `SELECT id
       FROM notification_deliveries
      WHERE workspace_id = $1
        AND event_id = $2
        AND channel = $3
        AND recipient = $4
        AND status = 'sent'
      LIMIT 1`,
    [workspaceId, eventId, channel, recipient]
  );

  return rows.length > 0;
}

async function upsertDelivery(args: {
  workspaceId: string;
  eventId: number;
  channel: DeliveryChannel;
  recipient: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  providerMessageId?: string | null;
  error?: string | null;
  dedupeKey: string;
}) {
  await q(
    `INSERT INTO notification_deliveries (
      workspace_id, event_id, channel, recipient, status, provider_message_id, error, attempted_at, delivered_at, dedupe_key
    ) VALUES (
      $1, $2, $3, $4, $5::varchar, $6, $7, NOW(), CASE WHEN $5::varchar = 'sent'::varchar THEN NOW() ELSE NULL END, $8
    )
    ON CONFLICT (workspace_id, event_id, channel, recipient)
    DO UPDATE SET
      status = EXCLUDED.status,
      provider_message_id = COALESCE(EXCLUDED.provider_message_id, notification_deliveries.provider_message_id),
      error = EXCLUDED.error,
      attempted_at = NOW(),
      delivered_at = CASE
        WHEN EXCLUDED.status = 'sent' THEN COALESCE(notification_deliveries.delivered_at, NOW())
        ELSE notification_deliveries.delivered_at
      END`,
    [
      args.workspaceId,
      args.eventId,
      args.channel,
      args.recipient,
      args.status,
      args.providerMessageId || null,
      args.error || null,
      args.dedupeKey.slice(0, 220),
    ]
  );
}

async function loadPrefs(workspaceId: string): Promise<NotificationPrefs> {
  const prefRows = await q<NotificationPrefs>(
    `SELECT in_app_enabled, email_enabled, email_to, discord_enabled, discord_webhook_url
       FROM notification_prefs
      WHERE workspace_id = $1
      LIMIT 1`,
    [workspaceId]
  );

  if (prefRows.length > 0) {
    return prefRows[0];
  }

  const fallbackRows = await q<{ email: string | null }>(
    `SELECT email
       FROM user_subscriptions
      WHERE workspace_id = $1
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 1`,
    [workspaceId]
  ).catch(() => [] as Array<{ email: string | null }>);

  return {
    in_app_enabled: true,
    email_enabled: false,
    email_to: fallbackRows[0]?.email || null,
    discord_enabled: false,
    discord_webhook_url: null,
  };
}

async function deliverInApp(event: TradeEventRow, payload: Record<string, any>, title: string, body: string, href: string | null) {
  const recipient = 'inbox';
  const dedupeKey = `delivery:${event.id}:in_app:${recipient}`;

  await q(
    `INSERT INTO notifications (
      workspace_id, source_event_id, title, body, href, metadata, is_read, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6::jsonb, false, NOW()
    )
    ON CONFLICT (workspace_id, source_event_id) DO NOTHING`,
    [
      event.workspace_id,
      event.id,
      title.slice(0, 180),
      body,
      href,
      JSON.stringify({
        eventType: event.event_type,
        aggregateId: event.aggregate_id,
        symbol: payload.symbol || null,
      }),
    ]
  );

  await upsertDelivery({
    workspaceId: event.workspace_id,
    eventId: event.id,
    channel: 'in_app',
    recipient,
    status: 'sent',
    dedupeKey,
  });
}

async function deliverEmail(event: TradeEventRow, prefs: NotificationPrefs, title: string, body: string, href: string | null) {
  const recipient = asString(prefs.email_to || '').trim().toLowerCase();
  if (!recipient || !prefs.email_enabled) {
    await upsertDelivery({
      workspaceId: event.workspace_id,
      eventId: event.id,
      channel: 'email',
      recipient: recipient || 'disabled',
      status: 'skipped',
      dedupeKey: `delivery:${event.id}:email:${recipient || 'disabled'}`,
      error: recipient ? 'Email channel disabled' : 'Email recipient not configured',
    });
    return;
  }

  if (await alreadyDelivered(event.workspace_id, event.id, 'email', recipient)) return;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.45; color: #0f172a;">
      <h2>${title}</h2>
      <p>${body}</p>
      <p><a href="https://app.marketscannerpros.app${href || '/tools/journal'}">Open in MarketScanner Pros</a></p>
      <p style="color:#64748b;font-size:12px;">Event: ${event.event_type} • ID: ${event.id}</p>
    </div>
  `.trim();

  try {
    const providerId = await sendAlertEmail({
      to: recipient,
      subject: `[Trade] ${title}`,
      html,
    });

    await upsertDelivery({
      workspaceId: event.workspace_id,
      eventId: event.id,
      channel: 'email',
      recipient,
      status: 'sent',
      providerMessageId: providerId || null,
      dedupeKey: `delivery:${event.id}:email:${recipient}`,
    });
  } catch (error) {
    await upsertDelivery({
      workspaceId: event.workspace_id,
      eventId: event.id,
      channel: 'email',
      recipient,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Email delivery failed',
      dedupeKey: `delivery:${event.id}:email:${recipient}`,
    });
    throw error;
  }
}

async function deliverDiscord(event: TradeEventRow, prefs: NotificationPrefs, title: string, body: string, href: string | null) {
  const recipient = asString(prefs.discord_webhook_url || '').trim();
  if (!recipient || !prefs.discord_enabled) {
    await upsertDelivery({
      workspaceId: event.workspace_id,
      eventId: event.id,
      channel: 'discord',
      recipient: recipient || 'disabled',
      status: 'skipped',
      dedupeKey: `delivery:${event.id}:discord:${recipient || 'disabled'}`,
      error: recipient ? 'Discord channel disabled' : 'Discord webhook not configured',
    });
    return;
  }

  if (await alreadyDelivered(event.workspace_id, event.id, 'discord', recipient)) return;

  const payload = {
    content: `**${title}**\n${body}\n<https://app.marketscannerpros.app${href || '/tools/journal'}>`,
  };

  try {
    const response = await fetch(recipient, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'Discord webhook failed');
      throw new Error(`Discord webhook error ${response.status}: ${text.slice(0, 300)}`);
    }

    await upsertDelivery({
      workspaceId: event.workspace_id,
      eventId: event.id,
      channel: 'discord',
      recipient,
      status: 'sent',
      dedupeKey: `delivery:${event.id}:discord:${recipient}`,
    });
  } catch (error) {
    await upsertDelivery({
      workspaceId: event.workspace_id,
      eventId: event.id,
      channel: 'discord',
      recipient,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Discord delivery failed',
      dedupeKey: `delivery:${event.id}:discord:${recipient}`,
    });
    throw error;
  }
}

async function processEvent(event: TradeEventRow) {
  const payload = asObject(event.payload);
  const prefs = await loadPrefs(event.workspace_id);

  const duplicateNotified = await q<{ id: number }>(
    `SELECT id
       FROM trade_events
      WHERE workspace_id = $1
        AND dedupe_key = $2
        AND id <> $3
        AND status = 'notified'
      LIMIT 1`,
    [event.workspace_id, event.dedupe_key, event.id]
  );

  if (duplicateNotified.length > 0) {
    await markEventNotified(event.id);
    return;
  }

  const copy = notificationCopy(event, payload);
  const hardFailures: string[] = [];

  if (prefs.in_app_enabled !== false) {
    try {
      await deliverInApp(event, payload, copy.title, copy.body, copy.href);
    } catch (error) {
      hardFailures.push(`in_app: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  } else {
    await upsertDelivery({
      workspaceId: event.workspace_id,
      eventId: event.id,
      channel: 'in_app',
      recipient: 'inbox',
      status: 'skipped',
      dedupeKey: `delivery:${event.id}:in_app:inbox`,
      error: 'In-app notifications disabled',
    });
  }

  try {
    await deliverEmail(event, prefs, copy.title, copy.body, copy.href);
  } catch (error) {
    hardFailures.push(`email: ${error instanceof Error ? error.message : 'unknown'}`);
  }

  try {
    await deliverDiscord(event, prefs, copy.title, copy.body, copy.href);
  } catch (error) {
    hardFailures.push(`discord: ${error instanceof Error ? error.message : 'unknown'}`);
  }

  if (hardFailures.length > 0) {
    throw new Error(hardFailures.join(' | '));
  }

  await markEventNotified(event.id);
}

async function runOnce() {
  await ensureNotificationSchema();

  let processed = 0;
  while (true) {
    const event = await claimNextEvent();
    if (!event) break;

    try {
      await processEvent(event);
      processed += 1;
    } catch (error) {
      await markEventFailed(event.id, error instanceof Error ? error.message : 'Notification routing failed');
      console.error(`[notification-router] event ${event.id} failed:`, error);
    }
  }

  return processed;
}

async function main() {
  const args = process.argv.slice(2);
  const watchMode = args.includes('--watch');
  const intervalArg = args.find((arg) => arg.startsWith('--interval-seconds='));
  const intervalFromArg = intervalArg ? Number(intervalArg.replace('--interval-seconds=', '')) : NaN;
  const intervalSeconds = Number.isFinite(intervalFromArg) && intervalFromArg > 0 ? intervalFromArg : 15;

  if (!watchMode) {
    const processed = await runOnce();
    console.log(`[notification-router] processed ${processed} event(s)`);
    return;
  }

  console.log(`[notification-router] watch mode started (${intervalSeconds}s)`);
  while (true) {
    try {
      const processed = await runOnce();
      if (processed > 0) {
        console.log(`[notification-router] processed ${processed} event(s)`);
      }
    } catch (error) {
      console.error('[notification-router] cycle error:', error);
    }
    await sleep(intervalSeconds * 1000);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[notification-router] fatal:', error);
    process.exit(1);
  });
