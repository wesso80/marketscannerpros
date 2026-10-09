/**
 * Header date for /daily-pick. Taken from the rows on the page, never from the wall clock
 * and never from another asset class's later scan_date.
 */
import { formatSessionDate, lastCompletedUsSessionDate, toYmd } from '@/lib/time/usSession';

export interface PickDateSource {
  asset_class: string;
  /** Candle date the stored price was computed from (YYYY-MM-DD or ISO). */
  barDate?: string | null;
  dataAsOf?: string | null;
  scan_date?: string | null;
}

/** Bar date, then the stored close time, then the row's scan_date. */
export function pickAsOfYmd(row: PickDateSource): string | null {
  return toYmd(row.barDate) ?? toYmd(row.dataAsOf) ?? toYmd(row.scan_date);
}

export interface DailyPickHeader {
  /** Newest equity bar date on the page, or the newest row date when there are no equities. */
  sessionDate: string;
  /** An equity row is older than the last US session that has already closed. */
  pricesStale: boolean;
  /** Set only when equity prices are behind that session. */
  pricesAsOfNote: string | null;
}

/**
 * The date the header may name. Equity rows decide it, so a later crypto candle cannot
 * label yesterday's equity closes as today's US session.
 * When any equity bar is older than the last completed US session, the note names the
 * oldest equity date actually on the page.
 */
export function dailyPickHeader(rows: readonly PickDateSource[], nowMs: number): DailyPickHeader | null {
  const dated = rows
    .map((row) => ({ asset: row.asset_class, ymd: pickAsOfYmd(row) }))
    .filter((row): row is { asset: string; ymd: string } => row.ymd != null);
  if (dated.length === 0) return null;
  const equity = dated.filter((row) => row.asset === 'equity').map((row) => row.ymd).sort();
  const sessionDate = equity.length > 0 ? equity[equity.length - 1] : dated.map((row) => row.ymd).sort().at(-1)!;
  const oldestEquity = equity[0] ?? null;
  const expected = lastCompletedUsSessionDate(nowMs);
  const pricesStale = oldestEquity != null && oldestEquity < expected;
  const noteDate = pricesStale ? oldestEquity : null;
  return {
    sessionDate,
    pricesStale,
    pricesAsOfNote: noteDate ? `Prices as of ${formatSessionDate(noteDate)}.` : null,
  };
}
