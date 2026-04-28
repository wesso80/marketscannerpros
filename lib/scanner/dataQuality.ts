export type ScannerFreshnessStatus = 'fresh' | 'stale' | 'missing';

export interface ScannerFreshnessAssessment {
  status: ScannerFreshnessStatus;
  penalty: number;
  warnings: string[];
}

function expectedMaxAgeMinutes(timeframe: string): number {
  const normalized = timeframe.toLowerCase();
  if (normalized.includes('5')) return 30;
  if (normalized.includes('15')) return 90;
  if (normalized.includes('30')) return 180;
  if (normalized.includes('60') || normalized.includes('hour')) return 360;
  if (normalized.includes('daily') || normalized.includes('day')) return 4320;
  return 360;
}

export function evaluateScannerFreshness(
  lastCandleTime: string | undefined,
  timeframe: string,
  nowMs = Date.now(),
): ScannerFreshnessAssessment {
  if (!lastCandleTime) {
    return {
      status: 'missing',
      penalty: 18,
      warnings: ['missing_last_candle_time'],
    };
  }

  const parsed = Date.parse(lastCandleTime);
  if (!Number.isFinite(parsed)) {
    return {
      status: 'missing',
      penalty: 18,
      warnings: ['invalid_last_candle_time'],
    };
  }

  const ageMinutes = Math.max(0, (nowMs - parsed) / 60000);
  const maxAgeMinutes = expectedMaxAgeMinutes(timeframe);
  if (ageMinutes <= maxAgeMinutes) {
    return { status: 'fresh', penalty: 0, warnings: [] };
  }

  const staleMultiplier = Math.min(3, ageMinutes / maxAgeMinutes);
  const penalty = Math.round(8 * staleMultiplier);
  return {
    status: 'stale',
    penalty,
    warnings: [`stale_last_candle_${Math.round(ageMinutes)}m`],
  };
}
