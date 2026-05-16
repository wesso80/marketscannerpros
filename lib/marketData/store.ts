/**
 * marketData/store.ts — Postgres persistence for everything the layer fetches.
 *
 * Read helpers return {data, fetchedAt} or null.
 * Write helpers UPSERT and return the row count touched.
 */

import { q } from '@/lib/db';
import type {
  OhlcBar,
  BarTimeframe,
  QuoteData,
  OverviewData,
  EarningsRow,
  OptionContract,
  NewsEvent,
  IndicatorSnapshot,
} from './types';

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------

export async function pgReadBars(symbol: string, timeframe: BarTimeframe, limit = 500): Promise<{ bars: OhlcBar[]; fetchedAt: string } | null> {
  const rows = await q<{
    ts: Date; open: string; high: string; low: string; close: string; volume: string;
  }>(
    `SELECT ts, open, high, low, close, volume
       FROM ohlcv_bars
      WHERE symbol = $1 AND timeframe = $2
      ORDER BY ts DESC
      LIMIT $3`,
    [symbol.toUpperCase(), timeframe, limit],
  );
  if (rows.length === 0) return null;
  const bars: OhlcBar[] = rows.reverse().map((r) => ({
    date: r.ts.toISOString().slice(0, 10),
    ts: r.ts.getTime(),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
  }));
  // freshness uses the most-recent bar timestamp, NOT now() — bars are stamped events
  const fetchedAt = new Date(bars[bars.length - 1].ts).toISOString();
  return { bars, fetchedAt };
}

export async function pgUpsertBars(symbol: string, timeframe: BarTimeframe, bars: OhlcBar[]): Promise<number> {
  if (bars.length === 0) return 0;
  const sym = symbol.toUpperCase();
  // Chunk to keep parameter count bounded
  const chunkSize = 200;
  let written = 0;
  for (let i = 0; i < bars.length; i += chunkSize) {
    const slice = bars.slice(i, i + chunkSize);
    const values: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const b of slice) {
      values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      params.push(sym, timeframe, new Date(b.ts), b.open, b.high, b.low, b.close, b.volume);
    }
    await q(
      `INSERT INTO ohlcv_bars (symbol, timeframe, ts, open, high, low, close, volume)
         VALUES ${values.join(',')}
         ON CONFLICT (symbol, timeframe, ts) DO UPDATE
           SET open = EXCLUDED.open,
               high = EXCLUDED.high,
               low = EXCLUDED.low,
               close = EXCLUDED.close,
               volume = EXCLUDED.volume`,
      params,
    );
    written += slice.length;
  }
  return written;
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

export async function pgReadQuote(symbol: string): Promise<{ quote: QuoteData; fetchedAt: string } | null> {
  const rows = await q<{
    symbol: string; price: string | null; open: string | null; high: string | null; low: string | null;
    prev_close: string | null; volume: string | null; change_amount: string | null; change_percent: string | null;
    latest_trading_day: Date | null; fetched_at: Date;
  }>(
    `SELECT * FROM quotes_latest WHERE symbol = $1`,
    [symbol.toUpperCase()],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    quote: {
      symbol: r.symbol,
      price: r.price === null ? null : Number(r.price),
      open: r.open === null ? null : Number(r.open),
      high: r.high === null ? null : Number(r.high),
      low: r.low === null ? null : Number(r.low),
      prevClose: r.prev_close === null ? null : Number(r.prev_close),
      volume: r.volume === null ? null : Number(r.volume),
      changeAmount: r.change_amount === null ? null : Number(r.change_amount),
      changePercent: r.change_percent === null ? null : Number(r.change_percent),
      latestTradingDay: r.latest_trading_day ? r.latest_trading_day.toISOString().slice(0, 10) : null,
    },
    fetchedAt: r.fetched_at.toISOString(),
  };
}

export async function pgUpsertQuote(quote: QuoteData, fetchedAt: string): Promise<void> {
  await q(
    `INSERT INTO quotes_latest
       (symbol, price, open, high, low, prev_close, volume, change_amount, change_percent, latest_trading_day, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (symbol) DO UPDATE
         SET price = EXCLUDED.price,
             open = EXCLUDED.open,
             high = EXCLUDED.high,
             low = EXCLUDED.low,
             prev_close = EXCLUDED.prev_close,
             volume = EXCLUDED.volume,
             change_amount = EXCLUDED.change_amount,
             change_percent = EXCLUDED.change_percent,
             latest_trading_day = EXCLUDED.latest_trading_day,
             fetched_at = EXCLUDED.fetched_at`,
    [
      quote.symbol.toUpperCase(),
      quote.price, quote.open, quote.high, quote.low, quote.prevClose,
      quote.volume, quote.changeAmount, quote.changePercent,
      quote.latestTradingDay, new Date(fetchedAt),
    ],
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function pgReadOverview(symbol: string): Promise<{ overview: OverviewData; fetchedAt: string } | null> {
  const rows = await q<{ payload: OverviewData; fetched_at: Date }>(
    `SELECT payload, fetched_at FROM company_overview WHERE symbol = $1`,
    [symbol.toUpperCase()],
  );
  if (rows.length === 0) return null;
  return { overview: rows[0].payload, fetchedAt: rows[0].fetched_at.toISOString() };
}

export async function pgUpsertOverview(overview: OverviewData, fetchedAt: string): Promise<void> {
  await q(
    `INSERT INTO company_overview
       (symbol, name, sector, industry, country, exchange, currency, description,
        market_cap, pe_ratio, peg_ratio, book_value, dividend_yield, eps, revenue_ttm,
        profit_margin, beta, high_52w, low_52w, shares_outstanding, payload, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       ON CONFLICT (symbol) DO UPDATE
         SET name = EXCLUDED.name,
             sector = EXCLUDED.sector,
             industry = EXCLUDED.industry,
             country = EXCLUDED.country,
             exchange = EXCLUDED.exchange,
             currency = EXCLUDED.currency,
             description = EXCLUDED.description,
             market_cap = EXCLUDED.market_cap,
             pe_ratio = EXCLUDED.pe_ratio,
             peg_ratio = EXCLUDED.peg_ratio,
             book_value = EXCLUDED.book_value,
             dividend_yield = EXCLUDED.dividend_yield,
             eps = EXCLUDED.eps,
             revenue_ttm = EXCLUDED.revenue_ttm,
             profit_margin = EXCLUDED.profit_margin,
             beta = EXCLUDED.beta,
             high_52w = EXCLUDED.high_52w,
             low_52w = EXCLUDED.low_52w,
             shares_outstanding = EXCLUDED.shares_outstanding,
             payload = EXCLUDED.payload,
             fetched_at = EXCLUDED.fetched_at`,
    [
      overview.symbol.toUpperCase(), overview.name, overview.sector, overview.industry,
      overview.country, overview.exchange, overview.currency, overview.description,
      overview.marketCap, overview.peRatio, overview.pegRatio, overview.bookValue,
      overview.dividendYield, overview.eps, overview.revenueTTM, overview.profitMargin,
      overview.beta, overview.high52w, overview.low52w, overview.sharesOutstanding,
      JSON.stringify(overview.raw), new Date(fetchedAt),
    ],
  );
}

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------

export async function pgReadEarnings(symbol: string, limit = 8): Promise<{ rows: EarningsRow[]; fetchedAt: string } | null> {
  const rows = await q<{
    symbol: string; report_date: Date; fiscal_quarter: string | null; fiscal_year: number | null;
    report_time: string | null; eps_estimate: string | null; eps_actual: string | null;
    eps_surprise_percent: string | null; revenue_estimate: string | null; revenue_actual: string | null;
    updated_at: Date | null;
  }>(
    `SELECT symbol, report_date, fiscal_quarter, fiscal_year, report_time,
            eps_estimate, eps_actual, eps_surprise_percent,
            revenue_estimate, revenue_actual,
            updated_at
       FROM earnings_calendar
      WHERE symbol = $1
      ORDER BY report_date DESC
      LIMIT $2`,
    [symbol.toUpperCase(), limit],
  );
  if (rows.length === 0) return null;
  const fetchedAt = (rows[0].updated_at ?? new Date()).toISOString();
  return {
    rows: rows.map((r) => ({
      symbol: r.symbol,
      reportDate: r.report_date.toISOString().slice(0, 10),
      fiscalQuarter: r.fiscal_quarter,
      fiscalYear: r.fiscal_year,
      reportTime: (r.report_time as 'BMO' | 'AMC' | 'TNS' | null) ?? null,
      epsEstimate: r.eps_estimate === null ? null : Number(r.eps_estimate),
      epsActual: r.eps_actual === null ? null : Number(r.eps_actual),
      epsSurprisePercent: r.eps_surprise_percent === null ? null : Number(r.eps_surprise_percent),
      revenueEstimate: r.revenue_estimate === null ? null : Number(r.revenue_estimate),
      revenueActual: r.revenue_actual === null ? null : Number(r.revenue_actual),
    })),
    fetchedAt,
  };
}

export async function pgUpsertEarnings(rows: EarningsRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  for (const r of rows) {
    if (!r.reportDate) continue;
    await q(
      `INSERT INTO earnings_calendar
         (symbol, report_date, eps_estimate, eps_actual, eps_surprise_percent, data_source)
         VALUES ($1,$2,$3,$4,$5,'alpha_vantage')
         ON CONFLICT DO NOTHING`,
      [r.symbol.toUpperCase(), r.reportDate, r.epsEstimate, r.epsActual, r.epsSurprisePercent],
    );
  }
  return rows.length;
}

// ---------------------------------------------------------------------------
// Options chain
// ---------------------------------------------------------------------------

export async function pgReadOptionsChain(symbol: string): Promise<{ contracts: OptionContract[]; fetchedAt: string } | null> {
  const rows = await q<{
    symbol: string; expiry: Date; strike: string; option_type: 'C' | 'P';
    bid: string | null; ask: string | null; last: string | null;
    volume: string | null; open_interest: string | null;
    implied_vol: string | null; delta: string | null; gamma: string | null;
    theta: string | null; vega: string | null; fetched_at: Date;
  }>(
    `SELECT * FROM options_chain_latest WHERE symbol = $1`,
    [symbol.toUpperCase()],
  );
  if (rows.length === 0) return null;
  const contracts: OptionContract[] = rows.map((r) => ({
    symbol: r.symbol,
    expiry: r.expiry.toISOString().slice(0, 10),
    strike: Number(r.strike),
    type: r.option_type,
    bid: r.bid === null ? null : Number(r.bid),
    ask: r.ask === null ? null : Number(r.ask),
    last: r.last === null ? null : Number(r.last),
    volume: r.volume === null ? null : Number(r.volume),
    openInterest: r.open_interest === null ? null : Number(r.open_interest),
    iv: r.implied_vol === null ? null : Number(r.implied_vol),
    delta: r.delta === null ? null : Number(r.delta),
    gamma: r.gamma === null ? null : Number(r.gamma),
    theta: r.theta === null ? null : Number(r.theta),
    vega: r.vega === null ? null : Number(r.vega),
  }));
  return { contracts, fetchedAt: rows[0].fetched_at.toISOString() };
}

export async function pgUpsertOptionsChain(symbol: string, contracts: OptionContract[], fetchedAt: string): Promise<number> {
  if (contracts.length === 0) return 0;
  const sym = symbol.toUpperCase();
  // Replace chain in one transaction by deleting then inserting
  await q(`DELETE FROM options_chain_latest WHERE symbol = $1`, [sym]);
  const chunkSize = 100;
  for (let i = 0; i < contracts.length; i += chunkSize) {
    const slice = contracts.slice(i, i + chunkSize);
    const values: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const c of slice) {
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},NULL,$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
      params.push(
        sym, c.expiry, c.strike, c.type,
        c.bid, c.ask, c.last,
        c.volume, c.openInterest,
        c.iv, c.delta, c.gamma, c.theta, c.vega,
        new Date(fetchedAt),
      );
    }
    await q(
      `INSERT INTO options_chain_latest
        (symbol, expiry, strike, option_type, bid, ask, last, fmv, volume, open_interest,
         implied_vol, delta, gamma, theta, vega, fetched_at)
        VALUES ${values.join(',')}
        ON CONFLICT (symbol, expiry, strike, option_type) DO NOTHING`,
      params,
    );
  }
  return contracts.length;
}

// ---------------------------------------------------------------------------
// Indicators (computed from bars)
// ---------------------------------------------------------------------------

export async function pgReadIndicators(symbol: string, timeframe: BarTimeframe): Promise<{ snapshot: IndicatorSnapshot; fetchedAt: string } | null> {
  const rows = await q<{
    symbol: string; timeframe: BarTimeframe;
    rsi14: string | null; macd_line: string | null; macd_signal: string | null; macd_hist: string | null;
    ema9: string | null; ema20: string | null; ema50: string | null; ema200: string | null;
    sma20: string | null; sma50: string | null; sma200: string | null;
    atr14: string | null; adx14: string | null; plus_di: string | null; minus_di: string | null;
    stoch_k: string | null; stoch_d: string | null;
    bb_upper: string | null; bb_middle: string | null; bb_lower: string | null;
    obv: string | null; vwap: string | null; in_squeeze: boolean | null;
    computed_at: Date;
  }>(`SELECT * FROM indicators_latest WHERE symbol = $1 AND timeframe = $2`, [symbol.toUpperCase(), timeframe]);
  if (rows.length === 0) return null;
  const r = rows[0];
  const numOrNull = (v: string | null) => (v === null ? null : Number(v));
  return {
    snapshot: {
      symbol: r.symbol,
      timeframe: r.timeframe,
      rsi14: numOrNull(r.rsi14),
      macd: { line: numOrNull(r.macd_line), signal: numOrNull(r.macd_signal), hist: numOrNull(r.macd_hist) },
      ema: { e9: numOrNull(r.ema9), e20: numOrNull(r.ema20), e50: numOrNull(r.ema50), e200: numOrNull(r.ema200) },
      sma: { s20: numOrNull(r.sma20), s50: numOrNull(r.sma50), s200: numOrNull(r.sma200) },
      atr14: numOrNull(r.atr14),
      adx14: numOrNull(r.adx14),
      plusDI: numOrNull(r.plus_di),
      minusDI: numOrNull(r.minus_di),
      stoch: { k: numOrNull(r.stoch_k), d: numOrNull(r.stoch_d) },
      bb: { upper: numOrNull(r.bb_upper), middle: numOrNull(r.bb_middle), lower: numOrNull(r.bb_lower) },
      obv: numOrNull(r.obv),
      vwap: numOrNull(r.vwap),
      inSqueeze: r.in_squeeze,
      computedAt: r.computed_at.toISOString(),
    },
    fetchedAt: r.computed_at.toISOString(),
  };
}

export async function pgUpsertIndicators(snapshot: IndicatorSnapshot): Promise<void> {
  await q(
    `INSERT INTO indicators_latest
       (symbol, timeframe, rsi14, macd_line, macd_signal, macd_hist,
        ema9, ema20, ema50, ema200, sma20, sma50, sma200,
        atr14, adx14, plus_di, minus_di, stoch_k, stoch_d,
        bb_upper, bb_middle, bb_lower, obv, vwap, in_squeeze, computed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
       ON CONFLICT (symbol, timeframe) DO UPDATE
         SET rsi14 = EXCLUDED.rsi14,
             macd_line = EXCLUDED.macd_line, macd_signal = EXCLUDED.macd_signal, macd_hist = EXCLUDED.macd_hist,
             ema9 = EXCLUDED.ema9, ema20 = EXCLUDED.ema20, ema50 = EXCLUDED.ema50, ema200 = EXCLUDED.ema200,
             sma20 = EXCLUDED.sma20, sma50 = EXCLUDED.sma50, sma200 = EXCLUDED.sma200,
             atr14 = EXCLUDED.atr14, adx14 = EXCLUDED.adx14,
             plus_di = EXCLUDED.plus_di, minus_di = EXCLUDED.minus_di,
             stoch_k = EXCLUDED.stoch_k, stoch_d = EXCLUDED.stoch_d,
             bb_upper = EXCLUDED.bb_upper, bb_middle = EXCLUDED.bb_middle, bb_lower = EXCLUDED.bb_lower,
             obv = EXCLUDED.obv, vwap = EXCLUDED.vwap,
             in_squeeze = EXCLUDED.in_squeeze, computed_at = EXCLUDED.computed_at`,
    [
      snapshot.symbol.toUpperCase(), snapshot.timeframe,
      snapshot.rsi14, snapshot.macd.line, snapshot.macd.signal, snapshot.macd.hist,
      snapshot.ema.e9, snapshot.ema.e20, snapshot.ema.e50, snapshot.ema.e200,
      snapshot.sma.s20, snapshot.sma.s50, snapshot.sma.s200,
      snapshot.atr14, snapshot.adx14, snapshot.plusDI, snapshot.minusDI,
      snapshot.stoch.k, snapshot.stoch.d,
      snapshot.bb.upper, snapshot.bb.middle, snapshot.bb.lower,
      snapshot.obv, snapshot.vwap, snapshot.inSqueeze, new Date(snapshot.computedAt),
    ],
  );
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

import crypto from 'crypto';

export async function pgUpsertNews(events: NewsEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  for (const ev of events) {
    const urlHash = crypto.createHash('sha256').update(ev.url).digest('hex');
    await q(
      `INSERT INTO news_events
        (symbol, source, url_hash, url, title, summary, sentiment, sentiment_label, relevance, topics, published_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (symbol, url_hash) DO NOTHING`,
      [
        ev.symbol.toUpperCase(), ev.source, urlHash, ev.url, ev.title, ev.summary,
        ev.sentiment, ev.sentimentLabel, ev.relevance, JSON.stringify(ev.topics),
        new Date(ev.publishedAt),
      ],
    );
  }
  return events.length;
}

export async function pgReadNews(symbol: string, sinceISO: string, limit = 50): Promise<{ events: NewsEvent[]; fetchedAt: string } | null> {
  const rows = await q<{
    symbol: string; source: string; url: string; title: string; summary: string | null;
    sentiment: string | null; sentiment_label: string | null; relevance: string | null;
    topics: string[] | null; published_at: Date; fetched_at: Date;
  }>(
    `SELECT symbol, source, url, title, summary, sentiment, sentiment_label, relevance, topics, published_at, fetched_at
       FROM news_events
      WHERE symbol = $1 AND published_at >= $2
      ORDER BY published_at DESC
      LIMIT $3`,
    [symbol.toUpperCase(), new Date(sinceISO), limit],
  );
  if (rows.length === 0) return null;
  return {
    events: rows.map((r) => ({
      symbol: r.symbol,
      source: r.source,
      url: r.url,
      title: r.title,
      summary: r.summary,
      sentiment: r.sentiment === null ? null : Number(r.sentiment),
      sentimentLabel: (r.sentiment_label as 'bullish' | 'bearish' | 'neutral' | null) ?? null,
      relevance: r.relevance === null ? null : Number(r.relevance),
      topics: Array.isArray(r.topics) ? r.topics : [],
      publishedAt: r.published_at.toISOString(),
    })),
    fetchedAt: rows[0].fetched_at.toISOString(),
  };
}
