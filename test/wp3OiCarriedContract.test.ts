import { describe, expect, it } from 'vitest';
import { compareOi24h, HOUR_MS, OI_METHOD, readStoredOiSnapshot, stableOiObservation, type OiObservation } from '@/lib/crypto/oiComparisons';
import { readFileSync } from 'node:fs';

const now = Date.UTC(2026, 9, 5, 4, 0);
function coin(at: number, contracts: Record<string, number>, extra: Record<string, unknown> = {}): OiObservation {
  const value = Object.values(contracts).reduce((sum, item) => sum + item, 0);
  return {
    symbol: 'BTC', method: OI_METHOD, value, observedAt: at, coverage: '[]',
    exchanges: Object.keys(contracts).length, contracts, ...extra,
  };
}

describe('OI 24h overlap', () => {
  it('a carried contract does not null the coin when the overlap still matches', () => {
    const current = coin(now - 10_000, { '["A","BTCUSDT"]': 110, '["B","BTCUSDT"]': 50 }, { carriedContracts: 1 });
    const previous = coin(now - 24 * HOUR_MS, { '["A","BTCUSDT"]': 100, '["B","BTCUSDT"]': 50 }, { carriedContracts: 1 });
    const result = compareOi24h(current, [previous], now);
    expect(result.change24h).not.toBeNull();
    expect(result.change24h).toBeCloseTo((160 / 150 - 1) * 100, 5);
    expect(result.comparedValue).toBe(160);
    expect(result.previousValue).toBe(150);
  });

  it('keeps TON and SHIB on the symbol list and shows nothing when a coin has no contracts', () => {
    const src = readFileSync('lib/crypto/oiHistory.ts', 'utf8');
    expect(src).toContain("'TON'");
    expect(src).toContain("'SHIB'");
    expect(stableOiObservation('TON', [], null, now)).toBeNull();
    expect(stableOiObservation('SHIB', [], null, now)).toBeNull();
  });

  it('reads hourly snapshots stored as a coins wrapper or as a spread array', () => {
    const row = coin(now, { '["A","BTCUSDT"]': 10 });
    expect(readStoredOiSnapshot({ coins: [row], _ts: 1 })).toEqual([row]);
    expect(readStoredOiSnapshot({ 0: row, _ts: 1 })).toEqual([row]);
    expect(readStoredOiSnapshot([row])).toEqual([row]);
    expect(readStoredOiSnapshot({ timeframe: 'daily', barCount: 10 })).toEqual([]);
  });
});
