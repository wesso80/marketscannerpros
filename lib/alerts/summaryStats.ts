/**
 * Alert radar console summary stats (TR-20). Pure helpers so they can be tested.
 */

export interface HistoryRowLike {
  alert_id?: string | number | null;
  symbol?: string | null;
  condition_type?: string | null;
  triggered_at: string;
}

export type PushBadgeState = 'Checking' | 'Enabled' | 'Blocked' | 'Not set up' | 'Unsupported';

/**
 * Push status for this browser. It reflects what push delivery actually needs:
 * browser support, notification permission and a saved push subscription.
 * The old badge showed the in-app preference, which no delivery code reads.
 */
export function pushBadgeState(input: {
  supported: boolean | null;
  permission: NotificationPermission | 'unsupported' | null;
  subscribed: boolean | null;
}): PushBadgeState {
  if (input.supported === null) return 'Checking';
  if (!input.supported || input.permission === 'unsupported') return 'Unsupported';
  if (input.permission === 'denied') return 'Blocked';
  if (input.permission === 'granted' && input.subscribed) return 'Enabled';
  return 'Not set up';
}

/**
 * Triggers in the last 24 hours. Prefers the server's rolling count (all history);
 * falls back to counting the loaded rows when the server count is unavailable.
 */
export function triggersLast24h(history: HistoryRowLike[], serverCount: unknown, nowMs = Date.now()): number {
  const n = typeof serverCount === 'number' ? serverCount : Number(serverCount);
  if (serverCount != null && serverCount !== '' && Number.isFinite(n) && n >= 0) return n;
  return history.filter((h) => {
    const t = new Date(h.triggered_at).getTime();
    return Number.isFinite(t) && t <= nowMs && nowMs - t < 24 * 60 * 60_000;
  }).length;
}

function formatMinutes(avgMin: number): string {
  if (avgMin < 60) return `${avgMin}m`;
  if (avgMin < 48 * 60) return `${(avgMin / 60).toFixed(1)}h`;
  return `${(avgMin / 1440).toFixed(1)}d`;
}

/**
 * Average time between consecutive triggers of the *same* alert (falls back to symbol +
 * condition when the row has no alert id). Gaps between different alerts or symbols are
 * not mixed together. Returns 'N/A' when no alert has triggered at least twice.
 */
export function avgRetriggerInterval(history: HistoryRowLike[]): string {
  const groups = new Map<string, number[]>();
  for (const h of history) {
    const t = new Date(h.triggered_at).getTime();
    if (!Number.isFinite(t)) continue;
    const key = h.alert_id != null && h.alert_id !== ''
      ? `id:${h.alert_id}`
      : `sym:${h.symbol ?? ''}|${h.condition_type ?? ''}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  let total = 0;
  let gaps = 0;
  for (const times of groups.values()) {
    if (times.length < 2) continue;
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      total += times[i] - times[i - 1];
      gaps++;
    }
  }
  if (gaps === 0) return 'N/A';
  return formatMinutes(Math.round(total / gaps / 60_000));
}
