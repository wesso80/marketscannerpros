// PBOC Money Supply (货币供应量) parser — ISOLATED DEV/TEST PROTOTYPE.
//
// Phase 3A.2 validation only. NOT wired to production, macro_series, or any
// route. Parses the official PBOC "货币供应量 / Money Supply" HTML table and
// extracts the nationally-defined M2 (货币和准货币) monthly series.
//
// Fail-closed contract: throws if the M2 row label, unit, chronology, or scale
// does not validate — it must never silently parse the wrong row (e.g. M1/M0).

export interface PbocM2Observation {
  month: string; // YYYY-MM
  value: number; // in 100-million-CNY (亿元)
}

export interface PbocM2Result {
  country: 'China';
  aggregate: 'M2';
  currency: 'CNY';
  unit: '100-million-CNY';
  observations: PbocM2Observation[];
  provider: 'PBOC';
  sourceUrl: string;
  retrievedAt: string;
}

const M2_LABEL = /货币和准货币|Money\s*&\s*Quasi-money/i;
const M2_TAG = /（\s*M2\s*）|\(\s*M2\s*\)/i;
const UNIT_HINT = /亿元|100\s*Million\s*Yuan/i;

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|　/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Split an HTML table into rows of cell-text arrays. */
function tableRows(html: string): string[][] {
  const rows: string[][] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(html)) !== null) {
    const cells: string[] = [];
    const tdRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let c: RegExpExecArray | null;
    while ((c = tdRe.exec(m[1])) !== null) cells.push(stripTags(c[1]));
    rows.push(cells);
  }
  return rows;
}

function parseMonthHeader(cells: string[]): string[] {
  // Cells like "2026.01" .. "2026.12" → "2026-01".
  return cells.map((c) => {
    const mm = c.match(/^(\d{4})[.\-/](\d{1,2})$/);
    return mm ? `${mm[1]}-${mm[2].padStart(2, '0')}` : '';
  });
}

function toNumber(s: string): number | null {
  const cleaned = s.replace(/,/g, '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/**
 * Parse a PBOC Money Supply HTML table (single year). Returns the M2 monthly
 * series for the months that carry values. Throws on any validation failure.
 */
export function parsePbocMoneySupplyHtml(html: string, sourceUrl: string, retrievedAt = new Date().toISOString()): PbocM2Result {
  if (!UNIT_HINT.test(html)) throw new Error('PBOC parse: unit 亿元/100 Million Yuan not found — refusing to guess scale');

  const rows = tableRows(html);
  if (rows.length === 0) throw new Error('PBOC parse: no table rows');

  // Month header: the row containing 项目/Item and YYYY.MM tokens.
  const headerRow = rows.find((r) => r.some((c) => /项目|Item/.test(c)) && r.some((c) => /^\d{4}[.\-/]\d{1,2}$/.test(c)));
  if (!headerRow) throw new Error('PBOC parse: month header row (项目/Item + YYYY.MM) not found');
  const months = parseMonthHeader(headerRow);

  // M2 row: label must contain BOTH the Chinese/English name AND the (M2) tag,
  // so an M1/M0 row can never be mistaken for it.
  const m2Row = rows.find((r) => {
    const joined = r.join(' ');
    return M2_LABEL.test(joined) && M2_TAG.test(joined) && !/M1|M0/.test(joined.replace(M2_TAG, ''));
  });
  if (!m2Row) throw new Error('PBOC parse: M2 row (货币和准货币（M2）) not found — failing closed');

  // Align numeric cells to month columns.
  const obs: PbocM2Observation[] = [];
  for (let i = 0; i < m2Row.length; i++) {
    const month = months[i];
    if (!month) continue;
    const v = toNumber(m2Row[i]);
    if (v == null) continue;
    obs.push({ month, value: v });
  }

  if (obs.length === 0) throw new Error('PBOC parse: no numeric M2 observations aligned to months');
  // Unique months.
  const seen = new Set<string>();
  for (const o of obs) {
    if (seen.has(o.month)) throw new Error(`PBOC parse: duplicate month ${o.month}`);
    seen.add(o.month);
  }
  // Ascending chronology.
  for (let i = 1; i < obs.length; i++) {
    if (obs[i].month <= obs[i - 1].month) throw new Error('PBOC parse: months not strictly ascending');
  }
  // Realistic scale: China M2 in 亿元 is > 1,000,000 (i.e. > 100T CNY) in the 2020s.
  const last = obs[obs.length - 1].value;
  if (!(last > 1_000_000 && last < 100_000_000)) throw new Error(`PBOC parse: M2 scale ${last} 亿元 outside sane bounds`);

  return {
    country: 'China',
    aggregate: 'M2',
    currency: 'CNY',
    unit: '100-million-CNY',
    observations: obs,
    provider: 'PBOC',
    sourceUrl,
    retrievedAt,
  };
}
