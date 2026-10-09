/** Historical, user-recorded evidence. No notes, labels or model-derived scores. */
export interface JournalEvidenceRow {
  is_open: boolean | null;
  outcome: string | null;
  pl: string | number | null;
  trade_date: string | Date | null;
  exit_date: string | Date | null;
}
const date = (value: JournalEvidenceRow['trade_date']) => {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value ? value : null;
};
const amount = (value: JournalEvidenceRow['pl']) => {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value))) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
export function buildJournalEvidence(input: JournalEvidenceRow[]) {
  const rows = input.slice(0, 2000);
  const closed = rows.filter(r => r.is_open === false && r.outcome !== 'open');
  const open = rows.filter(r => r.is_open === true);
  const values = closed.map(r => amount(r.pl));
  const known = values.filter((v): v is number => v !== null);
  const dates = closed.map(r => date(r.exit_date)).filter((v): v is string => v !== null).sort();
  const mismatches = closed.filter(r => {
    const n = amount(r.pl);
    return n !== null && ['win', 'loss', 'breakeven'].includes(r.outcome ?? '') &&
      r.outcome !== (n > 0 ? 'win' : n < 0 ? 'loss' : 'breakeven');
  }).length;
  return {
    sample: `Saved journal sample: ${rows.length} records. ${input.length > 2000 ? 'Limited to the latest 2,000 records by entry date; older records are excluded.' : 'All saved records are included.'}`,
    status: `Recorded status: ${open.length} open, ${closed.length} closed, ${rows.length - open.length - closed.length} unresolved. Open records are excluded from closed outcomes.`,
    outcomes: `Of ${closed.length} closed records, ${known.filter(n => n > 0).length} have positive P&L, ${known.filter(n => n < 0).length} negative P&L, ${known.filter(n => n === 0).length} zero P&L and ${values.filter(n => n === null).length} unavailable P&L.`,
    labels: `${mismatches} closed records have outcome labels that disagree with recorded P&L. Counts use the P&L sign and do not double-count labels.`,
    period: dates.length ? `Recorded close dates range from ${dates[0]} to ${dates[dates.length - 1]}; ${closed.length - dates.length} closed records lack a valid close date.` : 'The sample has no valid recorded close dates; its observation period is unavailable.',
    limits: 'These are user-recorded outcomes, not independently verified returns. Currency, costs and record completeness are not verified. Aggregate monetary returns, profit factor, strategy rankings and emotion correlations are not calculated.',
  };
}
export type JournalEvidence = ReturnType<typeof buildJournalEvidence>;
export const JOURNAL_EXPLANATIONS = {
  history: 'Historical records describe this sample and do not establish future performance.',
  missing: 'Unavailable P&L is not zero. Missing records and dates limit interpretation.',
  scope: 'This summary covers saved Journal records only. Unsaved edits and market data are not included.',
} as const;
export const JOURNAL_SELECTION_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['evidenceIds', 'explanations'],
  properties: {
    evidenceIds: { type: 'array', items: { type: 'string', enum: ['sample', 'status', 'outcomes', 'labels', 'period', 'limits'] } },
    explanations: { type: 'array', items: { type: 'string', enum: Object.keys(JOURNAL_EXPLANATIONS) } },
  },
};
export function renderJournalSelection(value: unknown, evidence: JournalEvidence): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).length !== 2 || !Array.isArray(obj.evidenceIds) || !Array.isArray(obj.explanations)) return null;
  const ids = obj.evidenceIds;
  const explanations = obj.explanations;
  if (!ids.length || ids.length > 6 || explanations.length > 3 || new Set(ids).size !== ids.length || new Set(explanations).size !== explanations.length) return null;
  if (ids.some(id => typeof id !== 'string' || !Object.hasOwn(evidence, id)) ||
    explanations.some(id => typeof id !== 'string' || !Object.hasOwn(JOURNAL_EXPLANATIONS, id))) return null;
  // Always retain the whole small sample and its limitations, even if the model omits them.
  return ['Recorded evidence', ...Object.values(evidence), 'Educational explanation',
    ...new Set(['history', 'scope', ...explanations])].map(line =>
      Object.hasOwn(JOURNAL_EXPLANATIONS, line) ? JOURNAL_EXPLANATIONS[line as keyof typeof JOURNAL_EXPLANATIONS] : line).join('\n\n');
}
