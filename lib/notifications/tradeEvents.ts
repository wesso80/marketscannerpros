import { createHash } from 'crypto';
import { q } from '../db';

export type TradeLifecycleEventType = 'TRADE_ENTERED' | 'TRADE_CLOSED' | 'TRADE_CLOSE_FAILED';

export interface TradeLifecycleEventInput {
  workspaceId: string;
  eventType: TradeLifecycleEventType;
  aggregateId: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  occurredAtIso?: string;
}

export function hashDedupeKey(parts: Array<string | number | null | undefined>): string {
  const raw = parts.map((part) => (part == null ? '' : String(part))).join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 64);
}

export async function ensureNotificationSchema() {
  await q(`
    CREATE TABLE IF NOT EXISTS trade_events (
      id BIGSERIAL PRIMARY KEY,
      workspace_id VARCHAR(100) NOT NULL,
      event_type VARCHAR(40) NOT NULL CHECK (event_type IN ('TRADE_ENTERED', 'TRADE_CLOSED', 'TRADE_CLOSE_FAILED')),
      aggregate_type VARCHAR(40) NOT NULL DEFAULT 'trade',
      aggregate_id VARCHAR(120) NOT NULL,
      dedupe_key VARCHAR(180) NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'notified', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      processing_at TIMESTAMPTZ,
      notified_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (workspace_id, dedupe_key)
    )
  `);

  await q(`
    CREATE INDEX IF NOT EXISTS idx_trade_events_pending
    ON trade_events (status, occurred_at ASC)
    WHERE status IN ('pending', 'failed')
  `);

  await q(`
    CREATE INDEX IF NOT EXISTS idx_trade_events_workspace
    ON trade_events (workspace_id, created_at DESC)
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS notification_prefs (
      workspace_id VARCHAR(100) PRIMARY KEY,
      in_app_enabled BOOLEAN NOT NULL DEFAULT true,
      email_enabled BOOLEAN NOT NULL DEFAULT false,
      email_to VARCHAR(320),
      discord_enabled BOOLEAN NOT NULL DEFAULT false,
      discord_webhook_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      workspace_id VARCHAR(100) NOT NULL,
      source_event_id BIGINT NOT NULL REFERENCES trade_events(id) ON DELETE CASCADE,
      title VARCHAR(180) NOT NULL,
      body TEXT NOT NULL,
      href VARCHAR(255),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_read BOOLEAN NOT NULL DEFAULT false,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (workspace_id, source_event_id)
    )
  `);

  await q(`
    CREATE INDEX IF NOT EXISTS idx_notifications_workspace_recent
    ON notifications (workspace_id, created_at DESC)
  `);

  await q(`
    CREATE INDEX IF NOT EXISTS idx_notifications_workspace_unread
    ON notifications (workspace_id, is_read, created_at DESC)
    WHERE is_read = false
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id BIGSERIAL PRIMARY KEY,
      workspace_id VARCHAR(100) NOT NULL,
      event_id BIGINT NOT NULL REFERENCES trade_events(id) ON DELETE CASCADE,
      channel VARCHAR(20) NOT NULL CHECK (channel IN ('in_app', 'email', 'discord')),
      recipient VARCHAR(320) NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
      provider_message_id VARCHAR(255),
      error TEXT,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      delivered_at TIMESTAMPTZ,
      dedupe_key VARCHAR(220) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (workspace_id, event_id, channel, recipient),
      UNIQUE (workspace_id, dedupe_key)
    )
  `);

  await q(`
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_event
    ON notification_deliveries (event_id, channel, attempted_at DESC)
  `);
}

export async function emitTradeLifecycleEvent(input: TradeLifecycleEventInput): Promise<{ inserted: boolean; id?: number }> {
  await ensureNotificationSchema();

  const rows = await q<{ id: number }>(
    `INSERT INTO trade_events (
      workspace_id, event_type, aggregate_type, aggregate_id, dedupe_key, payload, occurred_at, status, updated_at
    ) VALUES (
      $1, $2, 'trade', $3, $4, $5::jsonb, COALESCE($6::timestamptz, NOW()), 'pending', NOW()
    )
    ON CONFLICT (workspace_id, dedupe_key) DO NOTHING
    RETURNING id`,
    [
      input.workspaceId,
      input.eventType,
      input.aggregateId,
      input.dedupeKey.slice(0, 180),
      JSON.stringify(input.payload || {}),
      input.occurredAtIso || null,
    ]
  );

  if (!rows.length) return { inserted: false };
  return { inserted: true, id: Number(rows[0].id) };
}
