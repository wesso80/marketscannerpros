import { afterEach, describe, expect, it, vi } from 'vitest';
import { researchHref, parseResearchAsset, parseResearchTimeframe } from '@/lib/researchContext';
import { directionalRiskReward, rowHasWeakData } from '@/lib/scanner/researchValidity';
import { boundedJsonFetch } from '@/lib/boundedFetch';
import { upcomingConfirmedEvents, calendarDataWarning } from '@/lib/calendarPresentation';
import { sampledMetric, sampledProfitFactor } from '@/lib/backtest/displayMetric';
import { cryptoReviewMissing } from '@/lib/cryptoReviewData';
import { newsPublishedAt, isRecentNews, newsTopicFlags } from '@/lib/newsEvidence';
import { alertConditionLabel } from '@/lib/alertPresentation';
import { workflowArea, primaryNavTools } from '@/lib/toolWorkflows';
import { mapGlobalM2ToInput } from '@/lib/intelligence/data/liquidityTransmissionInputBuilder';
import { GLOBAL_M2_BLOCS } from '@/lib/intelligence/engines/globalM2';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('research identity and navigation', () => {
  it('preserves destination tabs and explicit SUI crypto 1h identity', () => {
    const url = new URL(researchHref('/tools/workspace?tab=backtest', 'sui', { assetType: 'crypto', timeframe: '1h' }), 'https://example.test');
    expect(Object.fromEntries(url.searchParams)).toEqual({ tab: 'backtest', symbol: 'SUI', type: 'crypto', timeframe: '1h' });
  });
  it('normalizes supported timeframes and rejects unsupported types', () => {
    expect(parseResearchTimeframe('1d')).toBe('daily');
    expect(parseResearchTimeframe('1H')).toBe('1h');
    expect(parseResearchAsset('invalid')).toBeUndefined();
  });
  it('has five top-level areas and distinguishes shared workspace tabs', () => {
    expect(primaryNavTools.map(t => t.label)).toEqual(['Overview', 'Scanner', 'Research', 'Backtest', 'Track']);
    expect(workflowArea('/tools/workspace', 'backtest')).toBe('backtest');
    expect(workflowArea('/tools/workspace', 'journal')).toBe('track');
  });
});

describe('scenario geometry', () => {
  it('rejects the audited bearish stop below entry', () => expect(directionalRiskReward('bearish', 85070.48, 85046, 84715)).toBeNull());
  it.each([['bullish', 100, 95, 110, 2], ['bearish', 100, 105, 90, 2]] as const)('calculates a valid %s scenario', (side, entry, stop, target, expected) => expect(directionalRiskReward(side, entry, stop, target)).toBe(expected));
  it.each([['neutral', 100, 95, 110], ['bullish', 100, 100, 110], ['bearish', 100, 105, 110], ['bullish', NaN, 95, 110]] as const)('rejects invalid geometry %s %s %s %s', (side, entry, stop, target) => expect(directionalRiskReward(side, entry, stop, target)).toBeNull());
});

describe('missing observations', () => {
  it('does not grant a crypto review gate from missing feeds', () => expect(cryptoReviewMissing(null)).toHaveLength(4));
  it('requires complete and fresh feeds, while accepting observed zero changes', () => {
    const data = { market: { marketCapChange24h: 0, totalVolume: 100, totalMarketCap: 1000, dominance: [{}] }, trending: { coins: [{ change24h: 0 }] }, funding: { coins: [{}], average: { fundingRatePercent: 0 } }, oi: { total: { change24h: 0, altDominance: 0 } }, marketMeta: { freshnessStatus: 'fresh' }, trendingMeta: { freshnessStatus: 'fresh' }, fundingMeta: { freshnessStatus: 'fresh' }, oiMeta: { freshnessStatus: 'fresh' } };
    expect(cryptoReviewMissing(data)).toEqual([]);
    data.oiMeta.freshnessStatus = 'stale';
    expect(cryptoReviewMissing(data)).toEqual(['Comparable open-interest change freshness stale']);
  });
  it('counts stale and degraded rows even when the table hides them', () => {
    expect(rowHasWeakData({ dataTrust: { level: 'DEGRADED' } })).toBe(true);
    expect(rowHasWeakData({ scoreQuality: { freshnessStatus: 'stale' } })).toBe(true);
    expect(rowHasWeakData({ dataTrust: { level: 'GOOD' } })).toBe(false);
  });
  it('lists absent M2 blocs without calling present stale observations missing', () => {
    const result = mapGlobalM2ToInput({ blocs: [{ id: 'US', stale: true }], validBlocCount: 1, quality: {} } as any, { status: 'PARTIAL', interpretationEligible: false });
    expect(result.missingBlocs).not.toContain('US');
    expect(result.missingBlocs).toHaveLength(GLOBAL_M2_BLOCS.length - 1);
    expect(mapGlobalM2ToInput(null, { status: 'MISSING', interpretationEligible: false }).missingBlocs).toHaveLength(GLOBAL_M2_BLOCS.length);
  });
  it('does not invent statistics from an empty sample', () => {
    expect(sampledMetric(0, 0, 1, '%')).toBe('Unavailable');
    expect(sampledMetric(0, 10, 1, '%')).toBe('0.0%');
    expect(sampledProfitFactor(0, 0, 0, 0)).toBe('Unavailable');
    expect(sampledProfitFactor(null, 5, 5, 0)).toBe('No losing trades');
  });
});

describe('dated evidence', () => {
  const now = Date.parse('2026-09-21T12:00:00Z');
  it('removes past and unconfirmed events from upcoming clocks', () => {
    const events = [
      { releaseTimeUtc: '2026-09-21T11:00:00Z', timingConfirmed: true },
      { releaseTimeUtc: '2026-09-21T13:00:00Z', timingConfirmed: false },
      { releaseTimeUtc: '2026-09-21T14:00:00Z', timingConfirmed: true },
    ];
    expect(upcomingConfirmedEvents(events, now)).toEqual([events[2]]);
    expect(calendarDataWarning(events)).not.toBeNull();
    expect(calendarDataWarning([])).toBe('Calendar coverage unavailable');
  });
  it('parses compact publication times as UTC and excludes archive/future timestamps', () => {
    expect(newsPublishedAt('20260921T110000')).toBe(Date.parse('2026-09-21T11:00:00Z'));
    expect(isRecentNews('20260921T110000', now)).toBe(true);
    expect(isRecentNews('20260901T110000', now)).toBe(false);
    expect(isRecentNews('20260922T110000', now)).toBe(false);
    expect(isRecentNews('unknown', now)).toBe(false);
  });
  it('does not classify substrings in unrelated headlines as AI or war', () => {
    const flags = newsTopicFlags('Colgate shares gain as VOO rewards investors');
    expect(flags.ai).toBe(false);
    expect(flags.geo).toBe(false);
    expect(newsTopicFlags('Nvidia expands artificial intelligence GPUs').ai).toBe(true);
    expect(newsTopicFlags('Sanctions escalate geopolitical risk').geo).toBe(true);
  });
});

describe('bounded data requests', () => {
  it('times out and aborts a stalled provider without retries', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
    vi.stubGlobal('fetch', fetchMock);
    const request = boundedJsonFetch('/test', {}, 50);
    const assertion = expect(request).rejects.toThrow('Data request timed out');
    await vi.advanceTimersByTimeAsync(51);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('propagates explicit cancellation and clears its timer', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))));
    const controller = new AbortController();
    const request = boundedJsonFetch('/test', { signal: controller.signal });
    const assertion = expect(request).rejects.toThrow('Aborted');
    controller.abort(); await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});


describe('alert threshold display', () => {
  it('accepts numeric database strings without confusing a missing threshold with zero', () => {
    expect(alertConditionLabel('price_above', '105.25')).toBe('price above $105.25');
    expect(alertConditionLabel('price_above', null)).toContain('threshold unavailable');
    expect(alertConditionLabel('price_above', 0)).toContain('threshold unavailable');
    expect(alertConditionLabel('percent_change_up', 5)).toBe('percent change up 5%');
    expect(alertConditionLabel('macd_cross_up', null)).toBe('macd cross up');
  });
});
