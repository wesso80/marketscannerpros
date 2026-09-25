import { describe, expect, it } from 'vitest';
import {
  canonicalForDailyPick, canonicalLabel, canonicalPickFields, compactCanonical, rankDailyPicks, readStoredCanonical,
  type CanonicalBar, type CanonicalResult,
} from '@/lib/scoring/canonical';
import { applyCanonicalToGoldenEgg, evaluateGoldenEggCanonical, goldenEggCanonicalBars } from '@/lib/goldenEgg/canonicalVerdict';
import { scanCryptoDailyIndicators } from '@/lib/scanner/dailyCryptoIndicators';
import type { GoldenEggPayload } from '@/src/features/goldenEgg/types';
import { zigzagTrend } from './fixtures/canonicalBars';

const DAY = 86_400_000;
const START = Date.UTC(2025, 0, 1);

function bars(n: number, drift = 0.0015, volume: number | null = 1e6): CanonicalBar[] {
  return Array.from({ length: n }, (_, i) => {
    const c = 100 * (1 + drift * i + 0.03 * Math.sin(i / 9));
    return { t: new Date(START + i * DAY).toISOString(), open: c * 0.998, high: c * 1.01, low: c * 0.99, close: c, volume: volume == null ? null : volume + (i % 7) * 1e5 };
  });
}
const nowAfter = (b: CanonicalBar[], days = 1) => Date.parse(b[b.length - 1].t) + days * DAY;

function result(overrides: Partial<CanonicalResult> = {}): CanonicalResult {
  const b = bars(420);
  const base = canonicalForDailyPick(b, { symbol: 'TEST', assetClass: 'equity', nowMs: nowAfter(b) })!;
  return { ...base, ...overrides };
}

describe('daily picks: canonical verdict stored and read back', () => {
  it('evaluates daily bars into a canonical result (null below 30 usable bars)', () => {
    const b = bars(400);
    const c = canonicalForDailyPick(b, { symbol: 'TEST', assetClass: 'equity', nowMs: nowAfter(b) })!;
    expect(c.version).toBe('msp.canonical.v1');
    expect(c.symbol).toBe('TEST');
    expect(c.mode).toBe('bars');
    expect(['PASS', 'WATCH', 'BLOCK']).toContain(c.permission);
    expect(c.blockReasons.map((r) => r.code)).not.toContain('STALE_DATA');
    expect(canonicalForDailyPick(bars(20), { symbol: 'TEST', assetClass: 'equity' })).toBeNull();
  });

  it('blocks STALE_DATA when the last daily bar is older than 5 days', () => {
    const b = bars(400);
    const c = canonicalForDailyPick(b, { symbol: 'TEST', assetClass: 'equity', nowMs: nowAfter(b, 9) })!;
    expect(c.permission).toBe('BLOCK');
    expect(c.blockReasons.map((r) => r.code)).toContain('STALE_DATA');
  });

  it('treats missing / zero volume as unavailable (forex) rather than zero', () => {
    const b = bars(400, 0.0015, null);
    const c = canonicalForDailyPick(b, { symbol: 'EUR/USD', assetClass: 'forex', nowMs: nowAfter(b) })!;
    expect(c.raw.volumeRatio ?? null).toBeNull();
  });

  it('applies the regime overlay when inputs are given', () => {
    const b = bars(400);
    const overlay = { vix: { level: 40, change5dPct: 30 }, hyOas: { level: 6, change20dPp: 1 }, spy: { close: 90, sma50: 100, sma200: 105 }, qqq: { close: 90, sma50: 100, sma200: 105 }, macroRiskState: 'risk_off' as const };
    const withOverlay = canonicalForDailyPick(b, { symbol: 'TEST', assetClass: 'equity', overlay, nowMs: nowAfter(b) })!;
    const without = canonicalForDailyPick(b, { symbol: 'TEST', assetClass: 'equity', nowMs: nowAfter(b) })!;
    if (withOverlay.direction === 'long') {
      expect(withOverlay.sizeMultiplier).toBeLessThan(1);
      expect(withOverlay.permission).not.toBe('PASS');
    }
    expect(without.sizeMultiplier).toBe(1);
  });

  it('round-trips through JSONB (object or string) and rejects malformed blobs', () => {
    const c = compactCanonical(result());
    expect(c.candidates.length).toBeLessThanOrEqual(4);
    const stored = JSON.parse(JSON.stringify({ rsi: 55, canonical: c }));
    expect(readStoredCanonical(stored)!.permission).toBe(c.permission);
    expect(readStoredCanonical(JSON.stringify(stored))!.score).toBe(c.score);
    expect(readStoredCanonical({ rsi: 55 })).toBeNull();
    expect(readStoredCanonical({ canonical: { permission: 'MAYBE', score: 1 } })).toBeNull();
    expect(readStoredCanonical('not json')).toBeNull();
  });

  it('orders picks canonical-first; picks from older scans fall back to the legacy score after them', () => {
    const rows = [
      { symbol: 'OLD_HIGH', score: 99, canonical: null },
      { symbol: 'WATCH_B', score: 10, canonical: result({ permission: 'WATCH', grade: 'B', score: 70 }) },
      { symbol: 'PASS_C', score: 5, canonical: result({ permission: 'PASS', grade: 'C', score: 78 }) },
      { symbol: 'OLD_LOW', score: 50, canonical: null },
      { symbol: 'PASS_A', score: 1, canonical: result({ permission: 'PASS', grade: 'A', score: 90 }) },
    ];
    expect(rankDailyPicks(rows).map((r) => r.symbol)).toEqual(['PASS_A', 'PASS_C', 'WATCH_B', 'OLD_HIGH', 'OLD_LOW']);
  });

  it('exposes primary label fields', () => {
    const c = result({ permission: 'WATCH', grade: 'B', setupType: 'PULLBACK', direction: 'long', score: 73 });
    expect(canonicalPickFields(c)).toMatchObject({ permission: 'WATCH', grade: 'B', setupType: 'PULLBACK', canonicalDirection: 'long', canonicalScore: 73 });
    expect(canonicalPickFields(null)).toMatchObject({ canonical: null, permission: null, grade: null });
    expect(canonicalLabel({ ...c, scoreBasis: undefined })).toBe('WATCH · B · Pullback'); // pre-Phase-3 stored verdict
    expect(canonicalLabel({ ...c, scoreBasis: 'calibrated_expectancy_percentile' })).toBe('WATCH · B · Pullback · factors only');
    expect(canonicalLabel({ ...c, scoreBasis: 'factor_alignment_uncalibrated' })).toBe('WATCH · B · Pullback · uncalibrated');
    expect(canonicalLabel(null)).toBeNull();
  });

  it('scan-daily crypto outcome carries the bars it used (for the canonical engine)', async () => {
    const b = bars(260).map((x) => ({ ...x }));
    const out = await scanCryptoDailyIndicators('ETH', null, async () => ({
      coinId: 'ethereum', timeframe: 'daily', barInterval: '1d', bars: b, currentPrice: b[b.length - 1].close, partialBar: null,
      lastCompletedBarAt: b[b.length - 1].t, source: 'test', volumeBasis: 'test',
    }) as any);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.bars).toHaveLength(260);
  });
});

describe('Golden Egg: canonical verdict is primary, confluence is secondary', () => {
  // An established zig-zag uptrend (structural trend-continuation long), so the verdict has a setup to label.
  const series = zigzagTrend({ n: 300, startMs: START });
  const priceData = {
    historicalCloses: series.map((b) => b.close), historicalOpens: series.map((b) => b.open),
    historicalHighs: series.map((b) => b.high), historicalLows: series.map((b) => b.low),
    historicalDates: series.map((b) => b.t.slice(0, 10)), historicalVolumes: series.map((b) => b.volume),
  };

  it('builds canonical bars from the Golden Egg history (session dates → ISO; mismatched arrays → none)', () => {
    const gb = goldenEggCanonicalBars(priceData);
    expect(gb).toHaveLength(300);
    expect(gb[0].t).toBe(`${series[0].t.slice(0, 10)}T00:00:00.000Z`);
    expect(gb[0].volume).toBe(series[0].volume);
    expect(goldenEggCanonicalBars({ ...priceData, historicalHighs: priceData.historicalHighs.slice(1) })).toEqual([]);
    const intraday = goldenEggCanonicalBars({ ...priceData, historicalDates: series.map(() => '2026-09-24 15:30:00'), historicalVolumes: undefined });
    expect(intraday[0].t).toBe('2026-09-24T15:30:00');
    expect(intraday[0].volume).toBeNull();
  });

  it('hard-blocks earnings inside the holding window and STALE data; flags non-daily thresholds', () => {
    const gb = goldenEggCanonicalBars(priceData);
    const e = evaluateGoldenEggCanonical(gb, { symbol: 'TEST', assetClass: 'equity', timeframe: 'daily', earningsInWindow: { date: '2026-10-01', days: 3, windowDays: 10 } })!;
    expect(e.permission).toBe('BLOCK');
    expect(e.grade).toBe('F');
    expect(e.blockReasons.map((r) => r.code)).toContain('EARNINGS_IN_WINDOW');
    const s = evaluateGoldenEggCanonical(gb, { symbol: 'TEST', assetClass: 'equity', timeframe: 'daily', trustLevel: 'STALE' })!;
    expect(s.blockReasons.map((r) => r.code)).toContain('STALE_DATA');
    const d = evaluateGoldenEggCanonical(gb, { symbol: 'TEST', assetClass: 'equity', timeframe: 'daily', trustLevel: 'DEGRADED' })!;
    if (d.permission !== 'BLOCK') expect(d.permission).toBe('WATCH');
    expect(d.watchReasons.map((r) => r.code)).toContain('DATA_TRUST_DEGRADED');
    const h = evaluateGoldenEggCanonical(gb, { symbol: 'TEST', assetClass: 'equity', timeframe: '1h' })!;
    expect(h.flags.map((f) => f.code)).toContain('UNCALIBRATED_TIMEFRAME');
    expect(h.scoreBasis).toBe('factor_alignment_uncalibrated');
    expect(h.watchReasons.map((r) => r.code)).toContain('UNCALIBRATED');
    expect(evaluateGoldenEggCanonical(gb.slice(0, 10), { symbol: 'TEST', assetClass: 'equity', timeframe: 'daily' })).toBeNull();
  });

  function payload(): GoldenEggPayload {
    return {
      meta: { symbol: 'TEST', assetClass: 'equity', price: 100, asOfTs: '2026-09-25T00:00:00Z', timeframe: 'Daily' },
      layer1: {
        assessment: 'NOT_ALIGNED', direction: 'SHORT', confluenceScore: 41, confidence: 41, grade: 'D', primaryDriver: 'legacy driver',
        primaryBlocker: 'legacy blocker', flipConditions: [{ id: 'f1', text: 'legacy flip', severity: 'must' }], scoreBreakdown: [],
        cta: { primary: 'OPEN_SCANNER' },
      },
      layer3: { narrative: { enabled: true, summary: 'legacy summary', bullets: [], risks: [] } },
      canonical: {
        levels: { reference: { price: 99, basis: 'structural', label: 'legacy ref' }, invalidation: { price: 104, basis: 'structural', label: 'legacy inv', distanceAtr: 1 }, zones: [], illustrativeR: 1.2 },
        verdict: { assessment: 'NOT_ALIGNED', direction: 'SHORT', confluence: 41, grade: 'D', primaryDriver: 'legacy driver', primaryBlocker: 'legacy blocker', setupType: 'trend', setupNote: 'legacy note' },
        confirmation: ['legacy short confirmation'], invalidation: ['legacy short invalidation'],
      },
    } as unknown as GoldenEggPayload;
  }

  it('PASS long: headline fields follow canonical; legacy confluence preserved as secondary; levels replaced on direction change', () => {
    const c = result({
      permission: 'PASS', grade: 'A', direction: 'long', setupType: 'PULLBACK', score: 84, blockReasons: [], watchReasons: [],
      levels: { entry: 100, invalidation: 96, target: 108, riskReward: 2, invalidationBasis: 'swing', targetBasis: 'opposing_level', flags: [] },
    });
    const out = applyCanonicalToGoldenEgg(payload(), c);
    expect(out.layer1).toMatchObject({ assessment: 'ALIGNED', direction: 'LONG', grade: 'A', confluenceScore: 41, flipConditions: [] });
    expect(out.layer1.primaryBlocker).toBeUndefined();
    expect(out.canonicalVerdict).toBe(c);
    expect(out.legacyConfluence).toMatchObject({ assessment: 'NOT_ALIGNED', direction: 'SHORT', grade: 'D', confluenceScore: 41, primaryBlocker: 'legacy blocker' });
    expect(out.canonical!.verdict).toMatchObject({ assessment: 'ALIGNED', direction: 'LONG', grade: 'A', setupType: 'PULLBACK', confluence: 41 });
    expect(out.canonical!.levels.invalidation.price).toBe(96);
    expect(out.canonical!.levels.zones[0]).toMatchObject({ price: 108, rMultiple: 2 });
    expect(out.canonical!.confirmation[0]).toMatch(/long setup holds while price stays above 96/);
    expect(out.legacyConfluence!.levels!.invalidation.price).toBe(104);
    expect(out.layer3.narrative.summary).toMatch(/canonical verdict PASS · grade A/);
    expect(out.layer3.narrative.summary).toMatch(/Legacy confluence 41\/100/);
  });

  it('BLOCK: reasons become the primary blocker / flip conditions; grade F; lifecycle maps to NOT_ALIGNED', () => {
    const c = result({ permission: 'BLOCK', grade: 'F', direction: 'neutral', setupType: 'NONE', score: 0, levels: null, blockReasons: [{ code: 'NO_SETUP', message: 'No eligible setup' }], watchReasons: [] });
    const out = applyCanonicalToGoldenEgg(payload(), c);
    expect(out.layer1).toMatchObject({ assessment: 'NOT_ALIGNED', direction: 'NEUTRAL', grade: 'F', primaryBlocker: 'NO_SETUP: No eligible setup' });
    expect(out.layer1.flipConditions.map((f) => f.text)).toEqual(['NO_SETUP: No eligible setup']);
    expect(out.canonical!.verdict.setupType).toBe('trend'); // NONE keeps the legacy setup label
    expect(out.canonical!.confirmation[0]).toMatch(/No canonical setup is eligible/);
    expect(out.canonical!.levels.reference.label).toMatch(/^Legacy confluence: /);
  });

  it('WATCH with same direction keeps the packet levels', () => {
    const c = result({ permission: 'WATCH', grade: 'B', direction: 'short', setupType: 'TREND_CONTINUATION', score: 74, blockReasons: [], watchReasons: [{ code: 'SCORE_BELOW_PASS', message: 'below pass' }],
      levels: { entry: 100, invalidation: 103, target: 94, riskReward: 2, invalidationBasis: 'swing', targetBasis: 'projected', flags: [] } });
    const out = applyCanonicalToGoldenEgg(payload(), c);
    expect(out.layer1.assessment).toBe('WATCH');
    expect(out.layer1.cta.primary).toBe('SET_ALERT');
    expect(out.canonical!.levels.invalidation.price).toBe(104);
    expect(out.canonical!.confirmation).toEqual(['legacy short confirmation']);
  });
});
