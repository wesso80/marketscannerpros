/**
 * Phase 1 · PR-2a — approvals are reachable: no ×0.4 crush, no circular gates, explicit permission + reason codes.
 */
import { describe, expect, it } from 'vitest';
import type { FactorInput } from '@/lib/analysis/scannerScoreV2';
import { buildScannerScore, isVersionedScannerScore, SCANNER_SCORE_VERSION } from '@/lib/scanner/scoreContract';
import { computeRegimeScore } from '@/lib/ai/regimeScoring';
import { computeInstitutionalFilter } from '@/lib/institutionalFilter';
import { computeMspScore, deriveLifecycleState } from '@/lib/scanner/rankedQueue';

const factors: FactorInput[] = ['TREND', 'MOMENTUM', 'VOLUME', 'RELATIVE_STRENGTH', 'VOLATILITY']
  .map((f) => ({ factor: f as FactorInput['factor'], signed: 0.8, available: true }));
const base = { factors, regime: 'trending' as const, freshness: 'live' as const, trustLevel: 'GOOD' as const };

describe('scanner score contract v2.2+', () => {
  it('a regime-gated row keeps its honest composite; the block is carried by permission + reason code', () => {
    const open = buildScannerScore(base);
    const gated = buildScannerScore({ ...base, gateBlocks: [{ code: 'REGIME_GATE', message: 'TA=40 < gate 50' }] });
    expect(gated.composite).toBe(open.composite); // was open × 0.4
    expect(gated.gateMultiplier).toBe(1);
    expect(gated.permission).toBe('BLOCK');
    expect(gated.blockReasons.map((r) => r.code)).toEqual(['REGIME_GATE']);
    expect(open.permission).toBe('PASS');
    expect(open.blockReasons).toEqual([]);
  });

  it('legacy boolean regimeGated still blocks with a code', () => {
    const r = buildScannerScore({ ...base, regimeGated: true });
    expect(r.permission).toBe('BLOCK');
    expect(r.blockReasons[0].code).toBe('REGIME_GATE');
  });

  it('data problems produce machine-readable codes', () => {
    expect(buildScannerScore({ ...base, trustLevel: 'STALE', trustReasons: ['Last bar 5 days old'] }).blockReasons)
      .toEqual([{ code: 'DATA_TRUST_STALE', message: 'Last bar 5 days old' }]);
    expect(buildScannerScore({ ...base, trustLevel: undefined }).blockReasons.map((r) => r.code)).toContain('DATA_TRUST_UNEVALUATED');
    expect(buildScannerScore({ ...base, freshness: 'stale' }).blockReasons.map((r) => r.code)).toContain('DATA_FRESHNESS');
    // v2.3: an unknown bar time is missing information → WATCH flag, not a block.
    const unknown = buildScannerScore({ ...base, freshness: 'unknown' });
    expect(unknown.permission).toBe('WATCH');
    expect(unknown.watchReasons.map((r) => r.code)).toEqual(['DATA_TIMESTAMP_UNKNOWN']);
    const watch = buildScannerScore({ ...base, trustLevel: 'DEGRADED' });
    expect(watch.permission).toBe('WATCH');
    expect(watch.watchReasons.map((r) => r.code)).toEqual(['DATA_TRUST_DEGRADED']);
  });

  it('version helper accepts cached v2.1 rows', () => {
    expect(SCANNER_SCORE_VERSION).toBe('msp.scanner.v2.3');
    expect(isVersionedScannerScore('msp.scanner.v2.2')).toBe(true);
    expect(isVersionedScannerScore('msp.scanner.v2.1')).toBe(true);
    expect(isVersionedScannerScore(undefined)).toBe(false);
  });
});

describe('regime gates are not circular', () => {
  const comps = { SQ: 30, TA: 60, VA: 50, LL: 70, MTF: 60, FD: 45 };
  it('SQ (= the scanner score) gate can be skipped by the scanner', () => {
    expect(computeRegimeScore(comps, 'RANGE_COMPRESSION').gated).toBe(true); // SQ 30 < 55
    const skip = computeRegimeScore(comps, 'RANGE_COMPRESSION', { ignoreGates: ['SQ'] });
    expect(skip.gated).toBe(false);
    expect(computeRegimeScore(comps, 'TRANSITION', { ignoreGates: ['SQ'] }).gated).toBe(false);
  });
  it('independent gates still apply', () => {
    expect(computeRegimeScore({ ...comps, TA: 40 }, 'TREND_EXPANSION', { ignoreGates: ['SQ'] }).gated).toBe(true);
  });
});

describe('institutional filter exposes score-independent hard blocks', () => {
  it('a low base score is noTrade but NOT a hard block', () => {
    const r = computeInstitutionalFilter({ baseScore: 20, strategy: 'unknown', regime: 'trending', dataHealth: { freshness: 'LIVE' } });
    expect(r.noTrade).toBe(true);
    expect(r.hardBlock).toBe(false);
    expect(r.hardBlockReasons).toEqual([]);
  });
  it('chaos regime / stale data are hard blocks with codes', () => {
    const chaos = computeInstitutionalFilter({ baseScore: 90, strategy: 'unknown', regime: 'high_volatility_chaos', dataHealth: { freshness: 'LIVE' } });
    expect(chaos.hardBlock).toBe(true);
    expect(chaos.hardBlockReasons.map((r) => r.code)).toEqual(['REGIME_CHAOS']);
    const stale = computeInstitutionalFilter({ baseScore: 90, strategy: 'unknown', regime: 'trending', dataHealth: { freshness: 'STALE' } });
    expect(stale.hardBlockReasons.map((r) => r.code)).toEqual(['DATA_UNRELIABLE']);
  });
});

describe('ranked queue uses the explicit permission for versioned rows', () => {
  const row = (permission: 'PASS' | 'WATCH' | 'BLOCK', composite: number, version: string = SCANNER_SCORE_VERSION) =>
    ({ symbol: 'TST', compositeV2: { version, permission, composite }, scoreV2: { regimeScore: { gated: true } } }) as any;
  it('a stale regimeScore.gated flag does not override a PASS permission or crush the score', () => {
    expect(computeMspScore(row('PASS', 80), 'trend')).toBe(80);
    expect(deriveLifecycleState(row('PASS', 80), 'trend')).toBe('READY');
    expect(deriveLifecycleState(row('BLOCK', 80), 'trend')).toBe('INVALIDATED');
  });
  it('unversioned legacy rows keep the old behaviour', () => {
    expect(computeMspScore(row('PASS', 80, ''), 'trend')).toBe(32);
    expect(deriveLifecycleState(row('PASS', 80, ''), 'trend')).toBe('INVALIDATED');
  });
});
