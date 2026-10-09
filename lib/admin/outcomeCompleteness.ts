export const COMPLETENESS_STATUSES = ['measured','pending','expired','old_method','invalid_move','unknown'] as const;
export type CompletenessStatus = typeof COMPLETENESS_STATUSES[number];
export type CompletenessCounts = Record<CompletenessStatus, number> & {total:number};
export interface OutcomeCompleteness { total: CompletenessCounts; periods: (CompletenessCounts & {day:string})[] }
const empty = (): CompletenessCounts => ({total:0,measured:0,pending:0,expired:0,old_method:0,invalid_move:0,unknown:0});
/** Disjoint status counts from the same rows/query snapshot as Edge Check's measured input. */
export function outcomeCompleteness(rows: {signal_at:string | Date; inclusion_status:string}[]): OutcomeCompleteness {
  const total = empty(), days = new Map<string,CompletenessCounts>();
  for (const row of rows) {
    const at = new Date(row.signal_at);
    const day = Number.isFinite(at.getTime()) ? at.toISOString().slice(0,10) : 'Not recorded';
    const status = COMPLETENESS_STATUSES.includes(row.inclusion_status as CompletenessStatus) ? row.inclusion_status as CompletenessStatus : 'unknown';
    const counts = days.get(day) ?? empty();
    counts.total++; counts[status]++; total.total++; total[status]++; days.set(day,counts);
  }
  return {total,periods:[...days].sort(([a],[b])=>a.localeCompare(b)).map(([day,counts])=>({day,...counts}))};
}
