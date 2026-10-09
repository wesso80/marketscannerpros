import { q } from '@/lib/db';
import { getRedis } from '@/lib/redis';
import { SCHEDULE } from '@/lib/worker/schedule';
import { adminDiscoveryOnly, discoveryOnlyAction } from './discoveryOnly';
import { adminEquitiesPaused } from './adminEquities';
import { isAdminCryptoEnabled, isCoinGeckoEnabled } from './adminCrypto';
import { cryptoMarketsPaused, cryptoMarketsExitsPaused } from './cryptoMarketsPause';

export function recordedJob(value: unknown, now = Date.now()) {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const time = typeof row.startedAt === 'string' ? Date.parse(row.startedAt) : NaN;
  const valid = Number.isFinite(time) && time <= now;
  return {
    outcome: !valid ? 'unknown' : row.skipped === true ? 'skipped' : row.ok === true ? 'succeeded' : row.ok === false ? 'failed' : 'unknown',
    startedAt: valid ? new Date(time).toISOString() : null,
    ageMinutes: valid ? Math.floor((now - time) / 60000) : null,
    durationMs: typeof row.ms === 'number' && Number.isFinite(row.ms) && row.ms >= 0 ? row.ms : null,
  };
}

/** Reads only: never call paper state (DDL), a provider, or the rate governor here. */
export async function readHealthOperations(workspaceId?: string) {
  let redis: ReturnType<typeof getRedis> = null;
  try { redis = getRedis(); } catch { /* Configuration failure means unavailable telemetry. */ }
  const jobs = await Promise.all(SCHEDULE.map(async job => {
    let value: unknown = null;
    let readable = Boolean(redis);
    try { value = await redis?.get(`worker:scheduler:last:${job.name}`); } catch { readable = false; }
    return { name: job.name, scheduleUtc: job.schedule,
      discoveryPaused: job.kind === 'http' && discoveryOnlyAction(job.path.split('?')[0]) === 'skip_job',
      telemetry: readable ? value == null ? 'not recorded' : 'recorded' : 'unavailable',
      ...recordedJob(value) };
  }));
  let paper: { state: string; accounts: { name: string; status: string; updatedAt: string | null }[]; reconciliation: string } = {
    state: workspaceId ? 'unavailable' : 'workspace required', accounts: [], reconciliation: 'Not checked: this overview does not run reconciliation.' };
  if (workspaceId) {
    try {
      const rows = await q<{ name: string; status: string; updated_at: Date | string }>(
        `SELECT name, status, updated_at FROM arca_portfolios WHERE workspace_id = $1 AND mode = 'SIMULATED' ORDER BY name`, [workspaceId]);
      paper = { ...paper, state: rows.length ? 'recorded' : 'no accounts', accounts: rows.map(row => ({
        name: row.name, status: ['ACTIVE', 'PAUSED', 'ARCHIVED'].includes(row.status) ? row.status : 'UNKNOWN',
        updatedAt: Number.isFinite(new Date(row.updated_at).getTime()) ? new Date(row.updated_at).toISOString() : null,
      })) };
    } catch { /* Missing schema and connection errors remain unavailable, never zero accounts. */ }
  }
  return {
    scope: 'Configuration is from the web service. Worker configuration can differ; recorded runs do not prove process liveness.',
    controls: [
      { name: 'Discovery-only scope', state: adminDiscoveryOnly() ? 'restricted' : 'unrestricted' },
      { name: 'Admin equity pause', state: adminEquitiesPaused() ? 'paused' : 'not paused' },
      { name: 'Admin crypto', state: isAdminCryptoEnabled() ? 'enabled' : 'disabled' },
      { name: 'Operator CoinGecko access', state: isCoinGeckoEnabled() ? 'enabled' : 'disabled' },
      { name: 'Crypto Markets entries and spending', state: cryptoMarketsPaused() ? 'paused' : 'not paused' },
      { name: 'Crypto Markets exit pause', state: cryptoMarketsExitsPaused() ? 'paused' : 'not paused' },
    ], jobs, paper,
    retention: 'Only the latest recorded outcome per scheduled job is retained here, for up to 7 days. Earlier successful runs are not available. Separate Render cron services are not included.',
  };
}
export type HealthOperations = Awaited<ReturnType<typeof readHealthOperations>>;
