/** Visible attribution for public macro readings. No server imports: client pages use this file. */

export const FRED_PUBLIC_SOURCE = 'Source: FRED (Federal Reserve Bank of St. Louis)';

/** Shown when a FRED read fails. A missing print is not a zero. */
export const FRED_UNAVAILABLE = 'FRED unavailable';

/** Failed public reads stay uncached, or cached for at most a few minutes. */
export const PUBLIC_FRED_FAILURE_TTL_MS = 2 * 60 * 1000;

export interface FredDatedReading {
  label: string;
  date?: string | null;
  unavailable?: boolean;
}

export function fredSourceLine(asOf?: string | null): string {
  const day = observationDay(asOf);
  return day ? `${FRED_PUBLIC_SOURCE}. As of ${day}.` : FRED_PUBLIC_SOURCE;
}

/** Source line plus each reading's observation date, or a per-series unavailable label. */
export function fredReadingCitation(asOf: string | null | undefined, readings: FredDatedReading[]): string {
  const parts = readings.map((row) => {
    if (row.unavailable) return `${row.label}: ${FRED_UNAVAILABLE}`;
    const day = observationDay(row.date);
    return day ? `${row.label} ${day}` : null;
  }).filter((part): part is string => part != null);
  const head = fredSourceLine(asOf);
  return parts.length ? `${head} ${parts.join('; ')}.` : head;
}

/** Newest YYYY-MM-DD among observation dates. Response assembly time is not an observation date. */
export function newestObservationDate(dates: Array<string | null | undefined>): string | null {
  const days = dates.map(observationDay).filter((day): day is string => day != null).sort();
  return days.length ? days[days.length - 1] : null;
}

function observationDay(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}
