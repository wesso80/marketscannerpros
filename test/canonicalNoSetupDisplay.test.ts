/**
 * RS-3 — Golden Egg / Deep Analysis showed a canonical "no setup" result as "BLOCK · F · 0/100" plus
 * "Uncalibrated timeframe/asset". The verdict is right (nothing qualified); the display is not: score 0, grade F and
 * calibration null are engine placeholders on a NONE result. Real verdicts (a setup exists) render as before.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calibrationSummary, noSetupDisplay, scoreLabel } from '@/lib/scoring/canonical/display';
import { evaluateCanonicalFromBars } from '@/lib/scoring/canonical/engine';
import type { CanonicalBar, CanonicalResult } from '@/lib/scoring/canonical/types';

const CLOSEST = 'Trend continuation long — counter-trend: −DI ≥ +DI';
type V = Pick<CanonicalResult, 'score' | 'permission' | 'scoreBasis' | 'calibration' | 'setupType' | 'blockReasons'>;
const noSetup = (over: Partial<V> = {}): V => ({
  setupType: 'NONE', permission: 'BLOCK', score: 0, scoreBasis: 'calibrated_expectancy_percentile', calibration: null,
  blockReasons: [{ code: 'NO_SETUP', message: `No setup type is eligible on this bar (closest: ${CLOSEST})` }], ...over,
});

describe('no-setup display', () => {
  it('shows "No qualifying setup" + the closest candidate, never "0/100"', () => {
    const d = noSetupDisplay(noSetup());
    expect(d).toEqual({ kind: 'no_setup', headline: 'No qualifying setup', detail: `Closest: ${CLOSEST}` });
    expect(scoreLabel(noSetup())).toBe('No qualifying setup');
    expect(scoreLabel(noSetup({ scoreBasis: 'factor_alignment_uncalibrated' }))).toBe('No qualifying setup');
    expect(scoreLabel(noSetup())).not.toMatch(/0\/100/);
  });
  it('has no "Uncalibrated timeframe/asset" line (daily equity/crypto no-setup rows are the calibrated context)', () => {
    expect(calibrationSummary(noSetup())).toBeNull();
    expect(calibrationSummary(noSetup({ scoreBasis: 'factor_alignment_uncalibrated' }))).toBeNull();
  });
  it('no closest reason from the engine → headline only', () => {
    expect(noSetupDisplay(noSetup({ blockReasons: [{ code: 'NO_SETUP', message: 'No setup type is eligible on this bar' }] }))?.detail).toBeNull();
  });
  it('not enough history reads as no setup with the history reason', () => {
    const d = noSetupDisplay(noSetup({ blockReasons: [{ code: 'INSUFFICIENT_HISTORY', message: 'Not enough bars for ATR / EMA50' }] }));
    expect(d).toEqual({ kind: 'no_setup', headline: 'No qualifying setup', detail: 'Not enough bars for ATR / EMA50' });
  });
  it('a hard block on a no-setup bar keeps its block wording (still no 0/100)', () => {
    const v = noSetup({ blockReasons: [{ code: 'STALE_DATA', message: 'Golden Egg data trust is STALE' }, ...noSetup().blockReasons] });
    expect(noSetupDisplay(v)).toEqual({ kind: 'blocked', headline: 'Blocked: STALE_DATA', detail: 'Golden Egg data trust is STALE' });
    expect(scoreLabel(v)).toBe('Blocked: STALE_DATA');
  });
});

describe('real verdicts are unchanged', () => {
  it('a real BLOCK on an existing setup keeps its score and calibration line', () => {
    const blocked: V = { setupType: 'PULLBACK', permission: 'BLOCK', score: 62, scoreBasis: 'factor_alignment_uncalibrated', calibration: null,
      blockReasons: [{ code: 'EARNINGS_IN_WINDOW', message: 'Earnings in 2d' }] };
    expect(noSetupDisplay(blocked)).toBeNull();
    expect(scoreLabel(blocked)).toBe('62/100 factors (uncalibrated)');
    expect(calibrationSummary(blocked)).toMatch(/^Uncalibrated timeframe\/asset/);
  });
  it('a calibrated WATCH keeps its percentile and statistics', () => {
    const watch = { setupType: 'PULLBACK', permission: 'WATCH', score: 80, scoreBasis: 'calibrated_expectancy_percentile', blockReasons: [],
      calibration: { pTargetFirst: 0.55, expectedR: 0.12, costsBps: 10, horizonBars: 20, sample: 1234, validatedEdge: false, percentile: 80 } } as unknown as V;
    expect(noSetupDisplay(watch)).toBeNull();
    expect(scoreLabel(watch)).toBe('80th pct');
    expect(calibrationSummary(watch)).toMatch(/^P\(target before invalidation\) 55%/);
  });
  it('pre-Phase-3 stored results (no scoreBasis, no setupType) render as before', () => {
    expect(scoreLabel({ score: 70, permission: 'WATCH' })).toBe('70/100');
    expect(calibrationSummary({ score: 70, permission: 'WATCH' })).toBeNull();
  });
});

describe('with the real canonical engine', () => {
  it('a directionless daily series is NONE and displays as "No qualifying setup" (no 0/100, no uncalibrated line)', () => {
    const bars: CanonicalBar[] = Array.from({ length: 300 }, (_, i) => {
      const c = 100 + Math.sin(i / 3) * 0.6;
      return { t: new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString(), open: c - 0.1, high: c + 0.5, low: c - 0.5, close: c, volume: 1_000_000 };
    });
    const r = evaluateCanonicalFromBars(bars, { symbol: 'FLAT', assetClass: 'equity', timeframe: 'daily' });
    expect(r.setupType).toBe('NONE');
    expect(r.permission).toBe('BLOCK'); // the verdict itself is unchanged
    expect(scoreLabel(r)).toBe('No qualifying setup');
    expect(calibrationSummary(r)).toBeNull();
    expect(noSetupDisplay(r)?.kind).toBe('no_setup');
  });
});

describe('pages use it and Deep Analysis receives the block reasons', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
  it('Deep Analysis types and uses canonicalVerdict.blockReasons (the API already sends them)', () => {
    const page = src('app/tools/deep-analysis/page.tsx');
    expect(page).toMatch(/canonicalVerdict\?: \{[^}]*blockReasons\?: Array<\{ code: string; message: string \}>/);
    expect(page).toMatch(/noSetupDisplay\(ge\.canonicalVerdict\)/);
    expect(src('app/api/deep-analysis/route.ts')).toMatch(/blockReasons: ge\.canonicalVerdict\.blockReasons/);
  });
  it('Golden Egg renders the no-setup headline instead of the score for NONE', () => {
    const page = src('app/tools/golden-egg/page.tsx');
    expect(page).toMatch(/const geNoSetup = noSetupDisplay\(geEngine\)/);
    expect(page).toMatch(/geNoSetup\.headline/);
  });
});
