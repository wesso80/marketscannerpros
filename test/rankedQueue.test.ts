import { describe, expect, it } from 'vitest';
import { buildRankedQueue, computeMspScore, deriveLifecycleState, mergeScanResults, normalizeRegimeKey } from '@/lib/scanner/rankedQueue';
import { humanizeEnum } from '@/lib/presentation/labels';
import type { ScanResult } from '@/app/v2/_lib/api';

const r = (symbol: string, composite: number, extra: Partial<ScanResult> = {}): ScanResult =>
  ({ symbol, score: 5, timeframe: 'daily', type: 'equity', confidence: 60, compositeV2: { composite } as any, ...extra } as ScanResult);

describe('canonical ranked queue', () => {
  it('sorts by MSP score desc with deterministic tiebreak, merging equity + crypto exactly like Scanner', () => {
    const rows = buildRankedQueue(mergeScanResults([r('AMD', 40), r('META', 55)], [r('NEAR-USD', 55), r('SOL-USD', 47)]), 'RANGE_NEUTRAL');
    expect(rows.map((x) => `${x.symbol}:${x.mspScore}:${x.assetClass}`)).toEqual(['META:55:equity', 'NEAR-USD:55:crypto', 'SOL-USD:47:crypto', 'AMD:40:equity']);
  });
  it('applies regime gating identically to Scanner', () => {
    const gated = r('X', 80, { scoreV2: { regimeScore: { gated: true } } as any });
    expect(computeMspScore(gated, 'trend')).toBe(32);
    expect(deriveLifecycleState(gated, 'trend')).toBe('INVALIDATED');
    expect(deriveLifecycleState(r('Y', 80, { confidence: 70 }), 'trend')).toBe('READY');
  });
  it('normalises regime enums the same way for both surfaces', () => {
    expect(normalizeRegimeKey('RANGE_NEUTRAL')).toBe('range');
    expect(normalizeRegimeKey('RISK_OFF_STRESS')).toBe('risk_off');
  });
});

describe('presentation labels', () => {
  it('maps known enums and title-cases unknown ones without touching prose', () => {
    expect(humanizeEnum('RANGE_NEUTRAL')).toBe('Range / Neutral');
    expect(humanizeEnum('BREAKOUT_CONFIRMATION')).toBe('Breakout Confirmation');
    expect(humanizeEnum('NEAR_TRIGGER')).toBe('Near Trigger');
    expect(humanizeEnum('CONFIRMED_MOVE')).toBe('Confirmed Move');
    expect(humanizeEnum('SOME_NEW_THING')).toBe('Some New Thing');
    expect(humanizeEnum('Already a sentence.')).toBe('Already a sentence.');
    expect(humanizeEnum(null)).toBe('—');
  });
});
