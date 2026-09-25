import { describe, it, expect } from 'vitest';
import { computeCompositeV2, type FactorInput } from '@/lib/analysis/scannerScoreV2';
import { buildScannerScore, COVERAGE_MIN, SCORE_TRUST_CAP } from '@/lib/scanner/scoreContract';
import { evaluateDataTrust } from '@/lib/scanner/dataTrust';
import { cryptoPositioningExpected, CRYPTO_FUNDING_FEED_LIVE } from '@/lib/scanner/derivativeSnapshot';
import { deriveFactorSignals } from '@/lib/analysis/scannerFactorSignals';
import { evaluateDailyPickTrust, summarizeDailyPickTrust } from '@/lib/scanner/dailyPickTrust';

const ALL = ['TREND', 'MOMENTUM', 'VOLUME', 'RELATIVE_STRENGTH', 'VOLATILITY'] as const;
const mk = (missing: string[] = [], signed = 0.8): FactorInput[] =>
  ALL.map(f => ({ factor: f, signed, available: !missing.includes(f) }));
const good = { regime: 'neutral' as const, freshness: 'live' as const, trustLevel: 'GOOD' as const, trustQualityIssues: [] as string[] };

describe('missing data is neutral + flagged, counted once (msp.scanner.v2.3)', () => {
  it('a missing factor dilutes the composite by its weight exactly once', () => {
    const full = computeCompositeV2({ factors: mk(), regime: 'neutral', evidenceQuality: 'HIGH' });
    const partial = computeCompositeV2({ factors: mk(['VOLUME', 'RELATIVE_STRENGTH']), regime: 'neutral', evidenceQuality: 'LOW' });
    // |d| is unchanged (all observed votes agree); only coverage scales it. v2.2: max(0, 0.8·cov − (1−cov)) × 0.65.
    expect(partial.composite).toBe(Math.round(full.rawMagnitude * partial.coverage));
    expect(partial.appliedMultiplier).toBe(1);
    const half = computeCompositeV2({ factors: [...mk(), { factor: 'POSITIONING', signed: 0, available: false }, { factor: 'CATALYST', signed: 0, available: false }, { factor: 'QUALITY', signed: 0, available: false }].map(f => ({ ...f, available: ['TREND'].includes(f.factor) })), regime: 'neutral', evidenceQuality: 'INSUFFICIENT' });
    expect(half.composite).toBeGreaterThan(0); // v2.2 returned 0 for any coverage ≤ ~55% at signed 0.8
  });

  it('coverage below COVERAGE_MIN is WATCH / INSUFFICIENT_DATA, never BLOCK', () => {
    expect(COVERAGE_MIN).toBe(0.6);
    const thin = buildScannerScore({ ...good, factors: mk(['TREND', 'MOMENTUM', 'VOLUME']) });
    expect(thin.coverage).toBeLessThan(COVERAGE_MIN);
    expect(thin.permission).toBe('WATCH');
    expect(thin.blockReasons).toEqual([]);
    expect(thin.watchReasons.map(r => r.code)).toEqual(['INSUFFICIENT_DATA']);
    expect(thin.missingFactors).toEqual(['TREND', 'MOMENTUM', 'VOLUME']);
  });

  it('coverage at/above the minimum is PASS with the missing factors flagged, and is not capped a second time', () => {
    const ok = buildScannerScore({ ...good, factors: mk(['RELATIVE_STRENGTH']) });
    expect(ok.coverage).toBeGreaterThanOrEqual(COVERAGE_MIN);
    expect(ok.permission).toBe('PASS');
    expect(ok.missingFactors).toEqual(['RELATIVE_STRENGTH']);
    const degradedMissingOnly = buildScannerScore({ ...good, factors: mk(['RELATIVE_STRENGTH']), trustLevel: 'DEGRADED', missingInputs: ['EMA200'] });
    expect(degradedMissingOnly.permission).toBe('PASS');
    expect(degradedMissingOnly.composite).toBe(ok.composite);
    expect(SCORE_TRUST_CAP.DEGRADED).toBe(100);
  });

  it('non-missing trust problems still WATCH or BLOCK', () => {
    const interval = buildScannerScore({ ...good, factors: mk(), trustLevel: 'DEGRADED', trustQualityIssues: ['provider_degraded'] });
    expect(interval.permission).toBe('WATCH');
    expect(interval.watchReasons.map(r => r.code)).toContain('DATA_TRUST_DEGRADED');
    const stale = buildScannerScore({ ...good, factors: mk(), freshness: 'stale', trustLevel: 'STALE' });
    expect(stale.permission).toBe('BLOCK');
  });

  it('data trust: a missing indicator is flagged, not an eligibility blocker; bad data still is', () => {
    const now = Date.parse('2026-09-23T02:00:00Z');
    const t = evaluateDataTrust({ assetClass: 'equity', timeframe: 'daily', lastBarAt: '2026-09-22', price: 100, indicators: { atr: false, rsi: true, adx: true, ema200: false }, nowMs: now });
    expect(t.eligibilityBlockers).toEqual([]);
    expect(t.missingInputs).toEqual(['ATR', 'EMA200']);
    expect(t.qualityIssues).toEqual([]);
    const noPrice = evaluateDataTrust({ assetClass: 'equity', timeframe: 'daily', lastBarAt: '2026-09-22', price: null, nowMs: now });
    expect(noPrice.eligibilityBlockers).toEqual(['Required input missing: price.']);
    const split = evaluateDataTrust({ assetClass: 'equity', timeframe: 'daily', lastBarAt: '2026-09-22', price: 100, priceDiscontinuity: { date: '2026-06-01', ratio: 0.1 }, nowMs: now });
    expect(split.eligibilityBlockers.length).toBe(1);
  });

  it('crypto POSITIONING is structurally unavailable while no funding feed is live', () => {
    expect(CRYPTO_FUNDING_FEED_LIVE).toBe(false);
    expect(cryptoPositioningExpected('crypto', undefined)).toBe(false);
    expect(cryptoPositioningExpected('crypto', 0.01)).toBe(true);
    expect(cryptoPositioningExpected('equity', 0.01)).toBe(false);
    const s = deriveFactorSignals({ price: 110, ema200: 100, adx: 30, rsi: 60, mfi: 60, relativeVolume: 1.4, rsIndexRatio: 1.1, bbwp: 10, derivativesExpected: cryptoPositioningExpected('crypto', undefined) });
    const score = buildScannerScore({ ...good, factors: s.factors });
    expect(score.missingFactors).not.toContain('POSITIONING');
  });
});

describe('daily picks: real per-ticker trust + data timestamp', () => {
  const now = Date.parse('2026-09-23T02:00:00Z'); // Wed; last closed US session = Tue 22nd
  const full = { price: 100, ema200: 90, rsi: 55, macd: 1, macdSignal: 0.5, adx: 25, stochK: 60, stochD: 55, aroonUp: 80, aroonDown: 20, cci: 50 };
  it('fresh, fully covered row is GOOD with the scan date as its (flagged) timestamp basis', () => {
    const t = evaluateDailyPickTrust({ asset_class: 'equity', price: 100, indicators: full, scan_date: '2026-09-22', created_at: '2026-09-22T22:00:00Z' }, now);
    expect(t.level).toBe('GOOD');
    expect(t.coverage).toBe(1);
    expect(t.timestampBasis).toBe('scan_date');
    expect(t.dataTimestamp).toBe('2026-09-22T00:00:00.000Z');
    expect(t.scannedAt).toBe('2026-09-22T22:00:00.000Z');
  });
  it('a stored bar date wins over the scan date; an old one is STALE', () => {
    const t = evaluateDailyPickTrust({ asset_class: 'equity', price: 100, indicators: { ...full, lastBarAt: '2026-09-15' }, scan_date: '2026-09-22' }, now);
    expect(t.timestampBasis).toBe('bar');
    expect(t.level).toBe('STALE');
  });
  it('thin rows are INSUFFICIENT_DATA and forex EMA50-as-EMA200 proxies are flagged', () => {
    const thin = evaluateDailyPickTrust({ asset_class: 'forex', price: 1.1, indicators: { price: 1.1, rsi: 50, ema50: 1.09, ema200: 1.09 }, scan_date: '2026-09-22' }, now);
    expect(thin.level).toBe('INSUFFICIENT_DATA');
    expect(thin.missing).toEqual(['MACD', 'ADX', 'Stochastic', 'Aroon', 'CCI']);
    expect(thin.reasons).toContain('EMA200 is an EMA50 proxy on this row');
    const summary = summarizeDailyPickTrust([thin, evaluateDailyPickTrust({ asset_class: 'equity', price: 100, indicators: full, scan_date: '2026-09-22' }, now)]);
    expect(summary.coverageScore).toBe(Math.round((2 / 7 + 1) / 2 * 100));
    expect(summary.insufficientCount).toBe(1);
  });
});
