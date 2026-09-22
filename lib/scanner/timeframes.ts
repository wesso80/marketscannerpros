import type { CryptoScanTimeframe } from './cryptoBars';

/** Reject unsupported requests instead of silently changing the research horizon. */
export function scannerTimeframe(value: unknown = 'daily'): CryptoScanTimeframe {
  const normalized = value === '1d' ? 'daily' : value;
  if (!['15m', '30m', '1h', 'daily', 'weekly'].includes(normalized as string)) {
    throw new Error('Unsupported scanner timeframe. Choose 15m, 30m, 1h, daily or weekly.');
  }
  return normalized as CryptoScanTimeframe;
}

export function proTimeframe(value: unknown = '1d'): '15m' | '30m' | '1h' | '1d' {
  const timeframe = scannerTimeframe(value);
  if (timeframe === 'weekly') throw new Error('Weekly is available in Ranked; Pro supports 15m, 30m, 1h and 1d.');
  return timeframe === 'daily' ? '1d' : timeframe;
}
