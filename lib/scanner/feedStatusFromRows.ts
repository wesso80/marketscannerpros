/**
 * Reconcile a scan feed's provider status (the "Equity / Crypto Data Truth" panels on the Scanner's Ranked tab) with
 * the per-row Trust labels shown in the table, so the panel, the "Degraded Data" summary card and the rows agree.
 *
 * - Any STALE / INSUFFICIENT DATA row makes the panel STALE; any DEGRADED row makes it DEGRADED. Either way the panel
 *   says why (how many rows, and that the row Trust column has the reason).
 * - Feed-level problems the rows cannot show (provider errors, symbols that returned no data) keep the panel DEGRADED
 *   with the server's reason.
 * - Disclosures (sample size, last completed bar) are notes: shown, but never on their own a reason for DEGRADED.
 * - A DEGRADED/STALE panel always carries at least one reason.
 * Pure: returns a new object, never mutates.
 */
export interface FeedStatusLike {
  live: boolean;
  stale: boolean;
  degraded: boolean;
  alertLevel: 'none' | 'info' | 'warning' | 'critical';
  warnings: string[];
  notes?: string[];
}

export type RowTrustLabel = 'GOOD' | 'DEGRADED' | 'STALE' | 'INSUFFICIENT DATA' | string;

/** Warnings older servers put in `warnings` that are disclosures, not problems. */
const LEGACY_NOTE = /^Ranked sample:/;

const formatBar = (bar: string) => (/^\d{4}-\d{2}-\d{2}$/.test(bar) ? bar : `${bar.slice(0, 16).replace('T', ' ')} UTC`);

export function reconcileFeedStatusWithRows<S extends FeedStatusLike, R>(
  status: S | null | undefined,
  rows: R[] | undefined,
  trustLabel: (row: R) => RowTrustLabel,
  lastBarOf: (row: R) => string | null | undefined = () => null,
): S | null {
  if (!status) return null;
  const serverWarnings = (status.warnings ?? []).filter((w) => w && !LEGACY_NOTE.test(w));
  const notes = [...(status.notes ?? []), ...(status.warnings ?? []).filter((w) => LEGACY_NOTE.test(w))];
  const list = rows ?? [];
  const total = list.length;
  const staleRows = list.filter((r) => { const t = trustLabel(r); return t === 'STALE' || t === 'INSUFFICIENT DATA'; }).length;
  const degradedRows = list.filter((r) => trustLabel(r) === 'DEGRADED').length;
  const bars = list.map(lastBarOf).filter((x): x is string => Boolean(x)).sort();
  if (bars.length) notes.unshift(`last completed bar ${formatBar(bars[bars.length - 1])}`);

  const rowReasons = [
    ...(staleRows > 0 ? [`${staleRows} of ${total} rows stale or insufficient (panel reflects the weakest row)`] : []),
    ...(degradedRows > 0 ? [`${degradedRows} of ${total} rows degraded (see the row Trust column for the reason)`] : []),
  ];
  // Server-side degradation that the rows cannot show: provider errors, unavailable symbols, interval mismatch.
  const feedDegraded = Boolean(status.degraded || status.stale) && (serverWarnings.length > 0 || total === 0);
  const stale = staleRows > 0 || (Boolean(status.stale) && total === 0);
  const degraded = stale || degradedRows > 0 || feedDegraded;
  const warnings = [...rowReasons, ...(degraded ? serverWarnings : [])];
  if (degraded && warnings.length === 0) warnings.push('Reason not reported by the data feed');

  return {
    ...status,
    live: stale ? false : status.live,
    stale,
    degraded,
    alertLevel: status.alertLevel === 'critical' ? 'critical' : stale ? 'warning' : degraded ? (status.alertLevel === 'none' ? 'info' : status.alertLevel) : 'none',
    warnings,
    notes,
  };
}
