import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.hoisted(() => { process.env.ALPHA_VANTAGE_API_KEY = 'mock-only'; });
vi.mock('@/lib/db', () => ({ q: vi.fn() }));
vi.mock('@/lib/onDemandFetch', () => ({ getIndicators: vi.fn(async () => null), getQuote: vi.fn() }));
vi.mock('@/lib/options/chainCache', async () => ({ defaultChainProviders: () => ['REALTIME_OPTIONS'], fetchSharedOptionsChain: vi.fn(async () => { const { mockChain } = await import('./fixtures/confluenceDemotion'); return mockChain(); }) }));
import { optionsAnalyzer, calculateTradeLevels, selectStrikesFromConfluence } from '@/lib/options-confluence-analyzer';
import { confluenceLearningAgent as agent } from '@/lib/confluence-learning-agent';
import { fetchMPE, fetchTimeConfluence } from '@/lib/goldenEggFetchers';
import * as pressure from '@/lib/marketPressureEngine';
import { computeBreakoutReadiness, detectVolatilityTrap } from '@/lib/directionalVolatilityEngine';
import type { VolatilityState, DVEInput } from '@/lib/directionalVolatilityEngine.types';
import { buildPayload } from '@/lib/goldenEgg/engine';
import { syntheticBars, makeScanFixture, varyCalendar, NOW, decisions, measuredFixture } from './fixtures/confluenceDemotion';
import { price, ind, tc, now } from './fixtures/goldenEggTiming';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)); vi.stubGlobal('fetch', vi.fn(() => { throw Error('Unexpected network request'); })); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each(['2026-10-04T16:00:00Z', '2026-10-05T18:30:00Z'])('30m equity bars exclude unmeasurable rows throughout options and MPE inputs at %s', async instant => {
  vi.setSystemTime(new Date(instant));
  for (const a of [agent, (optionsAnalyzer as any).confluenceAgent]) {
    vi.spyOn(a, 'fetchHistoricalData').mockResolvedValue(syntheticBars());
    vi.spyOn(a, 'fetchLivePrice').mockResolvedValue(100);
  }
  const scan = await agent.scanHierarchical('AAPL', 'intraday_1h', 'regular', 'equity');
  const result = await optionsAnalyzer.analyzeForOptions('AAPL', 'intraday_1h', '2026-10-09');
  const excluded = ['5m','10m','15m','30m'];
  expect(result.unmeasuredTFs).toEqual(expect.arrayContaining(excluded));
  expect(result.decompressingTFs.every(tf => !excluded.includes(tf))).toBe(true);
  expect(result.confluenceStack).toBe(scan.decompression.clusteredCount);
  expect(result.pullBias).toBe(scan.decompression.pullBias);
  const levels = calculateTradeLevels(scan, 'bullish', null)!;
  expect(levels.stopLoss).toBeGreaterThan(0);
  expect(scan.mid50Levels.length).toBeGreaterThan(0);
  expect(scan.mid50Levels.every(l => l.level > 0 && !excluded.includes(l.tf))).toBe(true);
  for (const strike of [result.primaryStrike, ...result.alternativeStrikes, ...(result.researchCandidates?.strikes ?? [])].filter(Boolean)) expect(strike!.strike).toBeGreaterThan(0);
  if (result.tradeLevels) expect(result.tradeLevels.stopLoss).toBeGreaterThan(0);
  expect([...result.qualityReasons, result.directionReason ?? ''].join(' ')).not.toMatch(/\bTF\b|cluster|closing together|confluence/i);
  const data = await fetchTimeConfluence('AAPL'); expect(data).not.toBeNull();
  // Capture the real helper inputs. Its existing missing assetClass/symbol defect is documented, not hidden by a fabricated successful result.
  const capture = vi.spyOn(pressure, 'computeMarketPressure');
  await fetchMPE('AAPL', 'equity', data);
  const input = capture.mock.calls[0][0];
  expect(input.time?.activeTFCount).toBe(data!.scoreBreakdown.activeTFs);
  expect(input.time?.midpointDebtCount).toBe(data!.mid50Levels.filter(l => l.level > 0).length);
  expect(data!.mid50Levels.every(l => !excluded.includes(l.tf))).toBe(true);
  expect(data!.decompression.unmeasuredTFs).toEqual(expect.arrayContaining(excluded));
});

it('calendar extremes do not move options, Golden Egg, MPE or DVE decisions', async () => {
  const scan = await makeScanFixture();
  vi.spyOn((optionsAnalyzer as any).confluenceAgent, 'scanHierarchical').mockResolvedValueOnce(varyCalendar(scan, false)).mockResolvedValueOnce(varyCalendar(scan, true));
  const a = await optionsAnalyzer.analyzeForOptions('AAPL', 'intraday_1h', '2026-10-09');
  const b = await optionsAnalyzer.analyzeForOptions('AAPL', 'intraday_1h', '2026-10-09');
  expect(a.candleCloseConfluence).not.toEqual(b.candleCloseConfluence); expect(decisions(a)).toEqual(decisions(b));
  const low = structuredClone(tc); low.candleCloseConfluence.confluenceScore = 0; low.candleCloseConfluence.closingNowCount = 0;
  const ge = (t: typeof tc) => buildPayload('BTC', 'crypto', price, ind, null, null, '1D', null, t, null, { nowMs: now });
  expect(ge(low).layer1).toEqual(ge(tc).layer1);
  const time = { confluenceScore: 100, activeTFCount: 9, hotZoneActive: true };
  const mpe = (high: boolean) => pressure.computeMarketPressure({ symbol: 'BTC', assetClass: 'crypto', volatility: { adx: 20, regimeState: 'VOL_CONTRACTION' }, time: high ? time : {} });
  expect([mpe(false).composite, mpe(false).direction]).toEqual([mpe(true).composite, mpe(true).direction]);
  const vol: VolatilityState = { bbwp: 8, bbwpSma5: 10, regime: 'compression', regimeConfidence: 80, rateOfChange: 0, rateSmoothed: 0, acceleration: 0, rateDirection: 'flat', inSqueeze: true, squeezeStrength: 1 };
  const input: DVEInput = { price: { currentPrice: 100, closes: [100], changePct: 0 }, indicators: { adx: 15 }, options: { maxPain: 100, dealerGamma: 'Long gamma' } };
  expect(computeBreakoutReadiness(vol, input).score).toBe(computeBreakoutReadiness(vol, { ...input, time }).score);
  expect(detectVolatilityTrap(vol, input.options, undefined, 100).score).toBe(detectVolatilityTrap(vol, input.options, time, 100).score);
});

it('flipping scan direction cannot change the options decision or leak timeframe reasons', async () => {
  const a = await makeScanFixture(), b = structuredClone(a);
  a.decompression.netPullDirection = 'bullish'; a.prediction.direction = 'bullish'; a.scoreBreakdown.directionScore = 90;
  b.decompression.netPullDirection = 'bearish'; b.prediction.direction = 'bearish'; b.scoreBreakdown.directionScore = -90;
  vi.spyOn((optionsAnalyzer as any).confluenceAgent, 'scanHierarchical').mockResolvedValueOnce(a).mockResolvedValueOnce(b);
  const x = await optionsAnalyzer.analyzeForOptions('AAPL', 'intraday_1h', '2026-10-09'), y = await optionsAnalyzer.analyzeForOptions('AAPL', 'intraday_1h', '2026-10-09');
  expect(decisions(x)).toEqual(decisions(y));
  for (const r of [x,y]) expect([...r.qualityReasons,r.directionReason ?? ''].join(' ')).not.toMatch(/\bTF\b|cluster|closing together|confluence/i);
});

it('measured strikes, stop and targets preserve the recorded main baseline', () => {
  const scan = measuredFixture(), levels = calculateTradeLevels(scan, 'bullish', null)!;
  // Recorded on unchanged main before F-1 (100 spot, measured 98/104/110, ATR 4).
  expect(levels.stopLoss).toBeCloseTo(97.4);
  expect([levels.target1?.price, levels.target2?.price]).toEqual([104,110]);
  expect(selectStrikesFromConfluence(scan, true, [95,100,105,110], .25)[0].strike).toBe(100);
});

it('a weak timeframe scan cannot veto a strong chain and measured levels', async () => {
  const { fetchSharedOptionsChain } = await import('@/lib/options/chainCache');
  const { mockChain } = await import('./fixtures/confluenceDemotion');
  const chain = mockChain();
  chain.rows = chain.rows.map(row => ({ ...row, strike: String(Number(row.strike) + 12) }));
  vi.mocked(fetchSharedOptionsChain).mockResolvedValueOnce(chain as any);
  const scan = await makeScanFixture();
  Object.assign(scan, measuredFixture());
  // Keep valid scan metadata while weakening only its former grade inputs.
  const original = await makeScanFixture();
  scan.decompression = { ...original.decompression, clusteredCount: 0, pullBias: 0, netPullDirection: 'neutral' };
  scan.prediction = { ...original.prediction, confidence: 0, direction: 'neutral' };
  scan.signalStrength = 'no_signal'; scan.clusters = [];
  vi.spyOn((optionsAnalyzer as any).confluenceAgent, 'scanHierarchical').mockResolvedValueOnce(scan);
  const result = await optionsAnalyzer.analyzeForOptions('AAPL', 'intraday_1h', '2026-10-09');
  expect(result.directionStatus).toBe('determined'); expect(result.direction).toBe('bullish');
  expect(['A+','A','B']).toContain(result.optionsGrade);
  expect(result.tradeSnapshot?.verdict).not.toBe('WAIT');
  expect(result.primaryStrike?.strike).toBeGreaterThan(0);
});

it('a neutral timeframe scan on the bullish A-grade chain is a clock note, not NO TRADE', async () => {
  const { fetchSharedOptionsChain } = await import('@/lib/options/chainCache');
  const { mockChain } = await import('./fixtures/confluenceDemotion');
  const { optionsPageCommand } = await import('@/lib/options/pageCommand');
  const shift = () => {
    const chain = mockChain();
    chain.rows = chain.rows.map(row => ({ ...row, strike: String(Number(row.strike) + 12) }));
    return chain;
  };
  const base = await makeScanFixture();
  Object.assign(base, measuredFixture());
  const original = await makeScanFixture();
  const neutral = structuredClone(base);
  neutral.decompression = { ...original.decompression, clusteredCount: 0, pullBias: 0, netPullDirection: 'neutral' };
  neutral.prediction = { ...original.prediction, confidence: 0, direction: 'neutral' };
  neutral.signalStrength = 'no_signal';
  neutral.clusters = [];
  const strong = structuredClone(base);
  strong.decompression = { ...original.decompression, clusteredCount: 4, pullBias: 80, netPullDirection: 'bullish' };
  strong.prediction = { ...original.prediction, confidence: 90, direction: 'bullish' };
  strong.signalStrength = 'strong';
  const lowCalendar = varyCalendar(strong, false);
  const highCalendar = varyCalendar(strong, true);
  vi.mocked(fetchSharedOptionsChain)
    .mockResolvedValueOnce(shift() as any)
    .mockResolvedValueOnce(shift() as any)
    .mockResolvedValueOnce(shift() as any);
  vi.spyOn((optionsAnalyzer as any).confluenceAgent, 'scanHierarchical')
    .mockResolvedValueOnce(neutral)
    .mockResolvedValueOnce(lowCalendar)
    .mockResolvedValueOnce(highCalendar);
  const result = await optionsAnalyzer.analyzeForOptions('AAPL', 'intraday_1h', '2026-10-09');
  const low = await optionsAnalyzer.analyzeForOptions('AAPL', 'intraday_1h', '2026-10-09');
  const high = await optionsAnalyzer.analyzeForOptions('AAPL', 'intraday_1h', '2026-10-09');
  expect(result.directionStatus).toBe('determined');
  expect(result.direction).toBe('bullish');
  expect(result.optionsGrade).toBe('A');
  expect(result.primaryStrike?.strike).toBe(102);
  expect(result.tradeSnapshot?.verdict).not.toBe('WAIT');
  expect(result.entryTiming.urgency).not.toBe('no_trade');
  expect(result.entryTiming.reason).toMatch(/Timing note \(clock only\)/);
  expect(result.entryTiming.reason).not.toMatch(/confluence|directional signal/i);
  const page = optionsPageCommand({
    verdict: result.tradeSnapshot?.verdict,
    tradeQualityGate: result.aiMarketState?.tradeQualityGate,
    hasExecutionLevels: !!result.tradeLevels,
    confidence: result.compositeScore?.confidence,
  });
  expect(page.noTrade).toBe(false);
  expect(page.executionState).not.toBe('NO TRADE');
  expect(page.commandStatus).not.toBe('NO TRADE');
  expect(page.executionStep).not.toBe('fail');
  expect(page.action).not.toBe('WAIT');
  expect(low.entryTiming.urgency).toBe(high.entryTiming.urgency);
  expect(low.entryTiming.urgency).not.toBe('no_trade');
  expect(high.entryTiming.urgency).not.toBe('no_trade');
  // W3: the setup scanner was replaced by the chain-evidence view, which reads no urgency or NO TRADE state.
  expect(readFileSync('components/options-terminal/OptionsChainEvidence.tsx', 'utf8')).not.toMatch(/urgency|no_trade|NO TRADE/);
});

it('NO TRADE on the options page comes from the verdict or gate, not a scan urgency', async () => {
  const { optionsPageCommand } = await import('@/lib/options/pageCommand');
  const bullish = optionsPageCommand({ verdict: 'BULLISH_EDGE', tradeQualityGate: 'HIGH', hasExecutionLevels: true, confidence: 80 });
  expect(bullish).toMatchObject({ noTrade: false, executionStep: 'ready', executionState: 'READY', commandStatus: 'ACTIVE', action: 'PREP' });
  const gated = optionsPageCommand({ verdict: 'WAIT', tradeQualityGate: 'WAIT', hasExecutionLevels: true, confidence: 80 });
  expect(gated).toMatchObject({ noTrade: true, executionStep: 'fail', executionState: 'NO TRADE', commandStatus: 'NO TRADE', action: 'WAIT' });
});
