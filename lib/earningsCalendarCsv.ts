/**
 * Shared reader for Alpha Vantage EARNINGS_CALENDAR CSV
 * (`symbol,name,reportDate,fiscalDateEnding,estimate,currency`).
 *
 * Used by Golden Egg fundamentals, the scanner earnings hard block, /api/earnings, /api/earnings-calendar and the
 * Radar collector, so they all agree. Columns are found by header name, quoted names such as
 * `"FLAGSTAR BANK, N.A."` are read correctly, and a row whose report date cannot be read is SKIPPED AND REPORTED
 * (`skipped`), never silently turned into "no earnings".
 */
import { parseCsvTable } from './csv';

export interface EarningsCalendarRow {
  symbol: string;
  name: string;
  reportDate: string;
  fiscalDateEnding: string;
  estimate: number | null;
  currency: string;
}

export interface SkippedEarningsRow {
  /** Upper-cased symbol if one could be read, else ''. */
  symbol: string;
  /** 1-based line number in the CSV (header = line 1). */
  line: number;
  /** The unreadable report-date cell. */
  value: string;
}

export interface ParsedEarningsCalendar {
  /** True when the text had a header with `symbol` and `reportDate` columns (i.e. it really was the calendar). */
  headerOk: boolean;
  rows: EarningsCalendarRow[];
  /** Rows dropped because their report date was not a real YYYY-MM-DD date. */
  skipped: SkippedEarningsRow[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === value;
}

function parseEstimate(raw: string): number | null {
  if (!raw || /^none$/i.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parseAlphaVantageEarningsCalendar(
  csv: string,
  opts: { source?: string; log?: boolean } = {},
): ParsedEarningsCalendar {
  const table = parseCsvTable(csv ?? '');
  if (table.col('symbol') < 0 || table.col('reportDate') < 0) return { headerOk: false, rows: [], skipped: [] };

  const rows: EarningsCalendarRow[] = [];
  const skipped: SkippedEarningsRow[] = [];
  table.rows.forEach((cols, i) => {
    const symbol = table.get(cols, 'symbol').toUpperCase();
    const reportDate = table.get(cols, 'reportDate');
    if (!symbol && !reportDate) return;
    if (!symbol || !isIsoDate(reportDate)) {
      skipped.push({ symbol, line: i + 2, value: reportDate });
      return;
    }
    rows.push({
      symbol,
      name: table.get(cols, 'name'),
      reportDate,
      fiscalDateEnding: table.get(cols, 'fiscalDateEnding'),
      estimate: parseEstimate(table.get(cols, 'estimate')),
      currency: table.get(cols, 'currency'),
    });
  });

  if (skipped.length && opts.log !== false) {
    const sample = skipped.slice(0, 10).map((s) => `${s.symbol || '?'} (line ${s.line}: ${JSON.stringify(s.value)})`).join(', ');
    console.warn(`[earnings-calendar] ${opts.source ?? 'EARNINGS_CALENDAR'}: skipped ${skipped.length} row(s) with an unreadable report date: ${sample}${skipped.length > 10 ? ', …' : ''}`);
  }
  return { headerOk: true, rows, skipped };
}

/** Earliest report date per symbol (UPPERCASE symbol → YYYY-MM-DD). */
export function earliestReportDates(rows: EarningsCalendarRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of rows) {
    const existing = map.get(r.symbol);
    if (!existing || r.reportDate < existing) map.set(r.symbol, r.reportDate);
  }
  return map;
}
