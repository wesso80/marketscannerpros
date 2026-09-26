import { describe, expect, it } from 'vitest';
import {
  canonicalForDailyPick, canonicalLabel, canonicalPickFields, compactCanonical, rankDailyPicks, readStoredCanonical,
  type CanonicalBar, type CanonicalResult,
} from '@/lib/scoring/canonical';
import { applyCanonicalToGoldenEgg, canonicalNarrativeSummary, canonicalSetupLevels, evaluateGoldenEggCanonical, goldenEggCanonicalBars } from '@/lib/goldenEgg/canonicalVerdict';
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
      layer2: {
        setup: { setupType: 'trend', thesis: 'legacy thesis', timeframeAlignment: { score: 2, max: 4, details: [] }, keyLevels: [], invalidation: 'Scenario weakens if price closes below 96 with volume confirmation.' },
        scenario: {
          referenceTrigger: 'Close above BB Upper 107', referenceLevel: { type: 'confirmation', price: 107 },
          invalidationLevel: { price: 96, logic: 'legacy long stop' }, reactionZones: [{ price: 110, rMultiple: 1.5, note: 'legacy long zone' }, { price: 114, rMultiple: 2.5 }],
          hypotheticalRr: { expectedR: 1.5, minR: 1.5 }, hypotheticalRisk: { riskPct: 0.5 },
        },
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
    expect(out.layer3.narrative.summary).toBe('TEST: a long pullback setup qualifies (grade A). The older confluence model scores it 41/100 with a bearish lean (secondary context only).');
  });

  it('BLOCK: reasons become the primary blocker / flip conditions; grade F; lifecycle maps to NOT_ALIGNED', () => {
    const c = result({ permission: 'BLOCK', grade: 'F', direction: 'neutral', setupType: 'NONE', score: 0, levels: null, blockReasons: [{ code: 'NO_SETUP', message: 'No eligible setup' }], watchReasons: [] });
    const out = applyCanonicalToGoldenEgg(payload(), c);
    expect(out.layer1).toMatchObject({ assessment: 'NOT_ALIGNED', direction: 'NEUTRAL', grade: 'F', primaryBlocker: 'NO_SETUP: No eligible setup' });
    expect(out.layer1.flipConditions.map((f) => f.text)).toEqual(['NO_SETUP: No eligible setup']);
    expect(out.canonical!.verdict.setupType).toBe('trend'); // NONE keeps the legacy setup label
    expect(out.canonical!.confirmation[0]).toMatch(/No canonical setup is eligible/);
    expect(out.canonical!.levels.reference.label).toMatch(/^Legacy confluence: /);
    // RS-3: a plain sentence, no raw engine labels.
    expect(out.layer3.narrative.summary).toBe('TEST: there is no qualifying setup right now. The older confluence model scores it 41/100 with a bearish lean (secondary context only).');
    expect(out.layer3.narrative.summary).not.toMatch(/canonical verdict|BLOCK|grade F|NO_SETUP|·/);
    // No canonical setup: the scenario is left to the legacy engine.
    expect(out.layer2.scenario.referenceTrigger).toBe('Close above BB Upper 107');
  });

  it('WATCH with same direction still shows the canonical levels, not the legacy ones', () => {
    const c = result({ permission: 'WATCH', grade: 'B', direction: 'short', setupType: 'TREND_CONTINUATION', score: 74, blockReasons: [], watchReasons: [{ code: 'SCORE_BELOW_PASS', message: 'Score below the pass line.' }],
      levels: { entry: 100, invalidation: 103, target: 94, riskReward: 2, invalidationBasis: 'swing', targetBasis: 'projected', flags: [] } });
    const out = applyCanonicalToGoldenEgg(payload(), c);
    expect(out.layer1.assessment).toBe('WATCH');
    expect(out.layer1.cta.primary).toBe('SET_ALERT');
    expect(out.canonical!.levels.invalidation.price).toBe(103);
    expect(out.canonical!.confirmation).toEqual(['Trend continuation short setup holds while price stays below 103']);
    expect(out.layer3.narrative.summary).toMatch(/^TEST: a short trend continuation setup is forming but is on watch \(grade B\) because score below the pass line\./);
  });

  it('RS-13: a canonical short puts the stop above price and targets below it in every level panel', () => {
    // Live example shape: META SHORT exhaustion fade while the legacy engine built a long (stop below price,
    // trigger "close above BB Upper").
    const c = result({ permission: 'PASS', grade: 'A', direction: 'short', setupType: 'EXHAUSTION_FADE', score: 95, blockReasons: [], watchReasons: [],
      levels: { entry: 100, invalidation: 104.5, target: 93.25, riskReward: 1.5, invalidationBasis: 'recent_extreme', targetBasis: 'ema20', riskAtr: 1.1, flags: [] } });
    const p = payload();
    p.layer1.direction = 'NEUTRAL'; // legacy NEUTRAL with bullish tilt → legacy engine built long levels
    const out = applyCanonicalToGoldenEgg(p, c);
    const price = p.meta.price;
    const sc = out.layer2.scenario;
    // Golden Egg Verdict Packet / Validated scenario levels / Scenario Map
    expect(sc.invalidationLevel.price).toBeGreaterThan(price);
    expect(sc.invalidationLevel.price).toBe(104.5);
    expect(sc.referenceLevel.price).toBe(100);
    expect(sc.reactionZones.length).toBeGreaterThan(0);
    for (const z of sc.reactionZones) expect(z.price).toBeLessThan(price);
    expect(sc.reactionZones[0]).toMatchObject({ price: 93.25, rMultiple: 1.5 });
    expect(sc.hypotheticalRr.expectedR).toBe(1.5);
    expect(sc.referenceTrigger).not.toMatch(/BB Upper|close above/i);
    expect(sc.referenceTrigger).toMatch(/Exhaustion fade short/);
    expect(sc.invalidationLevel.logic).toMatch(/^Above the recent exhaustion high/);
    expect(sc.hypotheticalRisk).toEqual({ riskPct: 0.5 });
    // Setup panel invalidation text
    expect(out.layer2.setup.invalidation).toBe('The canonical short setup is invalidated by a close above 104.5.');
    // RS-13 follow-up: the Setup thesis leads with the canonical short, legacy text kept only as secondary context.
    expect(out.layer2.setup.thesis).toBe('TEST: the canonical engine reads a short exhaustion fade setup (score 95/100, qualifies). Older confluence model (secondary context only): legacy thesis');
    // Deep Analysis packet
    const pk = out.canonical!;
    expect(pk.levels.invalidation.price).toBeGreaterThan(price);
    expect(pk.levels.invalidation.distanceAtr).toBe(1.1);
    for (const z of pk.levels.zones) expect(z.price).toBeLessThan(price);
    expect(pk.confirmation[0]).toMatch(/stays below 104.5/);
    expect(pk.invalidation[0]).toMatch(/close above 104.5/);
    // Legacy levels stay available as secondary context
    expect(out.legacyConfluence!.levels!.invalidation.price).toBe(104);
  });

  it('Setup thesis follows the canonical direction, not the legacy one', () => {
    const legacyThesis = 'TEST shows a bullish range-bound setup (no trend strength (ADX 17)). ADX 17 weak trend. Options positioning is bullish (P/C 0.62 on 2026-10-02). Market pressure at 64/100 supports the thesis. Time confluence is bullish with strong signal strength (supportive).';
    const short = result({ permission: 'PASS', grade: 'A', direction: 'short', setupType: 'EXHAUSTION_FADE', score: 88, blockReasons: [], watchReasons: [],
      levels: { entry: 100, invalidation: 104, target: 94, riskReward: 1.5, invalidationBasis: 'recent_extreme', targetBasis: 'ema20', flags: [] } });
    for (const legacyDir of ['LONG', 'NEUTRAL'] as const) {
      const p = payload();
      p.layer1.direction = legacyDir;
      p.layer2.setup.thesis = legacyThesis;
      const t = applyCanonicalToGoldenEgg(p, short).layer2.setup.thesis;
      expect(t).toBe('TEST: the canonical engine reads a short exhaustion fade setup (score 88/100, qualifies). ADX 17 weak trend. Options positioning is bullish (P/C 0.62 on 2026-10-02). Market pressure is 64/100. Time confluence is bullish with strong signal strength, against the canonical short. The older confluence model read a bullish range-bound setup (no trend strength (ADX 17)) (secondary context only).');
      expect(t).not.toMatch(/supports the thesis|TEST shows a bullish/);
    }
    // Same direction: the legacy thesis is left alone.
    const p = payload(); // legacy SHORT
    p.layer2.setup.thesis = 'TEST shows a bearish trend continuation setup (ADX 31 confirms trend strength).';
    expect(applyCanonicalToGoldenEgg(p, short).layer2.setup.thesis).toBe('TEST shows a bearish trend continuation setup (ADX 31 confirms trend strength).');
    // No canonical setup while legacy says bullish: no directional thesis.
    const none = result({ permission: 'BLOCK', grade: 'F', direction: 'neutral', setupType: 'NONE', score: 0, levels: null, blockReasons: [{ code: 'NO_SETUP', message: 'No eligible setup' }], watchReasons: [] });
    const q = payload();
    q.layer1.direction = 'LONG';
    q.layer2.setup.thesis = legacyThesis;
    const tn = applyCanonicalToGoldenEgg(q, none).layer2.setup.thesis;
    expect(tn).toMatch(/^TEST: no canonical setup qualifies right now, so there is no directional thesis\. /);
    expect(tn).toContain('Time confluence is bullish with strong signal strength.');
    expect(tn).toMatch(/The older confluence model read a bullish range-bound setup .* \(secondary context only\)\.$/);
  });

  it('RS-13: a canonical long puts the stop below price and the target above it', () => {
    const c = result({ permission: 'WATCH', grade: 'B', direction: 'long', setupType: 'PULLBACK', score: 70, blockReasons: [], watchReasons: [{ code: 'RR_BELOW_MIN', message: 'Structural reward:risk 1.2 < 1.5' }],
      levels: { entry: 100, invalidation: 97, target: 103.6, riskReward: 1.2, invalidationBasis: 'swing', targetBasis: 'opposing_level', flags: [] } });
    const out = applyCanonicalToGoldenEgg(payload(), c);
    expect(out.layer2.scenario.invalidationLevel.price).toBe(97);
    expect(out.layer2.scenario.reactionZones.map((z) => z.price)).toEqual([103.6]);
    expect(out.layer2.scenario.referenceLevel).toEqual({ type: 'confirmation', price: 100 });
    expect(out.layer2.scenario.invalidationLevel.logic).toMatch(/^Below the last confirmed swing low/);
    expect(out.layer2.setup.invalidation).toMatch(/close below 97\./);
  });

  it('RS-13: canonical levels whose geometry contradicts the direction are not shown as the setup', () => {
    const c = result({ permission: 'PASS', grade: 'A', direction: 'short', setupType: 'EXHAUSTION_FADE', score: 90, blockReasons: [], watchReasons: [],
      levels: { entry: 100, invalidation: 96, target: 108, riskReward: 2, invalidationBasis: 'swing', targetBasis: 'opposing_level', flags: [] } });
    expect(canonicalSetupLevels(c)).toBeNull();
    expect(canonicalSetupLevels({ ...c, direction: 'long' })).not.toBeNull();
    expect(canonicalSetupLevels({ ...c, direction: 'long', setupType: 'NONE' })).toBeNull();
  });

  it('RS-3: a blocked setup and a hard-blocked no-setup bar read as plain sentences', () => {
    const blocked = result({ permission: 'BLOCK', grade: 'F', direction: 'short', setupType: 'SQUEEZE', score: 60, watchReasons: [], levels: null,
      blockReasons: [{ code: 'EARNINGS_IN_WINDOW', message: 'Earnings 2026-10-01 (in 3d) inside the 10-day holding window' }] });
    const s1 = canonicalNarrativeSummary('AAPL', blocked, { confluenceScore: 62, direction: 'LONG' });
    expect(s1).toBe('AAPL: a short squeeze setup was found but is blocked — Earnings 2026-10-01 (in 3d) inside the 10-day holding window. The older confluence model scores it 62/100 with a bullish lean (secondary context only).');
    const hard = result({ permission: 'BLOCK', grade: 'F', direction: 'neutral', setupType: 'NONE', score: 0, watchReasons: [], levels: null,
      blockReasons: [{ code: 'STALE_DATA', message: 'Golden Egg data trust is STALE' }, { code: 'NO_SETUP', message: 'No eligible setup (closest: pullback long, score 48)' }] });
    const s2 = canonicalNarrativeSummary('AAPL', hard, { confluenceScore: 50, direction: 'NEUTRAL' });
    expect(s2).toBe('AAPL: no trade setup is allowed right now — Golden Egg data trust is STALE. The older confluence model scores it 50/100 with no clear lean (secondary context only).');
    const none = result({ permission: 'BLOCK', grade: 'F', direction: 'neutral', setupType: 'NONE', score: 0, watchReasons: [], levels: null,
      blockReasons: [{ code: 'NO_SETUP', message: 'No eligible setup (closest: pullback long, score 48)' }] });
    expect(canonicalNarrativeSummary('AAPL', none, { confluenceScore: 50, direction: 'LONG' })).toBe('AAPL: there is no qualifying setup right now. The closest candidate was pullback long, score 48. The older confluence model scores it 50/100 with a bullish lean (secondary context only).');
    for (const s of [s1, s2]) expect(s).not.toMatch(/canonical verdict|· grade|STALE_DATA|EARNINGS_IN_WINDOW/);
  });
});
