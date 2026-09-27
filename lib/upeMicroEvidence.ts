/** Quality envelope for the existing UPE breadth/volume micro regime, not a macro forecast. */
export const MICRO_EVIDENCE_VERSION = 1;
export const MICRO_MAX_AGE_MS = 2 * 60 * 60_000;
export const MICRO_MIN_SYMBOLS = 20;
export const MICRO_MIN_COVERAGE = 0.8;
export interface MicroInput {
  assetClass: 'equity' | 'crypto';
  changePercent: number | null;
  relVol: number;
  fetchedAt: string | Date | null;
  observedAt: string | Date | null;
}
export function buildMicroEvidence(rows: MicroInput[], nowMs: number) {
  const valid = rows.filter(r => {
    const fetched = r.fetchedAt == null ? NaN : new Date(r.fetchedAt).getTime();
    const observed = r.observedAt == null ? NaN : new Date(r.observedAt).getTime();
    return r.changePercent !== null && Number.isFinite(r.changePercent) && Number.isFinite(r.relVol) && r.relVol > 0 &&
      [fetched, observed].every(t => Number.isFinite(t) && t <= nowMs && nowMs - t <= MICRO_MAX_AGE_MS);
  });
  const coverage = rows.length ? valid.length / rows.length : 0;
  const usable = valid.length >= MICRO_MIN_SYMBOLS && coverage >= MICRO_MIN_COVERAGE;
  const breadthPercent = valid.length ? valid.filter(r => r.changePercent! > 0).length / valid.length * 100 : null;
  const avgAbsMove = valid.length ? valid.reduce((sum, r) => sum + Math.abs(r.changePercent!), 0) / valid.length : null;
  const avgRelVol = valid.length ? valid.reduce((sum, r) => sum + r.relVol, 0) / valid.length : null;
  const score = usable ? ((breadthPercent! - 50) * 0.12) + ((avgRelVol! - 1) * 4) - Math.max(0, avgAbsMove! - 2.5) : null;
  return {
    microState: score === null ? 'unknown' : score >= 2 ? 'risk_on' : score <= -2 ? 'risk_off' : 'neutral',
    components: {
      evidenceVersion: MICRO_EVIDENCE_VERSION, usable, coverage, symbolCount: valid.length, universeCount: rows.length,
      breadthPercent, avgAbsMove, avgRelVol,
      sourceOldestAt: valid.length ? new Date(Math.min(...valid.flatMap(r => [new Date(r.fetchedAt!).getTime(), new Date(r.observedAt!).getTime()]))).toISOString() : null,
      source: 'quotes_latest fetched_at and observed_at; UPE breadth/volume micro regime',
      reason: usable ? null : `Requires ${MICRO_MIN_SYMBOLS} valid symbols and ${MICRO_MIN_COVERAGE * 100}% fresh quote coverage`,
    },
  };
}
