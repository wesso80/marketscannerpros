import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyCanonicalToScannerRow, canonicalFeaturesFromCandles, canonicalFeaturesFromRow, compareCanonicalRows, dataWatchFrom,
  evaluateCanonical, hardBlocksFrom, type CanonicalResult,
} from '@/lib/scoring/canonical';
import { buildRankedQueue, computeMspScore, deriveLifecycleState } from '@/lib/scanner/rankedQueue';

function candles(n: number, drift = 0.0015) {
  return Array.from({ length: n }, (_, i) => {
    const c = 100 * (1 + drift * i + 0.03 * Math.sin(i / 9));
    return { t: new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString(), open: c * 0.998, high: c * 1.01, low: c * 0.99, close: c, volume: 1e6 + (i % 7) * 1e5 };
  });
}

function canonical(overrides: Partial<CanonicalResult> = {}): CanonicalResult {
  const f = canonicalFeaturesFromCandles(candles(420))!;
  return { ...evaluateCanonical({ symbol: 'X', assetClass: 'equity', timeframe: 'daily', features: f }), ...overrides };
}

describe('canonical ↔ scanner adapter', () => {
  it('features from scanner candles: volume 0 is treated as missing, not zero', () => {
    const noVol = candles(300).map((c) => ({ ...c, volume: 0 }));
    expect(canonicalFeaturesFromCandles(noVol)!.volumeRatio).toBeNull();
    expect(canonicalFeaturesFromCandles(candles(300))!.volumeRatio).not.toBeNull();
    expect(canonicalFeaturesFromCandles(candles(10))).toBeNull();
    expect(canonicalFeaturesFromRow({ price: 10, indicators: { rsi: 55, atr: 0.3, ema50: 9.5 } })!.mode).toBe('snapshot');
  });

  it('keeps only hard/data blocks and data watch reasons from the legacy contract', () => {
    const blocks = [{ code: 'STALE_DATA', message: 's' }, { code: 'REGIME_GATE', message: 'g' }, { code: 'REGIME_CHAOS', message: 'c' }, { code: 'EARNINGS_IN_WINDOW', message: 'e' }];
    expect(hardBlocksFrom(blocks).map((b) => b.code)).toEqual(['STALE_DATA', 'EARNINGS_IN_WINDOW']);
    expect(dataWatchFrom([{ code: 'DATA_DELAYED', message: 'd' }, { code: 'INSUFFICIENT_DATA', message: 'i' }]).map((b) => b.code)).toEqual(['DATA_DELAYED']);
  });

  it('projects the canonical verdict onto the row so every field agrees; the old scenario is kept', () => {
    const c = canonical({ permission: 'PASS', direction: 'short', grade: 'A', score: 88 });
    const row = applyCanonicalToScannerRow({ symbol: 'X', direction: 'bullish', score: 40, entry: 1, stop: 0.9, target: 1.3, permission: 'BLOCK' }, c);
    expect(row.canonical).toBe(c);
    expect(row.direction).toBe('bearish');
    expect(row.permission).toBe('PASS');
    expect(row.score).toBe(88);
    expect((row as any).legacyScenario).toMatchObject({ direction: 'bullish', score: 40, permission: 'BLOCK' });
    if (c.levels) expect(row.stop).toBe(c.levels.invalidation);
  });

  it('ranks by permission, then grade, then score; rows without canonical fall back', () => {
    const rows = [
      { symbol: 'A', canonical: { permission: 'WATCH', grade: 'A', score: 90 } },
      { symbol: 'B', canonical: { permission: 'PASS', grade: 'B', score: 60 } },
      { symbol: 'C', canonical: { permission: 'PASS', grade: 'A', score: 55 } },
      { symbol: 'D' },
    ] as any[];
    expect([...rows].sort(compareCanonicalRows).map((r) => r.symbol)).toEqual(['C', 'B', 'A', 'D']);
    expect(compareCanonicalRows({ symbol: 'x' }, { symbol: 'y' })).toBe(0);
  });

  it('ranked queue and lifecycle read the canonical verdict first', () => {
    const pass = { symbol: 'P', score: 10, compositeV2: { version: 'msp.scanner.v2.4', composite: 10, permission: 'BLOCK' } as any, canonical: canonical({ permission: 'PASS', grade: 'A', score: 81, direction: 'long' }) };
    const blk = { symbol: 'Q', score: 90, compositeV2: { version: 'msp.scanner.v2.4', composite: 90, permission: 'PASS' } as any, canonical: canonical({ permission: 'BLOCK', grade: 'F', score: 30 }) };
    expect(computeMspScore(pass as any, 'trend')).toBe(81);
    expect(deriveLifecycleState(pass as any, 'trend')).toBe('READY');
    expect(deriveLifecycleState(blk as any, 'trend')).toBe('INVALIDATED');
    const q = buildRankedQueue([{ ...blk, _assetClass: 'equity' }, { ...pass, _assetClass: 'equity' }] as any, 'trend');
    expect(q.map((r) => r.symbol)).toEqual(['P', 'Q']);
    expect(q[0]).toMatchObject({ permission: 'PASS', grade: 'A', direction: 'bullish' });
  });

  it('scanner run and bulk routes evaluate the canonical engine', () => {
    const run = fs.readFileSync(path.join(__dirname, '../app/api/scanner/run/route.ts'), 'utf8');
    const bulk = fs.readFileSync(path.join(__dirname, '../app/api/scanner/bulk/route.ts'), 'utf8');
    for (const src of [run, bulk]) {
      expect(src).toMatch(/evaluateCanonical\(/);
      expect(src).toMatch(/applyCanonicalToScannerRow\(/);
      expect(src).toMatch(/compareCanonicalRows\(a, b\) \|\| compareScannerScores\(a, b\)/);
    }
  });
});
