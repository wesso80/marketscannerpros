import { previousScanDate } from '@/lib/market/overview';
import { COPY } from '@/components/visual/copy';

export const radarStatusTone = {
  COMPLETE: 'var(--msp-bull)', DEGRADED: 'var(--msp-warn)', FAILED: 'var(--msp-bear)',
} as const;
type ReportStatus = keyof typeof radarStatusTone;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};

/** Allowlisted projection: never retain the report body, headline or operator metadata. */
export function radarCardModel(payload: unknown, now = new Date()) {
  const row = record(payload);
  const sessionDate = typeof row.sessionDate === 'string' ? row.sessionDate : '';
  const date = new Date(`${sessionDate}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== sessionDate) return null;
  if (row.status !== 'COMPLETE' && row.status !== 'DEGRADED' && row.status !== 'FAILED') return null;
  const status: ReportStatus = row.status;
  const candidates = record(row.report).candidates;
  if (status !== 'FAILED' && !Array.isArray(candidates)) return null;
  const todayNY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const prior = previousScanDate(todayNY, 'equity');
  return {
    sessionDate,
    dateLabel: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(date),
    status,
    color: radarStatusTone[status],
    health: row.healthStatus === 'DEGRADED' || row.healthStatus === 'FAILED' ? row.healthStatus : row.healthStatus === 'NORMAL' ? null : COPY.radarCard.healthUnknown,
    count: status === 'FAILED' ? null : (candidates as unknown[]).length,
    generatedAt: typeof row.generatedAt === 'string' && Number.isFinite(Date.parse(row.generatedAt)) ? row.generatedAt : null,
    older: prior !== null && sessionDate < prior,
  };
}
