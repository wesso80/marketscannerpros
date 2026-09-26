/**
 * Small, dependency-free CSV reader (RFC 4180 basics).
 *
 * - Fields are separated by commas.
 * - A field may be wrapped in double quotes; inside quotes, commas and line breaks are literal and `""` is one `"`.
 * - A quote in the middle of an unquoted field is kept as text (lenient, so one bad row can't swallow the next).
 * - Lines end with LF or CRLF. A leading UTF-8 byte-order mark is ignored. Blank lines are skipped.
 *
 * Alpha Vantage CSVs (EARNINGS_CALENDAR, IPO_CALENDAR, LISTING_STATUS) quote company names that contain a comma,
 * e.g. `FLG,"FLAGSTAR BANK, N.A.",2026-10-23,...`. Splitting those lines on every comma shifts every later column,
 * so always read provider CSV text through this module.
 */

/** Parse a whole CSV document into rows of raw field strings (not trimmed). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  if (!text) return rows;
  let src = text;
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);

  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldStarted = false; // current row has any content yet
  let quotedField = false; // current field was opened with a quote

  const endField = () => { row.push(field); field = ''; quotedField = false; };
  const endRow = () => { endField(); rows.push(row); row = []; fieldStarted = false; };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
      continue;
    }
    // A quote opens a quoted field only at the start of a field; a stray quote mid-field is literal text.
    if (ch === '"' && field === '' && !quotedField) { inQuotes = true; quotedField = true; fieldStarted = true; continue; }
    if (ch === ',') { endField(); fieldStarted = true; continue; }
    if (ch === '\r') { if (src[i + 1] === '\n') i++; endRow(); continue; }
    if (ch === '\n') { endRow(); continue; }
    field += ch;
    fieldStarted = true;
  }
  if (fieldStarted || row.length > 0) endRow();
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/** Parse one CSV line (no line breaks outside quotes) into raw fields. */
export function parseCsvLine(line: string): string[] {
  return parseCsv(line)[0] ?? [];
}

export interface CsvTable {
  /** Header names, trimmed, original case. */
  headers: string[];
  /** Data rows (fields trimmed). */
  rows: string[][];
  /** Index of a column by header name, case-insensitive; -1 when absent. */
  col: (name: string) => number;
  /** Trimmed value of `name` in `row`, or '' when the column or cell is missing. */
  get: (row: string[], name: string) => string;
}

/** Parse CSV text whose first row is a header, so columns can be found by name rather than position. */
export function parseCsvTable(text: string): CsvTable {
  const all = parseCsv(text).map((r) => r.map((f) => f.trim()));
  const headers = all[0] ?? [];
  const lower = headers.map((h) => h.toLowerCase());
  const col = (name: string) => lower.indexOf(name.toLowerCase());
  const get = (row: string[], name: string) => {
    const i = col(name);
    return i >= 0 ? (row[i] ?? '').trim() : '';
  };
  return { headers, rows: all.slice(1), col, get };
}
