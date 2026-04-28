export type ScannerVwapMode = 'exchange_session' | 'rolling_24h' | 'full_window';

export function scannerVwapModeFor(type: 'crypto' | 'equity' | 'forex'): ScannerVwapMode {
  if (type === 'crypto') return 'rolling_24h';
  if (type === 'equity') return 'exchange_session';
  return 'full_window';
}

function sessionKeyFromTimestamp(timestamp: string | undefined): string | null {
  if (!timestamp) return null;
  const match = timestamp.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

export function calculateScannerVwapSeries(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  timestamps: string[] = [],
  mode: ScannerVwapMode = 'full_window',
): number[] {
  const result: number[] = [];
  let cumTPV = 0;
  let cumVol = 0;
  let currentSessionKey: string | null = null;
  const rollingWindow = 96;

  for (let i = 0; i < closes.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    const volume = Math.max(0, Number(volumes[i] ?? 0));
    const typicalPrice = (high + low + close) / 3;

    if (![high, low, close, volume].every(Number.isFinite)) {
      result.push(Number.NaN);
      continue;
    }

    if (mode === 'exchange_session') {
      const nextSessionKey = sessionKeyFromTimestamp(timestamps[i]);
      if (nextSessionKey && nextSessionKey !== currentSessionKey) {
        currentSessionKey = nextSessionKey;
        cumTPV = 0;
        cumVol = 0;
      }
    }

    if (mode === 'rolling_24h') {
      const start = Math.max(0, i - rollingWindow + 1);
      let rollingTPV = 0;
      let rollingVol = 0;
      for (let j = start; j <= i; j++) {
        const rollingVolume = Math.max(0, Number(volumes[j] ?? 0));
        const rollingTypicalPrice = (highs[j] + lows[j] + closes[j]) / 3;
        if (Number.isFinite(rollingTypicalPrice) && Number.isFinite(rollingVolume)) {
          rollingTPV += rollingTypicalPrice * rollingVolume;
          rollingVol += rollingVolume;
        }
      }
      result.push(rollingVol > 0 ? rollingTPV / rollingVol : typicalPrice);
      continue;
    }

    cumTPV += typicalPrice * volume;
    cumVol += volume;
    result.push(cumVol > 0 ? cumTPV / cumVol : typicalPrice);
  }

  return result;
}
