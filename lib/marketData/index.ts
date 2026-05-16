/**
 * marketData/index.ts — public API for the admin market-data layer.
 *
 * Read-through pattern for every call:
 *   1. Redis     (hot, sub-second hit on repeat calls)
 *   2. Postgres  (warm, persistent, survives restarts)
 *   3. Alpha Vantage  (cold, rate-governed, last resort)
 *
 * Every returned envelope carries fetchedAt, source, freshness, fromCache,
 * missingFields and staleAfter so callers can render honestly and decide
 * whether to invalidate.
 *
 * If you need a data type not exposed here, add it; do not call AV directly
 * from admin routes.
 */

import {
  avFetchDailyBars,
  avFetchIntradayBars,
  avFetchQuote,
  avFetchOverview,
  avFetchEarnings,
  avFetchOptionsChain,
  avFetchNews,
} from './client';
import {
  pgReadBars, pgUpsertBars,
  pgReadQuote, pgUpsertQuote,
  pgReadOverview, pgUpsertOverview,
  pgReadEarnings, pgUpsertEarnings,
  pgReadOptionsChain, pgUpsertOptionsChain,
  pgReadIndicators, pgUpsertIndicators,
  pgReadNews, pgUpsertNews,
} from './store';
import { rGet, rSet, CK } from './cache';
import { classifyFreshness, computeStaleAfter, ageSecondsFrom, FRESHNESS_RULES } from './freshness';
import { computeIndicators } from './indicators';
import type {
  DataEnvelope,
  OhlcBar,
  BarTimeframe,
  QuoteData,
  OverviewData,
  EarningsRow,
  OptionContract,
  IndicatorSnapshot,
  NewsEvent,
  CacheLayer,
} from './types';

export type {
  DataEnvelope, OhlcBar, BarTimeframe, QuoteData, OverviewData,
  EarningsRow, OptionContract, IndicatorSnapshot, NewsEvent,
} from './types';

interface FetchOptions {
  /** Force refresh, skip all caches. */
  forceFresh?: boolean;
  /** Accept data up to this age (s). If cache entry is older, refresh. */
  maxAgeSec?: number;
}

function wrap<T>(args: {
  data: T | null;
  source: string;
  fetchedAt: string;
  fromCache: CacheLayer;
  dataType: keyof typeof FRESHNESS_RULES;
  missingFields?: string[];
  error?: string;
}): DataEnvelope<T> {
  const age = ageSecondsFrom(args.fetchedAt);
  return {
    data: args.data,
    source: args.source,
    fetchedAt: args.fetchedAt,
    freshness: args.data === null ? 'unknown' : classifyFreshness(age, args.dataType),
    fromCache: args.fromCache,
    missingFields: args.missingFields ?? [],
    staleAfter: computeStaleAfter(args.fetchedAt, args.dataType),
    ageSeconds: age,
    error: args.error,
  };
}

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------

export async function getBars(symbol: string, timeframe: BarTimeframe, opts: FetchOptions = {}): Promise<DataEnvelope<OhlcBar[]>> {
  const dataType = timeframe === 'daily' || timeframe === 'weekly' || timeframe === 'monthly' ? 'dailyBars' : 'intradayBars';
  const source = `alpha-vantage:${timeframe === 'daily' ? 'TIME_SERIES_DAILY_ADJUSTED' : `TIME_SERIES_INTRADAY:${timeframe}`}`;
  const max = opts.maxAgeSec ?? FRESHNESS_RULES[dataType].realTime;

  // 1. Redis
  if (!opts.forceFresh) {
    const hit = await rGet<OhlcBar[]>(CK.bars(symbol, timeframe));
    if (hit && ageSecondsFrom(hit.fetchedAt) <= max) {
      return wrap({ data: hit.data, source, fetchedAt: hit.fetchedAt, fromCache: 'redis', dataType });
    }
  }

  // 2. Postgres
  if (!opts.forceFresh) {
    const pg = await pgReadBars(symbol, timeframe);
    if (pg && ageSecondsFrom(pg.fetchedAt) <= max) {
      await rSet(CK.bars(symbol, timeframe), pg.bars, pg.fetchedAt, FRESHNESS_RULES[dataType].realTime);
      return wrap({ data: pg.bars, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType });
    }
  }

  // 3. AV
  try {
    const fresh = timeframe === 'daily' || timeframe === 'weekly' || timeframe === 'monthly'
      ? await avFetchDailyBars(symbol, false)
      : await avFetchIntradayBars(symbol, timeframe);
    if (!fresh) {
      // Fall back to whatever Postgres has, even if stale
      const pg = await pgReadBars(symbol, timeframe);
      if (pg) return wrap({ data: pg.bars, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType, missingFields: ['live-fetch-failed'] });
      return wrap<OhlcBar[]>({ data: null, source, fetchedAt: new Date().toISOString(), fromCache: 'miss', dataType, error: 'no data' });
    }
    // Persist
    await pgUpsertBars(symbol, timeframe, fresh.bars).catch(() => undefined);
    await rSet(CK.bars(symbol, timeframe), fresh.bars, fresh.fetchedAt, FRESHNESS_RULES[dataType].realTime);
    return wrap({ data: fresh.bars, source, fetchedAt: fresh.fetchedAt, fromCache: 'av', dataType });
  } catch (e) {
    const pg = await pgReadBars(symbol, timeframe);
    if (pg) return wrap({ data: pg.bars, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType, missingFields: ['live-fetch-error'], error: (e as Error).message });
    return wrap<OhlcBar[]>({ data: null, source, fetchedAt: new Date().toISOString(), fromCache: 'miss', dataType, error: (e as Error).message });
  }
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

export async function getQuote(symbol: string, opts: FetchOptions = {}): Promise<DataEnvelope<QuoteData>> {
  const source = 'alpha-vantage:GLOBAL_QUOTE';
  const max = opts.maxAgeSec ?? FRESHNESS_RULES.quote.realTime;

  if (!opts.forceFresh) {
    const hit = await rGet<QuoteData>(CK.quote(symbol));
    if (hit && ageSecondsFrom(hit.fetchedAt) <= max) {
      return wrap({ data: hit.data, source, fetchedAt: hit.fetchedAt, fromCache: 'redis', dataType: 'quote' });
    }
    const pg = await pgReadQuote(symbol);
    if (pg && ageSecondsFrom(pg.fetchedAt) <= max) {
      await rSet(CK.quote(symbol), pg.quote, pg.fetchedAt, FRESHNESS_RULES.quote.realTime);
      return wrap({ data: pg.quote, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType: 'quote' });
    }
  }

  try {
    const fresh = await avFetchQuote(symbol);
    if (!fresh) {
      const pg = await pgReadQuote(symbol);
      if (pg) return wrap({ data: pg.quote, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType: 'quote', missingFields: ['live-fetch-failed'] });
      return wrap<QuoteData>({ data: null, source, fetchedAt: new Date().toISOString(), fromCache: 'miss', dataType: 'quote', error: 'no data' });
    }
    await pgUpsertQuote(fresh.quote, fresh.fetchedAt).catch(() => undefined);
    await rSet(CK.quote(symbol), fresh.quote, fresh.fetchedAt, FRESHNESS_RULES.quote.realTime);
    return wrap({ data: fresh.quote, source, fetchedAt: fresh.fetchedAt, fromCache: 'av', dataType: 'quote' });
  } catch (e) {
    const pg = await pgReadQuote(symbol);
    if (pg) return wrap({ data: pg.quote, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType: 'quote', missingFields: ['live-fetch-error'], error: (e as Error).message });
    return wrap<QuoteData>({ data: null, source, fetchedAt: new Date().toISOString(), fromCache: 'miss', dataType: 'quote', error: (e as Error).message });
  }
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function getOverview(symbol: string, opts: FetchOptions = {}): Promise<DataEnvelope<OverviewData>> {
  const source = 'alpha-vantage:OVERVIEW';
  const max = opts.maxAgeSec ?? FRESHNESS_RULES.overview.realTime;

  if (!opts.forceFresh) {
    const hit = await rGet<OverviewData>(CK.overview(symbol));
    if (hit && ageSecondsFrom(hit.fetchedAt) <= max) {
      return wrap({ data: hit.data, source, fetchedAt: hit.fetchedAt, fromCache: 'redis', dataType: 'overview' });
    }
    const pg = await pgReadOverview(symbol);
    if (pg && ageSecondsFrom(pg.fetchedAt) <= max) {
      await rSet(CK.overview(symbol), pg.overview, pg.fetchedAt, FRESHNESS_RULES.overview.realTime);
      return wrap({ data: pg.overview, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType: 'overview' });
    }
  }

  try {
    const fresh = await avFetchOverview(symbol);
    if (!fresh) {
      const pg = await pgReadOverview(symbol);
      if (pg) return wrap({ data: pg.overview, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType: 'overview', missingFields: ['live-fetch-failed'] });
      return wrap<OverviewData>({ data: null, source, fetchedAt: new Date().toISOString(), fromCache: 'miss', dataType: 'overview', error: 'no data' });
    }
    await pgUpsertOverview(fresh.overview, fresh.fetchedAt).catch(() => undefined);
    await rSet(CK.overview(symbol), fresh.overview, fresh.fetchedAt, FRESHNESS_RULES.overview.realTime);
    return wrap({ data: fresh.overview, source, fetchedAt: fresh.fetchedAt, fromCache: 'av', dataType: 'overview' });
  } catch (e) {
    const pg = await pgReadOverview(symbol);
    if (pg) return wrap({ data: pg.overview, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType: 'overview', missingFields: ['live-fetch-error'], error: (e as Error).message });
    return wrap<OverviewData>({ data: null, source, fetchedAt: new Date().toISOString(), fromCache: 'miss', dataType: 'overview', error: (e as Error).message });
  }
}

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------

export async function getEarnings(symbol: string, opts: FetchOptions = {}): Promise<DataEnvelope<EarningsRow[]>> {
  const source = 'alpha-vantage:EARNINGS';
  const max = opts.maxAgeSec ?? FRESHNESS_RULES.earnings.realTime;

  if (!opts.forceFresh) {
    const hit = await rGet<EarningsRow[]>(CK.earnings(symbol));
    if (hit && ageSecondsFrom(hit.fetchedAt) <= max) {
      return wrap({ data: hit.data, source, fetchedAt: hit.fetchedAt, fromCache: 'redis', dataType: 'earnings' });
    }
    const pg = await pgReadEarnings(symbol);
    if (pg && ageSecondsFrom(pg.fetchedAt) <= max) {
      await rSet(CK.earnings(symbol), pg.rows, pg.fetchedAt, FRESHNESS_RULES.earnings.realTime);
      return wrap({ data: pg.rows, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType: 'earnings' });
    }
  }

  try {
    const fresh = await avFetchEarnings(symbol);
    if (!fresh) {
      const pg = await pgReadEarnings(symbol);
      if (pg) return wrap({ data: pg.rows, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType: 'earnings', missingFields: ['live-fetch-failed'] });
      return wrap<EarningsRow[]>({ data: null, source, fetchedAt: new Date().toISOString(), fromCache: 'miss', dataType: 'earnings', error: 'no data' });
    }
    await pgUpsertEarnings(fresh.rows).catch(() => undefined);
    await rSet(CK.earnings(symbol), fresh.rows, fresh.fetchedAt, FRESHNESS_RULES.earnings.realTime);
    return wrap({ data: fresh.rows, source, fetchedAt: fresh.fetchedAt, fromCache: 'av', dataType: 'earnings' });
  } catch (e) {
    const pg = await pgReadEarnings(symbol);
    if (pg) return wrap({ data: pg.rows, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType: 'earnings', missingFields: ['live-fetch-error'], error: (e as Error).message });
    return wrap<EarningsRow[]>({ data: null, source, fetchedAt: new Date().toISOString(), fromCache: 'miss', dataType: 'earnings', error: (e as Error).message });
  }
}

// ---------------------------------------------------------------------------
// Options chain
// ---------------------------------------------------------------------------

export async function getOptionsChain(symbol: string, opts: FetchOptions = {}): Promise<DataEnvelope<OptionContract[]>> {
  const source = 'alpha-vantage:HISTORICAL_OPTIONS';
  const max = opts.maxAgeSec ?? FRESHNESS_RULES.optionsChain.realTime;

  if (!opts.forceFresh) {
    const hit = await rGet<OptionContract[]>(CK.optionsChain(symbol));
    if (hit && ageSecondsFrom(hit.fetchedAt) <= max) {
      return wrap({ data: hit.data, source, fetchedAt: hit.fetchedAt, fromCache: 'redis', dataType: 'optionsChain' });
    }
    const pg = await pgReadOptionsChain(symbol);
    if (pg && ageSecondsFrom(pg.fetchedAt) <= max) {
      await rSet(CK.optionsChain(symbol), pg.contracts, pg.fetchedAt, FRESHNESS_RULES.optionsChain.realTime);
      return wrap({ data: pg.contracts, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType: 'optionsChain' });
    }
  }

  try {
    const fresh = await avFetchOptionsChain(symbol);
    if (!fresh) {
      const pg = await pgReadOptionsChain(symbol);
      if (pg) return wrap({ data: pg.contracts, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType: 'optionsChain', missingFields: ['live-fetch-failed'] });
      return wrap<OptionContract[]>({ data: null, source, fetchedAt: new Date().toISOString(), fromCache: 'miss', dataType: 'optionsChain', error: 'no data' });
    }
    await pgUpsertOptionsChain(symbol, fresh.contracts, fresh.fetchedAt).catch(() => undefined);
    await rSet(CK.optionsChain(symbol), fresh.contracts, fresh.fetchedAt, FRESHNESS_RULES.optionsChain.realTime);
    return wrap({ data: fresh.contracts, source, fetchedAt: fresh.fetchedAt, fromCache: 'av', dataType: 'optionsChain' });
  } catch (e) {
    const pg = await pgReadOptionsChain(symbol);
    if (pg) return wrap({ data: pg.contracts, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType: 'optionsChain', missingFields: ['live-fetch-error'], error: (e as Error).message });
    return wrap<OptionContract[]>({ data: null, source, fetchedAt: new Date().toISOString(), fromCache: 'miss', dataType: 'optionsChain', error: (e as Error).message });
  }
}

// ---------------------------------------------------------------------------
// Indicators (computed from bars; cached separately)
// ---------------------------------------------------------------------------

export async function getIndicators(symbol: string, timeframe: BarTimeframe, opts: FetchOptions = {}): Promise<DataEnvelope<IndicatorSnapshot>> {
  const source = `computed:indicators:${timeframe}`;
  const max = opts.maxAgeSec ?? FRESHNESS_RULES.indicators.realTime;

  // 1. Cache
  if (!opts.forceFresh) {
    const hit = await rGet<IndicatorSnapshot>(CK.indicators(symbol, timeframe));
    if (hit && ageSecondsFrom(hit.fetchedAt) <= max) {
      return wrap({ data: hit.data, source, fetchedAt: hit.fetchedAt, fromCache: 'redis', dataType: 'indicators' });
    }
    const pg = await pgReadIndicators(symbol, timeframe);
    if (pg && ageSecondsFrom(pg.fetchedAt) <= max) {
      await rSet(CK.indicators(symbol, timeframe), pg.snapshot, pg.fetchedAt, FRESHNESS_RULES.indicators.realTime);
      return wrap({ data: pg.snapshot, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType: 'indicators' });
    }
  }

  // 2. Need bars first
  const barsEnv = await getBars(symbol, timeframe, opts);
  if (!barsEnv.data || barsEnv.data.length < 35) {
    return wrap<IndicatorSnapshot>({
      data: null, source, fetchedAt: new Date().toISOString(), fromCache: 'miss', dataType: 'indicators',
      missingFields: ['bars-insufficient'], error: 'not enough bars for indicator computation',
    });
  }
  const snap = computeIndicators(symbol, timeframe, barsEnv.data);
  await pgUpsertIndicators(snap).catch(() => undefined);
  await rSet(CK.indicators(symbol, timeframe), snap, snap.computedAt, FRESHNESS_RULES.indicators.realTime);
  return wrap({ data: snap, source, fetchedAt: snap.computedAt, fromCache: barsEnv.fromCache === 'av' ? 'av' : 'postgres', dataType: 'indicators' });
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

import crypto from 'crypto';

export async function getNews(symbol: string, sinceISO: string, opts: FetchOptions = {}): Promise<DataEnvelope<NewsEvent[]>> {
  const source = 'alpha-vantage:NEWS_SENTIMENT';
  const max = opts.maxAgeSec ?? FRESHNESS_RULES.news.realTime;

  if (!opts.forceFresh) {
    const hit = await rGet<NewsEvent[]>(CK.news(symbol, sinceISO));
    if (hit && ageSecondsFrom(hit.fetchedAt) <= max) {
      return wrap({ data: hit.data, source, fetchedAt: hit.fetchedAt, fromCache: 'redis', dataType: 'news' });
    }
    const pg = await pgReadNews(symbol, sinceISO);
    if (pg && ageSecondsFrom(pg.fetchedAt) <= max) {
      await rSet(CK.news(symbol, sinceISO), pg.events, pg.fetchedAt, FRESHNESS_RULES.news.realTime);
      return wrap({ data: pg.events, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType: 'news' });
    }
  }

  try {
    const fresh = await avFetchNews(symbol);
    if (!fresh) {
      const pg = await pgReadNews(symbol, sinceISO);
      if (pg) return wrap({ data: pg.events, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType: 'news', missingFields: ['live-fetch-failed'] });
      return wrap({ data: [], source, fetchedAt: new Date().toISOString(), fromCache: 'av', dataType: 'news' });
    }
    const events: NewsEvent[] = (fresh.items ?? []).map((i) => {
      const tickerScore = (i.ticker_sentiment ?? []).find((t) => t.ticker?.toUpperCase() === symbol.toUpperCase());
      // time_published format: YYYYMMDDTHHMMSS
      const tp = i.time_published;
      const iso = tp && tp.length >= 15
        ? `${tp.slice(0, 4)}-${tp.slice(4, 6)}-${tp.slice(6, 8)}T${tp.slice(9, 11)}:${tp.slice(11, 13)}:${tp.slice(13, 15)}Z`
        : new Date().toISOString();
      const sScore = tickerScore?.ticker_sentiment_score !== undefined ? Number(tickerScore.ticker_sentiment_score) : (i.overall_sentiment_score ?? null);
      const sLabel = i.overall_sentiment_label?.toLowerCase();
      const mapped: 'bullish' | 'bearish' | 'neutral' | null = sLabel?.includes('bull') ? 'bullish' : sLabel?.includes('bear') ? 'bearish' : sLabel ? 'neutral' : null;
      return {
        symbol: symbol.toUpperCase(),
        source: i.source ?? 'alpha-vantage',
        url: i.url,
        title: i.title,
        summary: i.summary ?? null,
        sentiment: sScore,
        sentimentLabel: mapped,
        relevance: tickerScore?.relevance_score !== undefined ? Number(tickerScore.relevance_score) : null,
        topics: (i.topics ?? []).map((t) => t.topic),
        publishedAt: iso,
      };
    });
    await pgUpsertNews(events).catch(() => undefined);
    await rSet(CK.news(symbol, sinceISO), events, fresh.fetchedAt, FRESHNESS_RULES.news.realTime);
    return wrap({ data: events, source, fetchedAt: fresh.fetchedAt, fromCache: 'av', dataType: 'news' });
  } catch (e) {
    const pg = await pgReadNews(symbol, sinceISO);
    if (pg) return wrap({ data: pg.events, source, fetchedAt: pg.fetchedAt, fromCache: 'postgres', dataType: 'news', missingFields: ['live-fetch-error'], error: (e as Error).message });
    return wrap<NewsEvent[]>({ data: null, source, fetchedAt: new Date().toISOString(), fromCache: 'miss', dataType: 'news', error: (e as Error).message });
  }
}

// crypto is imported only for any future url-hash needs in this module
void crypto;
