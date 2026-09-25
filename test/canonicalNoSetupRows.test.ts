/**
 * After #51 most rows are canonical "No setup". A no-setup row keeps the indicator factor-bias side (so the Pro
 * Scanner's Factor agreement filter and direction column still work); a hard block has no side; setups rank first.
 */
import { describe, expect, it } from 'vitest';
import { applyCanonicalToScannerRow, canonicalRowLabel, canonicalRowStatus, compareCanonicalRows, noSetupReason, type CanonicalResult } from '@/lib/scoring/canonical';
import { proCandidateMetrics, selectProCandidates, parseProFilters } from '@/lib/scanner/proSelection';

const NO_SETUP_MSG = 'No setup type is eligible on this bar (closest: Trend continuation long — RR_BELOW_MIN: structural reward:risk 0.4 < 1)';
function verdict(kind: 'setup_long' | 'setup_short' | 'no_setup' | 'hard_block' | 'hard_block_no_setup'): CanonicalResult {
  const base = { version: 'test', symbol: 'X', assetClass: 'equity', timeframe: '1d', mode: 'bars', barDate: '2026-09-24', dataTimestamp: '2026-09-24', trust: null, raw: {},
    score: 0, factorScore: 0, scoreBasis: 'factor_alignment_uncalibrated', calibration: null, grade: 'F', watchReasons: [], flags: [], factors: [], coverage: 1,
    levels: null, sizeMultiplier: 0, thresholds: null, candidates: [] } as unknown as CanonicalResult;
  if (kind === 'setup_long' || kind === 'setup_short') {
    return { ...base, setupType: 'PULLBACK', direction: kind === 'setup_long' ? 'long' : 'short', permission: 'WATCH', grade: 'B', score: 70, blockReasons: [],
      watchReasons: [{ code: 'UNCALIBRATED', message: 'factors only' }] };
  }
  const blocks = kind === 'no_setup' ? [{ code: 'NO_SETUP', message: NO_SETUP_MSG }]
    : kind === 'hard_block' ? [{ code: 'STALE_DATA', message: 'stale' }]
    : [{ code: 'EARNINGS_IN_WINDOW', message: 'earnings' }, { code: 'NO_SETUP', message: NO_SETUP_MSG }];
  return { ...base, setupType: 'NONE', direction: 'neutral', permission: 'BLOCK', blockReasons: blocks };
}
const row = (symbol: string, direction: 'bullish' | 'bearish' | 'neutral') => ({
  symbol, direction, score: 60, confidence: 60, indicators: { price: 100, rsi: direction === 'bullish' ? 62 : direction === 'bearish' ? 38 : 50, atr: 2 },
  signals: direction === 'bullish' ? { bullish: 6, bearish: 1, neutral: 1 } : direction === 'bearish' ? { bullish: 1, bearish: 6, neutral: 1 } : { bullish: 2, bearish: 2, neutral: 3 },
});

describe('canonical no-setup rows on the scanner', () => {
  it('classifies verdicts: setup / no setup / hard block (a hard block wins over no-setup)', () => {
    expect(canonicalRowStatus(verdict('setup_long'))).toBe('SETUP');
    expect(canonicalRowStatus(verdict('no_setup'))).toBe('NO_SETUP');
    expect(canonicalRowStatus(verdict('hard_block'))).toBe('HARD_BLOCK');
    expect(canonicalRowStatus(verdict('hard_block_no_setup'))).toBe('HARD_BLOCK');
    expect(noSetupReason(verdict('no_setup'))).toBe('Trend continuation long — RR_BELOW_MIN: structural reward:risk 0.4 < 1');
    expect(canonicalRowLabel(verdict('setup_short'))).toBe('WATCH · Pullback');
    expect(canonicalRowLabel(verdict('no_setup'))).toMatch(/^No setup: Trend continuation long/);
    expect(canonicalRowLabel(verdict('hard_block_no_setup'))).toBe('Blocked: EARNINGS_IN_WINDOW');
  });

  it('a no-setup row keeps its factor-bias side, symmetrically; no levels are invented', () => {
    const up = applyCanonicalToScannerRow({ ...row('U', 'bullish'), entry: 1, stop: 0.9, target: 1.2 }, verdict('no_setup'));
    const dn = applyCanonicalToScannerRow({ ...row('D', 'bearish'), entry: 1, stop: 1.1, target: 0.8 }, verdict('no_setup'));
    expect([up.direction, dn.direction]).toEqual(['bullish', 'bearish']);
    expect((up as any).directionBasis).toBe('factor_bias');
    expect((up as any).canonicalStatus).toBe('NO_SETUP');
    expect(up.setup).toBe('No setup');
    expect([up.entry, up.stop, up.target, dn.entry]).toEqual([undefined, undefined, undefined, undefined]);
    expect(up.canonical.permission).toBe('BLOCK'); // the engine verdict itself is untouched
    expect(proCandidateMetrics(up).alignment).toBe(proCandidateMetrics(dn).alignment);
    expect(proCandidateMetrics(up).alignment).toBeGreaterThanOrEqual(2);
  });

  it('a canonical setup side wins over the factor bias; a hard block has no side', () => {
    const fade = applyCanonicalToScannerRow(row('S', 'bullish'), verdict('setup_short'));
    const fadeUp = applyCanonicalToScannerRow(row('S2', 'bearish'), verdict('setup_long'));
    expect([fade.direction, fadeUp.direction]).toEqual(['bearish', 'bullish']);
    // Factor agreement still reads the indicator factor bias, so a counter-trend setup is not dropped at 2/4.
    expect([proCandidateMetrics(fade).alignment, proCandidateMetrics(fadeUp).alignment]).toEqual([4, 4]);
    const blocked = applyCanonicalToScannerRow(row('B', 'bullish'), verdict('hard_block'));
    expect(blocked.direction).toBe('neutral');
    expect((blocked as any).directionBasis).toBe('hard_block');
  });

  it('default filters keep no-setup rows, drop hard blocks with a named reason, and rank setups first', () => {
    const rows = [
      applyCanonicalToScannerRow(row('NS1', 'bullish'), verdict('no_setup')),
      applyCanonicalToScannerRow(row('HB', 'bullish'), verdict('hard_block')),
      applyCanonicalToScannerRow(row('SET', 'bearish'), verdict('setup_short')),
      applyCanonicalToScannerRow(row('NS2', 'bearish'), verdict('no_setup')),
      applyCanonicalToScannerRow(row('FLAT', 'neutral'), verdict('no_setup')),
    ].sort((a, b) => compareCanonicalRows(a, b) || a.symbol.localeCompare(b.symbol));
    expect(rows.map((r) => r.symbol)).toEqual(['SET', 'FLAT', 'NS1', 'NS2', 'HB']);
    const sel = selectProCandidates(rows, parseProFilters({ minAlignment: 2 }));
    expect(sel.topPicks.map((r) => r.symbol)).toEqual(['SET', 'NS1', 'NS2']);
    expect(sel.selection.exclusions).toEqual({ 'Factor agreement': 1, 'Blocked (data, earnings or liquidity)': 1 });
  });
});
