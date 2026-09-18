/** Provider call counters for the run (reported in DATA HEALTH). */
export const budget = { av: 0, cg: 0, db: 0, errors: 0, startedAt: Date.now() };
export function resetBudget() { budget.av = 0; budget.cg = 0; budget.db = 0; budget.errors = 0; budget.startedAt = Date.now(); }
