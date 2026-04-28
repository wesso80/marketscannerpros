import { PlaybookExpectancyModel, SampleStatus, TradeRowModel } from '@/types/journal';

export const PLAYBOOK_EXPECTANCY_MIN_SAMPLE = 30;
const DEVELOPING_SAMPLE = 10;
const Z_95 = 1.96;

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sampleStatus(sampleSize: number): SampleStatus {
  if (sampleSize >= PLAYBOOK_EXPECTANCY_MIN_SAMPLE) return 'minimum_met';
  if (sampleSize >= DEVELOPING_SAMPLE) return 'developing';
  return 'insufficient';
}

function statusWarning(status: SampleStatus, sampleSize: number): string {
  if (status === 'minimum_met') {
    return `Minimum sample met (${sampleSize}/${PLAYBOOK_EXPECTANCY_MIN_SAMPLE}); still historical and not predictive.`;
  }
  if (status === 'developing') {
    return `Developing sample (${sampleSize}/${PLAYBOOK_EXPECTANCY_MIN_SAMPLE}); treat expectancy as unstable.`;
  }
  return `Thin sample (${sampleSize}/${PLAYBOOK_EXPECTANCY_MIN_SAMPLE}); do not treat expectancy as calibrated.`;
}

function wilsonInterval(wins: number, sampleSize: number): { low: number; high: number } {
  if (sampleSize <= 0) return { low: 0, high: 0 };
  const p = wins / sampleSize;
  const z2 = Z_95 * Z_95;
  const denominator = 1 + z2 / sampleSize;
  const center = p + z2 / (2 * sampleSize);
  const spread = Z_95 * Math.sqrt((p * (1 - p) + z2 / (4 * sampleSize)) / sampleSize);
  return {
    low: Math.max(0, (center - spread) / denominator),
    high: Math.min(1, (center + spread) / denominator),
  };
}

function meanInterval(values: number[], mean: number): { low: number; high: number } {
  if (values.length < 2) return { low: mean, high: mean };
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (values.length - 1);
  const standardError = Math.sqrt(variance) / Math.sqrt(values.length);
  const spread = Z_95 * standardError;
  return { low: mean - spread, high: mean + spread };
}

export function computePlaybookExpectancy(trades: TradeRowModel[]): PlaybookExpectancyModel[] {
  const byPlaybook = new Map<string, number[]>();

  for (const trade of trades) {
    if (trade.status !== 'closed') continue;
    const rMultiple = finiteNumber(trade.rMultiple);
    if (rMultiple == null) continue;
    const playbook = (trade.strategyTag || 'Unlabeled').trim() || 'Unlabeled';
    const values = byPlaybook.get(playbook) || [];
    values.push(rMultiple);
    byPlaybook.set(playbook, values);
  }

  return Array.from(byPlaybook.entries())
    .map(([playbook, values]) => {
      const sampleSize = values.length;
      const wins = values.filter((value) => value > 0).length;
      const totalR = values.reduce((sum, value) => sum + value, 0);
      const expectancyR = sampleSize > 0 ? totalR / sampleSize : 0;
      const status = sampleStatus(sampleSize);
      const winRateCi = wilsonInterval(wins, sampleSize);
      const expectancyCi = meanInterval(values, expectancyR);

      return {
        playbook,
        sampleSize,
        minSampleSize: PLAYBOOK_EXPECTANCY_MIN_SAMPLE,
        sampleStatus: status,
        isMinimumMet: status === 'minimum_met',
        winRate: sampleSize > 0 ? wins / sampleSize : 0,
        winRateCiLow: winRateCi.low,
        winRateCiHigh: winRateCi.high,
        expectancyR,
        expectancyCiLow: expectancyCi.low,
        expectancyCiHigh: expectancyCi.high,
        totalR,
        warning: statusWarning(status, sampleSize),
      } satisfies PlaybookExpectancyModel;
    })
    .sort((a, b) => b.sampleSize - a.sampleSize || b.expectancyR - a.expectancyR)
    .slice(0, 8);
}