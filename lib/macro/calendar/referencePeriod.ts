/**
 * Reference-period normalization.
 *
 * Providers and the curated seed express periods loosely ("Aug", "Q3",
 * "Aug 2026", "2026-08", "Aug/01"). The canonical form is:
 *   monthly   -> "Aug 2026"
 *   quarterly -> "Q3 2026"
 *   annual    -> "2026"
 * The year is resolved from the release date when absent: a period that would
 * otherwise sit after the release month belongs to the previous year (Dec CPI
 * released in Jan; Q4 GDP released in Jan/Feb).
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthIndex(token: string): number {
  const t = token.toLowerCase().slice(0, 3);
  if (t === 'sept') return 8;
  return MONTHS.indexOf(t);
}

export interface ReleaseDateParts {
  year: number;
  /** 1-12 */
  month: number;
}

/**
 * Returns the canonical period or null when the raw value carries no usable
 * period information. Never guesses a period that was not supplied.
 */
export function normalizeReferencePeriod(raw: string | null | undefined, release: ReleaseDateParts): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Already canonical: "Aug 2026" / "Q3 2026" / "2026"
  let m = s.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (m) {
    const mi = monthIndex(m[1]);
    if (mi >= 0) return `${MONTH_LABEL[mi]} ${m[2]}`;
  }
  m = s.match(/^Q([1-4])\s*[-/ ]?\s*(\d{4})$/i) ?? s.match(/^(\d{4})\s*[-/ ]?\s*Q([1-4])$/i);
  if (m) {
    const [q, y] = /^q/i.test(s) ? [m[1], m[2]] : [m[2], m[1]];
    return `Q${q} ${y}`;
  }
  if (/^\d{4}$/.test(s)) return s;

  // ISO month "2026-08"
  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const mi = parseInt(m[2], 10) - 1;
    if (mi >= 0 && mi < 12) return `${MONTH_LABEL[mi]} ${m[1]}`;
  }

  // Quarter without year "Q3"
  m = s.match(/^Q([1-4])$/i);
  if (m) {
    const q = parseInt(m[1], 10);
    const quarterEndMonth = q * 3;
    // A quarter whose end-month is after the release month is last year's.
    const year = quarterEndMonth > release.month ? release.year - 1 : release.year;
    return `Q${q} ${year}`;
  }

  // Month without year: "Aug", "Aug/01" (TE weekly refs keep the month only)
  m = s.match(/^([A-Za-z]{3,9})(?:[\/\s-].*)?$/);
  if (m) {
    const mi = monthIndex(m[1]);
    if (mi >= 0) {
      const period = mi + 1;
      const year = period > release.month ? release.year - 1 : release.year;
      return `${MONTH_LABEL[mi]} ${year}`;
    }
  }

  return s;
}

/** Order key for sorting periods chronologically: "Aug 2026" -> 202608, "Q3 2026" -> 202609. */
export function referencePeriodOrdinal(period: string | null): number | null {
  if (!period) return null;
  let m = period.match(/^([A-Za-z]{3}) (\d{4})$/);
  if (m) return parseInt(m[2], 10) * 100 + monthIndex(m[1]) + 1;
  m = period.match(/^Q([1-4]) (\d{4})$/);
  if (m) return parseInt(m[2], 10) * 100 + parseInt(m[1], 10) * 3;
  m = period.match(/^(\d{4})$/);
  if (m) return parseInt(m[1], 10) * 100 + 12;
  return null;
}
