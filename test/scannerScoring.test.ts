import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { evaluateScannerFreshness } from '../lib/scanner/dataQuality';
import { evaluateScannerLiquidity } from '../lib/scanner/liquidity';
import { buildScannerRankExplanation } from '../lib/scanner/rankExplanation';
import { computeScannerDerivativesContribution } from '../lib/scanner/scoring';
import { calculateScannerVwapSeries, scannerVwapModeFor } from '../lib/scanner/vwap';

describe('scanner VWAP handling', () => {
  it('resets equity VWAP when the exchange session/date changes', () => {
    const highs = [10, 12, 100, 102];
    const lows = [10, 12, 100, 102];
    const closes = [10, 12, 100, 102];
    const volumes = [100, 100, 100, 100];
    const timestamps = [
      '2026-04-24 15:55:00',
      '2026-04-24 16:00:00',
      '2026-04-27 09:35:00',
      '2026-04-27 09:40:00',
    ];

    const result = calculateScannerVwapSeries(highs, lows, closes, volumes, timestamps, 'exchange_session');

    expect(result[1]).toBe(11);
    expect(result[2]).toBe(100);
    expect(result[3]).toBe(101);
  });

  it('uses a rolling model for crypto instead of exchange-session reset mode', () => {
    expect(scannerVwapModeFor('crypto')).toBe('rolling_24h');
    expect(scannerVwapModeFor('equity')).toBe('exchange_session');
  });
});

describe('scanner freshness penalties', () => {
  const now = Date.parse('2026-04-27T12:00:00Z');

  it('does not penalize fresh intraday candles', () => {
    const result = evaluateScannerFreshness('2026-04-27T11:45:00Z', '15min', now);

    expect(result.status).toBe('fresh');
    expect(result.penalty).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it('penalizes stale intraday candles so old data cannot outrank fresh setups', () => {
    const result = evaluateScannerFreshness('2026-04-27T08:00:00Z', '15min', now);

    expect(result.status).toBe('stale');
    expect(result.penalty).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('stale_last_candle');
  });

  it('penalizes missing candle timestamps', () => {
    const result = evaluateScannerFreshness(undefined, '15min', now);

    expect(result.status).toBe('missing');
    expect(result.penalty).toBeGreaterThanOrEqual(18);
    expect(result.warnings).toContain('missing_last_candle_time');
  });
});

describe('scanner liquidity penalties', () => {
  it('penalizes missing equity volume evidence before ranking', () => {
    const result = evaluateScannerLiquidity({ type: 'equity' });

    expect(result.status).toBe('missing');
    expect(result.penalty).toBeGreaterThan(0);
    expect(result.warnings).toContain('missing_liquidity_volume');
  });

  it('penalizes thin equity volume more than merely below-preferred volume', () => {
    const thin = evaluateScannerLiquidity({ type: 'equity', averageVolume: 25_000 });
    const belowPreferred = evaluateScannerLiquidity({ type: 'equity', averageVolume: 100_000 });

    expect(thin.status).toBe('thin');
    expect(belowPreferred.status).toBe('thin');
    expect(thin.penalty).toBeGreaterThan(belowPreferred.penalty);
  });

  it('does not fake a volume penalty for spot forex where comparable volume is unavailable', () => {
    const result = evaluateScannerLiquidity({ type: 'forex' });

    expect(result.status).toBe('not_applicable');
    expect(result.penalty).toBe(0);
  });
});

describe('scanner rank explanations', () => {
  it('explains why a lower-ranked symbol trails the leader', () => {
    const explanation = buildScannerRankExplanation({
      rank: 2,
      symbol: 'MSFT',
      score: 72,
      topScore: 88,
      direction: 'bullish',
      scoreQuality: {
        evidenceLayers: 4,
        missingEvidencePenalty: 6,
        staleDataPenalty: 8,
        liquidityPenalty: 0,
        freshnessStatus: 'stale',
        liquidityStatus: 'sufficient',
      },
      rankWarnings: ['stale_last_candle_240m'],
      dveFlags: ['COMPRESSED'],
    });

    expect(explanation.scoreGapToLeader).toBe(16);
    expect(explanation.summary).toContain('16 points behind the current leader');
    expect(explanation.strengths).toContain('DVE flags: COMPRESSED');
    expect(explanation.penalties).toContain('only 4 evidence layers contributed');
    expect(explanation.penalties).toContain('stale data penalty 8');
    expect(explanation.warnings).toContain('stale_last_candle_240m');
  });
});

describe('scanner missing options and derivatives evidence', () => {
  it('does not add derivatives score boost when crypto funding and OI evidence are missing', () => {
    const contribution = computeScannerDerivativesContribution({ expected: true });

    expect(contribution.evidenceStatus).toBe('missing');
    expect(contribution.boost).toBe(0);
    expect(contribution.bullishSignal).toBe(0);
    expect(contribution.bearishSignal).toBe(0);
    expect(contribution.warnings).toContain('missing_derivatives_evidence_no_score_boost');
  });

  it('only boosts scanner score when supplied derivatives evidence is finite', () => {
    const missing = computeScannerDerivativesContribution({ expected: true });
    const supplied = computeScannerDerivativesContribution({
      expected: true,
      fundingRate: 0.07,
      oiChangePercent: 6.2,
    });

    expect(missing.boost).toBe(0);
    expect(supplied.evidenceStatus).toBe('available');
    expect(supplied.boost).toBe(5);
    expect(supplied.bearishSignal).toBe(0.8);
  });

  it('marks options-chain evidence as not applicable to core scanner scoring until explicitly wired', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/scanner/run/route.ts'), 'utf8');
    const apiTypes = readFileSync(join(process.cwd(), 'app/v2/_lib/api.ts'), 'utf8');

    expect(route).toContain('computeScannerDerivativesContribution');
    expect(route).toContain('derivativesEvidenceStatus');
    expect(route).toContain('derivativesBoost');
    expect(route).not.toContain('optionsChainQuality?.status ===');
    expect(apiTypes).toContain("derivativesEvidenceStatus?: 'available' | 'missing' | 'not_applicable'");
  });
});

describe('scanner UI metadata wiring', () => {
  const root = process.cwd();

  it('surfaces provider truth and rank explanation fields in the scanner UI', () => {
    const page = readFileSync(join(root, 'app/tools/scanner/page.tsx'), 'utf8');
    const apiTypes = readFileSync(join(root, 'app/v2/_lib/api.ts'), 'utf8');
    const marketStatusStrip = readFileSync(join(root, 'components/market/MarketStatusStrip.tsx'), 'utf8');

    expect(apiTypes).toContain('rankExplanation?:');
    expect(apiTypes).toContain('scoreQuality?:');
    expect(apiTypes).toContain('providerStatus?:');
    expect(marketStatusStrip).toContain('Data Truth');
    expect(page).toContain('MarketStatusStrip');
    expect(page).toContain('DataFreshnessBadge');
    expect(page).toContain('detail.rankExplanation');
    expect(page).toContain('r.rankExplanation?.summary');
    expect(page).toContain('scoreQualityWarnings');
  });
});
