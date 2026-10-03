/**
 * Response filter for stored daily picks. Forex rows stay in the database; callers drop them
 * when building a response. Scan jobs are not involved.
 */
export function omitForexPicks<T extends { asset_class?: string | null }>(rows: readonly T[]): T[] {
  return rows.filter((row) => String(row.asset_class ?? '').trim().toLowerCase() !== 'forex');
}
