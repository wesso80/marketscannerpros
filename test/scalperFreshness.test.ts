import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isScalpBarStale,
  rankScalpRows,
  scalpBarAgeMinutes,
  withScalpFreshness,
  type ScalpRowCore,
} from '@/lib/scalper/freshness';
import { COINGECKO_ID_MAP } from '@/lib/coingecko';

const NOW = Date.parse('2026-09-25T17:40:00Z');

function row(over: Partial<ScalpRowCore> & { symbol?: string } = {}) {
  return {
    symbol: 'BTC',
    assetClass: 'crypto' as const,
    timeframe: '5min' as const,
    lastBar: '2026-09-25 17:35:00',
    price: 100,
    direction: 'long' as const,
    strength: 85,
    entry: 100,
    stop: 97,
    target1: 104,
    target2: 107,
    riskReward: 1.33,
    ...over,
  };
}

describe('scalper bar freshness', () => {
  it('reads crypto bars as UTC and equity bars as US/Eastern', () => {
    expect(scalpBarAgeMinutes('2026-09-25 17:35:00', 'crypto', NOW)).toBe(5);
    // 13:35 New York (EDT, UTC-4) = 17:35 UTC -> 5 minutes old, not 4h05m.
    expect(scalpBarAgeMinutes('2026-09-25 13:35:00', 'equity', NOW)).toBe(5);
  });

  it('uses 15 min (5min) and 45 min (15min) thresholds; unknown age is stale', () => {
    expect(isScalpBarStale(15, '5min')).toBe(false);
    expect(isScalpBarStale(15.1, '5min')).toBe(true);
    expect(isScalpBarStale(45, '15min')).toBe(false);
    expect(isScalpBarStale(46, '15min')).toBe(true);
    expect(isScalpBarStale(null, '5min')).toBe(true);
  });

  it('a stale row (e.g. MATIC 8305h old) gets no score, direction or levels', () => {
    const stale = withScalpFreshness(row({ symbol: 'MATIC', lastBar: '2025-10-12 18:00:00' }), NOW);
    expect(stale.stale).toBe(true);
    expect(stale.strength).toBeNull();
    expect(stale.direction).toBe('neutral');
    expect(stale.riskReward).toBe(0);
    expect([stale.entry, stale.stop, stale.target1, stale.target2]).toEqual([100, 100, 100, 100]);
    expect(stale.barAgeMinutes).toBeGreaterThan(8000 * 60);
  });

  it('treats long and short stale rows the same way', () => {
    const long = withScalpFreshness(row({ lastBar: '2026-09-25 16:00:00' }), NOW);
    const short = withScalpFreshness(row({ direction: 'short', stop: 103, target1: 96, target2: 93, lastBar: '2026-09-25 16:00:00' }), NOW);
    expect(long.strength).toBeNull();
    expect(short.strength).toBeNull();
    expect(long.direction).toBe('neutral');
    expect(short.direction).toBe('neutral');
  });

  it('keeps fresh rows untouched', () => {
    const fresh = withScalpFreshness(row(), NOW);
    expect(fresh.stale).toBe(false);
    expect(fresh.strength).toBe(85);
    expect(fresh.direction).toBe('long');
    expect(fresh.barAgeMinutes).toBe(5);
  });

  it('ranks fresh rows by strength and puts stale rows last, whatever their old score', () => {
    const rows = [
      withScalpFreshness(row({ symbol: 'MATIC', strength: 85, lastBar: '2025-10-12 18:00:00' }), NOW),
      withScalpFreshness(row({ symbol: 'ETH', strength: 40 }), NOW),
      withScalpFreshness(row({ symbol: 'SOL', strength: 60, direction: 'short' }), NOW),
    ];
    expect(rankScalpRows(rows).map((r) => r.symbol)).toEqual(['SOL', 'ETH', 'MATIC']);
  });
});

describe('MATIC -> POL in default crypto watchlists', () => {
  it('scalper defaults list POL, not MATIC', () => {
    for (const file of ['app/tools/scalper/page.tsx', 'app/api/scalper/run/route.ts', 'app/admin/scalper/page.tsx', 'lib/operator/watchlists.ts']) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/'MATIC'/);
      expect(src, file).toMatch(/'POL'/);
    }
  });

  it('POL maps to CoinGecko while MATIC stays mapped for old data', () => {
    expect(COINGECKO_ID_MAP.POL).toBe('polygon-ecosystem-token');
    expect(COINGECKO_ID_MAP.MATIC).toBe('matic-network');
  });
});
