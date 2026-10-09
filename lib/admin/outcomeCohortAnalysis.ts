import { selectOutcomeCohort, type EvidenceRecord, type OutcomeCohort } from './verifiedOutcomes';

export type AnalysisScope = 'signals' | 'scorecard' | 'backtest';
export interface AnalysisRow {
  group_name: string;
  signal_at: string;
  provenance_evidence?: EvidenceRecord;
}
export interface CohortMetrics {
  records: number; correct: number; wrong: number; neutral: number;
  directionalDenominator: number; directionalHitRate: number | null;
  moveSamples: number; avgSignedMovePct: number | null;
}
function metrics(rows: AnalysisRow[]): CohortMetrics {
  let correct = 0, wrong = 0, neutral = 0, moveSamples = 0, moveSum = 0;
  for (const row of rows) {
    const e = row.provenance_evidence;
    if (e?.outcome === 'correct') correct++;
    if (e?.outcome === 'wrong') wrong++;
    if (e?.outcome === 'neutral') neutral++;
    const move = e?.pctMove == null || e.pctMove === '' ? NaN : Number(e.pctMove);
    const direction = String(e?.direction ?? '').toUpperCase();
    if (Number.isFinite(move) && Math.abs(move) <= 100 && ['LONG', 'SHORT'].includes(direction)) {
      moveSamples++;
      moveSum += direction === 'SHORT' ? -move : move;
    }
  }
  return { records: rows.length, correct, wrong, neutral, directionalDenominator: correct + wrong,
    directionalHitRate: correct + wrong ? Math.round(correct / (correct + wrong) * 1000) / 10 : null,
    moveSamples, avgSignedMovePct: moveSamples ? Math.round(moveSum / moveSamples * 1000) / 1000 : null };
}
export function analyzeOutcomeCohort(rows: AnalysisRow[], cohort: OutcomeCohort) {
  const selected = selectOutcomeCohort(rows, cohort);
  const groups = new Map<string, AnalysisRow[]>();
  let latest = -Infinity;
  for (const row of selected.rows) {
    const name = row.group_name || 'UNKNOWN';
    const group = groups.get(name) ?? [];
    group.push(row); groups.set(name, group);
    const timestamp = new Date(row.signal_at).getTime();
    if (Number.isFinite(timestamp)) latest = Math.max(latest, timestamp);
  }
  return {
    provenance: selected.summary, overall: metrics(selected.rows),
    groups: [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, group]) => ({name, ...metrics(group)})),
    dataAsOf: Number.isFinite(latest) ? new Date(latest).toISOString() : null,
  };
}
