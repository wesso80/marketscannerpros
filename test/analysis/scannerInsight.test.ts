/**
 * Unit tests for the Scanner insight engine (independent factor model).
 *
 * Pins the fixes from the Scanner review: correlated trend indicators collapse
 * to ONE factor, relative strength is independent, evidence quality caps the
 * composite, setup stage + extension state behave, and output is educational.
 *
 * Run: npx vitest run test/analysis/scannerInsight.test.ts
 */
import { describe, it, expect } from 'vitest';
import { buildScannerInsight, findProhibitedLanguage } from '../../lib/analysis';

const FULL = {
  direction: 'bullish' as const,
  convictionScore: 82,
  changePct: 1.2,
  close: 105,
  ema200: 100,
  macdHist: 0.5,
  macd: 1.2,
  macdSignal: 0.9,
  adx: 28,
  plusDI: 30,
  minusDI: 15,
  aroonUp: 80,
  aroonDown: 20,
  emaStack: 'bullish' as const,
  rsi: 62,
  stochK: 60,
  stochD: 50,
  cci: 90,
  obvChangePct: 1.5,
  mfi: 65,
  vwapPct: 0.8,
  relativeVolume: 1.8,
  bbwp: 18,
  dveBreakoutScore: 72,
  atrPercent: 3,
  relativeStrengthRatio: 1.2,
  freshness: 'live' as const,
};

describe('buildScannerInsight — independent factors', () => {
  it('collapses the four correlated trend indicators into ONE trend factor', () => {
    const insight = buildScannerInsight(FULL);
    const trendFactors = insight.factors.filter((f) => f.group === 'TREND');
    expect(trendFactors).toHaveLength(1);
    expect(trendFactors[0].signal).toBe('bullish');
    // Independent groups are counted once each, not per indicator.
    const groups = new Set(insight.factors.map((f) => f.group));
    expect(groups.size).toBe(insight.factors.length);
  });

  it('treats relative strength as its own independent factor', () => {
    const insight = buildScannerInsight(FULL);
    const rs = insight.factors.find((f) => f.group === 'RELATIVE_STRENGTH');
    expect(rs?.signal).toBe('bullish');
    expect(insight.relativeStrength?.label.toLowerCase()).toContain('outperformer');
  });

  it('frames the composite as strength, never a probability', () => {
    const insight = buildScannerInsight(FULL);
    expect(insight.composite.label).toBe('Composite Strength');
    expect(insight.composite.note.toLowerCase()).toContain('not a statistical probability');
    expect(findProhibitedLanguage(insight.whyRanked.join(' '))).toEqual([]);
    expect(findProhibitedLanguage(insight.cautions.join(' '))).toEqual([]);
  });
});

describe('evidence quality caps the composite', () => {
  it('caps a high conviction score when evidence is thin/stale', () => {
    const insight = buildScannerInsight({
      direction: 'bullish',
      convictionScore: 90,
      close: 105,
      ema200: 100,
      rsi: 60,
      freshness: 'stale',
      changePct: 1,
    });
    // Only ~2 factors + stale -> LOW/INSUFFICIENT -> capped well below 90.
    expect(insight.composite.value).toBeLessThanOrEqual(60);
  });

  it('does not cap when evidence is HIGH', () => {
    const insight = buildScannerInsight(FULL);
    expect(insight.evidenceQuality.level).toBe('HIGH');
    expect(insight.composite.value).toBe(82);
  });
});

describe('setup stage + extension', () => {
  it('flags BUILDING when compressed + participation + contained price', () => {
    const insight = buildScannerInsight({ ...FULL, close: 102, bbwp: 15, changePct: 0.8 });
    expect(insight.setupStage).toBe('BUILDING');
    expect(insight.extensionState).toBe('EARLY');
  });

  it('flags EXTENDED / EXTREME when far from EMA with high range', () => {
    const insight = buildScannerInsight({ ...FULL, close: 140, ema200: 100, atrPercent: 9, changePct: 12, bbwp: 96 });
    expect(insight.extensionState).toBe('EXTREME');
    expect(insight.setupStage).toBe('EXTENDED');
  });

  it('flags CONFIRMING on strong agreement + expanding but not extended', () => {
    const insight = buildScannerInsight({ ...FULL, bbwp: 80, changePct: 5 });
    expect(['CONFIRMING', 'EXPANDING']).toContain(insight.setupStage);
  });
});

describe('cautions', () => {
  it('warns on crowded funding and extension', () => {
    const insight = buildScannerInsight({ ...FULL, fundingRate: 0.09, close: 118, ema200: 100 });
    expect(insight.cautions.join(' ').toLowerCase()).toContain('crowded funding');
  });
});
