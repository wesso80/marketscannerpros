/**
 * lib/opsAlerting.ts — Lightweight operational alerting via Discord webhook.
 *
 * Sends system-level alerts (cron failures, 5xx spikes, worker errors) to a
 * Discord channel. Deduplicates by error key within a 5-minute window.
 *
 * Set DISCORD_OPS_WEBHOOK_URL in environment to enable. Silent no-op if unset.
 */

const WEBHOOK_URL = process.env.DISCORD_OPS_WEBHOOK_URL || '';
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

interface AlertBucket {
  key: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

const sentAlerts = new Map<string, AlertBucket>();

function shouldSend(key: string): boolean {
  const now = Date.now();
  const existing = sentAlerts.get(key);

  if (existing && now - existing.firstSeen < DEDUP_WINDOW_MS) {
    existing.count++;
    existing.lastSeen = now;
    return false;
  }

  sentAlerts.set(key, { key, count: 1, firstSeen: now, lastSeen: now });

  // Prune old entries
  if (sentAlerts.size > 100) {
    for (const [k, v] of sentAlerts) {
      if (now - v.lastSeen > DEDUP_WINDOW_MS * 2) sentAlerts.delete(k);
    }
  }

  return true;
}

type Severity = 'critical' | 'error' | 'warning' | 'info';

const SEVERITY_COLORS: Record<Severity, number> = {
  critical: 0xFF0000,  // Red
  error:    0xFF6B35,  // Orange
  warning:  0xFFD700,  // Gold
  info:     0x10B981,  // Green
};

const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: '🔴',
  error:    '🟠',
  warning:  '🟡',
  info:     '🟢',
};

interface OpsAlertOptions {
  title: string;
  message: string;
  severity: Severity;
  source: string;
  metadata?: Record<string, string | number | boolean | null>;
  dedupeKey?: string;
}

/**
 * Send an operational alert to the Discord ops channel.
 * No-op if DISCORD_OPS_WEBHOOK_URL is not set. Never throws.
 */
export async function opsAlert(opts: OpsAlertOptions): Promise<void> {
  if (!WEBHOOK_URL) return;

  const key = opts.dedupeKey || `${opts.source}:${opts.title}`;
  if (!shouldSend(key)) return;

  const fields = opts.metadata
    ? Object.entries(opts.metadata)
        .filter(([, v]) => v != null)
        .map(([name, value]) => ({ name, value: String(value), inline: true }))
    : [];

  const embed = {
    title: `${SEVERITY_EMOJI[opts.severity]} ${opts.title}`,
    description: opts.message.slice(0, 2000),
    color: SEVERITY_COLORS[opts.severity],
    fields: fields.slice(0, 10),
    footer: { text: `MSP Ops • ${opts.source}` },
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Never let alerting failure cascade — silent drop
  }
}

/* ── Convenience helpers ────────────────────────────────────────────────── */

/** Alert when a cron job fails */
export function alertCronFailure(jobName: string, error: string, metadata?: Record<string, string | number | boolean | null>) {
  return opsAlert({
    title: `Cron Failure: ${jobName}`,
    message: error,
    severity: 'error',
    source: `cron/${jobName}`,
    metadata,
  });
}

/** Alert when a worker encounters an error */
export function alertWorkerError(workerName: string, error: string, metadata?: Record<string, string | number | boolean | null>) {
  return opsAlert({
    title: `Worker Error: ${workerName}`,
    message: error,
    severity: 'error',
    source: `worker/${workerName}`,
    metadata,
  });
}

/** Alert when API routes return 5xx at high rate */
export function alertApiError(route: string, statusCode: number, error: string) {
  return opsAlert({
    title: `API ${statusCode}: ${route}`,
    message: error,
    severity: statusCode >= 500 ? 'error' : 'warning',
    source: `api/${route}`,
    metadata: { statusCode },
  });
}

/** Alert for critical system events (DB down, rate limit exhausted, etc.) */
export function alertCritical(title: string, message: string, source: string) {
  return opsAlert({
    title,
    message,
    severity: 'critical',
    source,
  });
}
