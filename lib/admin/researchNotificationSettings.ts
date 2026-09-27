import { q } from '@/lib/db';

let schema: Promise<unknown> | undefined;
async function ensureSchema() {
  if (!schema) schema = q(`CREATE TABLE IF NOT EXISTS admin_research_notification_settings (
    workspace_id TEXT PRIMARY KEY, paused BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(error => { schema = undefined; throw error; });
  await schema;
}

/** Only availability is returned to the client; never destinations or secrets. */
export async function readResearchNotificationSettings(workspaceId: string) {
  await ensureSchema();
  const rows = await q<{ paused: boolean; updated_at: string }>(
    'SELECT paused, updated_at::text FROM admin_research_notification_settings WHERE workspace_id = $1', [workspaceId],
  );
  const discordConfigured = /^https:\/\/discord\.com\/api\/webhooks\//.test((process.env.ADMIN_DISCORD_WEBHOOK_URL ?? '').trim());
  return {
    paused: rows[0]?.paused ?? false,
    updatedAt: rows[0]?.updated_at ?? null,
    channels: {
      discord: { available: discordConfigured, status: !discordConfigured ? 'Not configured' : rows[0]?.paused ? 'Paused' : 'Enabled' },
      email: { available: false, status: 'Unavailable — email delivery is not implemented' },
    },
  };
}

export async function setResearchNotificationsPaused(workspaceId: string, paused: boolean) {
  await ensureSchema();
  await q(`INSERT INTO admin_research_notification_settings (workspace_id, paused)
    VALUES ($1, $2) ON CONFLICT (workspace_id) DO UPDATE SET paused = EXCLUDED.paused, updated_at = NOW()`, [workspaceId, paused]);
  return readResearchNotificationSettings(workspaceId);
}
