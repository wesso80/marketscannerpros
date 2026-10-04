import { expect, it } from 'vitest';
import { buildPayload } from '../lib/goldenEgg/engine';
import type { TimeConfluenceData, Indicators, PriceData } from '../lib/goldenEggFetchers';
const now = Date.parse('2026-10-05T15:43:00Z');
const price: PriceData = { price: 100, change: 2, changePct: 2, high: 101, low: 98, volume: 2e8, avgVolume: 1e8, historicalCloses: Array.from({ length: 300 }, (_, i) => 90 + i / 30), lastCompletedBarAt: '2026-10-05T00:00:00Z', barInterval: 'daily' };
const ind: Indicators = { rsi: 60, macd: 1, macdHist: .5, macdSignal: .5, sma20: 99, sma50: 98, ema20: 99, ema50: 98, ema200: 90, adx: 30, atr: 2, bbUpper: 105, bbMiddle: 99, bbLower: 95, stochK: 60, stochD: 55 };
const tc: TimeConfluenceData = { confidence: 90, direction: 'bearish', signalStrength: 'strong', banners: [], scoreBreakdown: { directionScore: -80, clusterScore: 100, decompressionScore: 90, activeTFs: 5, hasHigherTF: true }, decompression: { activeCount: 5, clusteredCount: 5, clusteringRatio: 1, netPullDirection: 'bearish', reasoning: '', pulls: [] }, candleCloseConfluence: { confluenceScore: 100, confluenceRating: 'extreme', closingNowCount: 5, closingNowTFs: ['1D'], closingSoonCount: 5, peakConfluenceIn: 0, bestEntryWindow: { startMins: 0, endMins: 5, reason: '' }, isMonthEnd: true, isWeekEnd: true }, mid50Levels: [], prediction: { direction: 'bearish', confidence: 90, reasoning: '', targetLevel: 98, expectedMoveTime: '1D' }, closeSchedule: [], decompressionTarget: null };
it('strong opposing timing is a nice-to-know warning, never a verdict gate', () => {
  const build = (timing: TimeConfluenceData | null) => buildPayload('BTC', 'crypto', price, ind, null, null, '1D', null, timing, null, { nowMs: now });
  const base = build(null), conflict = build(tc);
  expect(base.layer1.assessment).toBe('ALIGNED');
  expect(conflict.layer1.assessment).toBe(base.layer1.assessment);
  expect(conflict.layer1.primaryBlocker).toBe(base.layer1.primaryBlocker);
  expect(conflict.canonical?.timing.eligibleForHardGate).toBe(false);
  expect(conflict.canonical?.timing.warning).toMatch(/no tested edge/);
  expect(conflict.layer1.flipConditions.find(f => f.id === 'f6')?.severity).toBe('nice');
});
