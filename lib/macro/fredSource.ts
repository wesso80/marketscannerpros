/** Visible attribution for public macro readings. No server imports: client pages use this file. */

export const FRED_PUBLIC_SOURCE = 'Source: FRED (Federal Reserve Bank of St. Louis)';

export function fredSourceLine(asOf?: string | null): string {
  const day = observationDay(asOf);
  return day ? `${FRED_PUBLIC_SOURCE}. As of ${day}.` : FRED_PUBLIC_SOURCE;
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
