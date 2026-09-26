/** Portfolio Track minors (TR-6, TR-7, TR-35). */

/** TR-6: gross profit / gross loss; with no losing trades there is no ratio to show (was a hard-coded 9.99). */
export function profitFactorDisplay(realizedPLs: number[]): { value: number | null; label: string; detail?: string } {
  const grossWin = realizedPLs.filter((v) => v > 0).reduce((s, v) => s + v, 0);
  const grossLoss = Math.abs(realizedPLs.filter((v) => v < 0).reduce((s, v) => s + v, 0));
  if (realizedPLs.length === 0) return { value: null, label: 'N/A', detail: 'No closed trades yet' };
  if (grossLoss === 0) return { value: null, label: grossWin > 0 ? 'No losses' : 'N/A', detail: grossWin > 0 ? 'Profit factor needs at least one losing trade' : 'No winning or losing trades' };
  const value = grossWin / grossLoss;
  return { value, label: value.toFixed(2) };
}

/** TR-7: "6 open (no limit)" instead of "6/Infinity". */
export function positionLimitLabel(open: number, limit: number): string {
  return Number.isFinite(limit) && limit > 0 ? `${open}/${limit}` : `${open} open (no limit)`;
}

/** TR-35: local YYYY-MM-DD for the close-date field. */
export function localDateInput(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * TR-35: close date for a recorded paper close. Today keeps the current time; an earlier local date is stored as
 * local noon so it can't slip a day in any time zone. Future dates and bad input are rejected (null).
 */
export function paperCloseDateIso(localDate: string, now = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;
  const today = localDateInput(now);
  if (localDate > today) return null;
  if (localDate === today) return now.toISOString();
  const [y, m, d] = localDate.split('-').map(Number);
  const noon = new Date(y, m - 1, d, 12, 0, 0);
  return Number.isFinite(noon.getTime()) && noon.getDate() === d ? noon.toISOString() : null;
}

/**
 * TR-37: neutral placeholder while the numbers a label depends on are still loading, so the first paint
 * never shows fallback wording (e.g. "N/A" before closed trades load, or a free-tier limit before the tier loads).
 */
export const LOADING_LABEL = '…';

export function profitFactorWhenReady(realizedPLs: number[], ready: boolean): { value: number | null; label: string; detail?: string } {
  return ready ? profitFactorDisplay(realizedPLs) : { value: null, label: LOADING_LABEL, detail: 'Loading closed trades…' };
}

export function positionLimitWhenReady(open: number, limit: number, ready: boolean): string {
  return ready ? positionLimitLabel(open, limit) : LOADING_LABEL;
}
