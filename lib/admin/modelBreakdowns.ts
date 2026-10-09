import { computeCalibration, MIN_LABELLED_FOR_COMPARISON, type OutcomeRow } from './modelDiagnostics';

export type BreakdownDimension = 'asset' | 'timeframe' | 'regime';
export type BreakdownRow = OutcomeRow & {
  asset_type?: string | null;
  timeframe?: string | null;
  regime?: string | null;
  signal_at?: string | Date | null;
};
export interface OutcomeGroup {
  name: string;
  signals: number;
  labelled: number;
  wins: number;
  losses: number;
  neutral: number;
  pending: number;
  expired: number;
  excludedOrUnknown: number;
  excludedScores: number;
  hitRate: number | null;
  smallSample: boolean;
  sampleFrom: string | null;
  sampleTo: string | null;
  undatedSignals: number;
}
export type OutcomeBreakdowns = Record<BreakdownDimension, OutcomeGroup[]>;

function groupName(row: BreakdownRow, dimension: BreakdownDimension): string {
  const value = String(dimension === 'asset' ? row.asset_type ?? '' : row[dimension] ?? '').trim();
  if (!value) return 'Not recorded';
  if (dimension === 'asset') {
    const asset = value.toLowerCase();
    if (['equity', 'equities', 'stock', 'stocks', 'etf'].includes(asset)) return 'Equities';
    if (asset === 'crypto') return 'Crypto';
    return asset;
  }
  return dimension === 'regime' ? value.toUpperCase() : value.toLowerCase();
}

/** Three separate partitions of the same selected cohort, never a new query or winner ranking. */
export function computeBreakdowns(rows: BreakdownRow[]): OutcomeBreakdowns {
  const result = {} as OutcomeBreakdowns;
  for (const dimension of ['asset', 'timeframe', 'regime'] as const) {
    const groups = new Map<string, BreakdownRow[]>();
    for (const row of rows) {
      const name = groupName(row, dimension);
      const group = groups.get(name) ?? [];
      group.push(row);
      groups.set(name, group);
    }
    result[dimension] = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, group]) => {
      const calibration = computeCalibration(group);
      const total = (field: 'cases' | 'wins' | 'losses' | 'neutral' | 'pending' | 'expired' | 'excludedOrUnknown') =>
        calibration.buckets.reduce((sum, bucket) => sum + bucket[field], 0);
      const times = group.map(row => row.signal_at ? new Date(row.signal_at).getTime() : NaN).filter(Number.isFinite);
      return {
        name, signals: group.length, labelled: calibration.totalLabelled,
        wins: total('wins'), losses: total('losses'), neutral: total('neutral'),
        pending: total('pending'), expired: total('expired'), excludedOrUnknown: total('excludedOrUnknown'),
        excludedScores: group.length - total('cases'), hitRate: calibration.overallHitRate,
        smallSample: calibration.totalLabelled < MIN_LABELLED_FOR_COMPARISON,
        sampleFrom: times.length ? new Date(Math.min(...times)).toISOString() : null,
        sampleTo: times.length ? new Date(Math.max(...times)).toISOString() : null,
        undatedSignals: group.length - times.length,
      };
    });
  }
  return result;
}
