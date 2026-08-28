/**
 * Unit tests for the Stage 2 Command Center interpretation helpers.
 *
 * Pins the educational, probability-honest behaviour: regime → stance mapping,
 * strength ranking, risk tone, crypto participation, event clock, and percent
 * parsing. No output should imply advice or probability.
 *
 * Run: npx vitest run test/analysis/commandCenter.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  parsePct,
  regimeToStance,
  describeRegime,
  rankSectorStrength,
  topMovers,
  deriveRiskTone,
  interpretCryptoParticipation,
  summarizeEventClock,
  findProhibitedLanguage,
} from '../../lib/analysis';

describe('parsePct', () => {
  it('parses signed percentage strings and numbers', () => {
    expect(parsePct('+1.2%')).toBeCloseTo(1.2);
    expect(parsePct('-0.5')).toBeCloseTo(-0.5);
    expect(parsePct(3.4)).toBeCloseTo(3.4);
    expect(parsePct('N/A')).toBe(0);
    expect(parsePct(undefined)).toBe(0);
  });
});

describe('regimeToStance', () => {
  it('maps regimes to educational stances', () => {
    expect(regimeToStance('TREND_UP')).toBe('bullish');
    expect(regimeToStance('RISK_OFF_STRESS')).toBe('bearish');
    expect(regimeToStance('RANGE_NEUTRAL')).toBe('neutral');
    expect(regimeToStance('VOL_EXPANSION')).toBe('mixed');
    expect(regimeToStance('SOMETHING_ELSE')).toBe('unknown');
  });
});

describe('describeRegime', () => {
  it('describes a regime and detects change, without advice language', () => {
    const d = describeRegime({ regime: 'TREND_UP', riskLevel: 'moderate', signals: [{ stale: false }] }, 'RANGE_NEUTRAL');
    expect(d.stance).toBe('bullish');
    expect(d.changed).toBe(true);
    expect(d.previousLabel).toBeTruthy();
    expect(d.stale).toBe(false);
    expect(findProhibitedLanguage(d.summary)).toEqual([]);
  });

  it('is honest about missing regime data', () => {
    const d = describeRegime(null);
    expect(d.stance).toBe('unknown');
    expect(d.summary.toLowerCase()).toContain('insufficient evidence');
  });

  it('flags stale contributing signals', () => {
    const d = describeRegime({ regime: 'TREND_UP', signals: [{ stale: true }] });
    expect(d.stale).toBe(true);
    expect(d.summary.toLowerCase()).toContain('stale');
  });
});

describe('rankSectorStrength', () => {
  it('ranks strongest and weakest and computes green ratio', () => {
    const r = rankSectorStrength([
      { name: 'Tech', changePercent: 2.1 },
      { name: 'Energy', changePercent: -1.4 },
      { name: 'Health', changePercent: 0.3 },
      { name: 'Financials', changePercent: -0.2 },
    ], 2);
    expect(r.strongest[0].name).toBe('Tech');
    expect(r.weakest[0].name).toBe('Energy');
    expect(r.greenRatio).toBeCloseTo(0.5);
    expect(r.total).toBe(4);
  });
});

describe('topMovers', () => {
  it('ranks by absolute percent change and filters by asset class', () => {
    const movers = [
      { ticker: 'AAA', change_percentage: '+1.0%', asset_class: 'equity' as const },
      { ticker: 'BBB', change_percentage: '-8.0%', asset_class: 'equity' as const },
      { ticker: 'ETH', change_percentage: '+5.0%', asset_class: 'crypto' as const },
    ];
    const eq = topMovers(movers, 'equity', 5);
    expect(eq[0].ticker).toBe('BBB'); // largest absolute move
    expect(eq).toHaveLength(2);
    expect(topMovers(movers, 'crypto', 5)[0].ticker).toBe('ETH');
  });
});

describe('deriveRiskTone', () => {
  it('classifies risk-on / risk-off / mixed', () => {
    expect(deriveRiskTone(0.8, 2).tone).toBe('risk_on');
    expect(deriveRiskTone(0.2, -2).tone).toBe('risk_off');
    expect(deriveRiskTone(0.5, 0).tone).toBe('mixed');
  });
});

describe('interpretCryptoParticipation', () => {
  it('describes participation without predicting outcomes', () => {
    const up = interpretCryptoParticipation({ marketCapChange24h: 3.2, btcDominance: 58 });
    expect(up.stance).toBe('bullish');
    expect(up.note).toContain('dominance');
    expect(findProhibitedLanguage(up.note)).toEqual([]);
    expect(interpretCryptoParticipation(null).stance).toBe('unknown');
  });
});

describe('summarizeEventClock', () => {
  it('normalizes impact and limits results', () => {
    const items = summarizeEventClock([
      { event: 'CPI', impact: 'High', date: '2026-08-29', time: '08:30', country: 'US' },
      { event: 'Fed Speak', impact: 'medium', date: '2026-08-29' },
      { event: 'Minor', impact: 'low' },
    ], 2);
    expect(items).toHaveLength(2);
    expect(items[0].importance).toBe('high');
    expect(items[0].market).toBe('US');
  });
});
