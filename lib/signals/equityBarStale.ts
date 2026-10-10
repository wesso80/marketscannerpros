/**
 * Equities whose latest daily bar is more than N US sessions behind the last
 * completed session are not used to create signals or outcomes.
 * Default N is 5. EQUITY_BAR_STALE_SESSIONS overrides it (0..30).
 */
import { lastCompletedUsSessionDate, toYmd, usSessionsBetween } from '@/lib/time/usSession';

export const DEFAULT_EQUITY_BAR_STALE_SESSIONS = 5;
export const EQUITY_BAR_STALE_SESSIONS_ENV = 'EQUITY_BAR_STALE_SESSIONS';

export function equityBarStaleSessionLimit(
  env: Record<string, string | undefined> = process.env,
): number {
  const n = Number.parseInt(String(env[EQUITY_BAR_STALE_SESSIONS_ENV] ?? ''), 10);
  return Number.isFinite(n) && n >= 0 && n <= 30 ? n : DEFAULT_EQUITY_BAR_STALE_SESSIONS;
}

/** Session date of a stored daily bar. Epoch milliseconds use the UTC calendar day of that instant. */
export function equityBarYmd(latest: unknown): string | null {
  if (typeof latest === 'number' && Number.isFinite(latest)) {
    return new Date(latest).toISOString().slice(0, 10);
  }
  return toYmd(latest);
}

/** Completed US sessions after the latest daily bar, through the last completed session. */
export function equityDailyBarSessionsBehind(latest: unknown, nowMs: number): number | null {
  const ymd = equityBarYmd(latest);
  if (!ymd) return null;
  return usSessionsBetween(ymd, lastCompletedUsSessionDate(nowMs));
}

export function equityDailyBarIsStale(
  latest: unknown,
  nowMs: number,
  maxSessions: number = equityBarStaleSessionLimit(),
): boolean {
  const behind = equityDailyBarSessionsBehind(latest, nowMs);
  return behind != null && behind > maxSessions;
}

export interface EquityBarStaleRun {
  /** True when this equity's latest daily bar is too old. Logs the symbol once for this run. */
  skip(symbol: string, latest: unknown, nowMs?: number, maxSessions?: number): boolean;
}

export function createEquityBarStaleRun(
  scope: string,
  log: (line: string) => void = (line) => console.warn(line),
): EquityBarStaleRun {
  const seen = new Set<string>();
  return {
    skip(symbol, latest, nowMs = Date.now(), maxSessions = equityBarStaleSessionLimit()) {
      if (!equityDailyBarIsStale(latest, nowMs, maxSessions)) return false;
      const key = String(symbol ?? '').trim().toUpperCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        const ymd = equityBarYmd(latest) ?? 'unknown';
        const behind = equityDailyBarSessionsBehind(latest, nowMs);
        log(`[${scope}] ${key}: skip, latest daily bar ${ymd} is ${behind} US sessions behind (limit ${maxSessions})`);
      }
      return true;
    },
  };
}
