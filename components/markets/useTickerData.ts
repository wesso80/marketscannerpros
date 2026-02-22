'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AssetClass,
  TickerContext,
  QuoteData,
  ScannerResult,
  FlowData,
  OptionsData,
  NewsItem,
  EarningsEvent,
  EconomicEvent,
} from './types';

/**
 * Central data hook for the Markets page.
 * When the active symbol changes, fires all relevant API requests in parallel
 * and assembles a unified TickerContext object.
 */
export function useTickerData(symbol: string | null, assetClass: AssetClass): TickerContext {
  const [ctx, setCtx] = useState<TickerContext>({
    symbol: symbol || '',
    assetClass,
    quote: null,
    scanner: null,
    flow: null,
    options: null,
    news: [],
    earnings: [],
    economic: [],
    loading: false,
  });

  const abortRef = useRef<AbortController | null>(null);

  const fetchAll = useCallback(async (sym: string, ac: AssetClass) => {
    // Cancel previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setCtx(prev => ({ ...prev, symbol: sym, assetClass: ac, loading: true }));

    const signal = controller.signal;
    const type = ac === 'crypto' ? 'crypto' : 'stock';

    // Fire all requests in parallel
    const [quoteRes, scannerRes, flowRes, optionsRes, newsRes, earningsRes, econRes] =
      await Promise.allSettled([
        // 1. Quote
        fetch(`/api/quote?symbol=${sym}&type=${type}`, { signal })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),

        // 2. Scanner single-symbol scan
        fetch('/api/scanner/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: ac === 'crypto' ? 'crypto' : 'equity', timeframe: 'daily', minScore: 0, symbols: [sym] }),
          signal,
        })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),

        // 3. Flow / Capital data (Pro Trader)
        fetch(`/api/flow?symbol=${sym}`, { signal })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),

        // 4. Options scan (Pro Trader) — requires POST
        fetch('/api/options-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: sym, scanMode: 'intraday_1h' }),
          signal,
        })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),

        // 5. News sentiment
        fetch(`/api/news-sentiment?tickers=${sym}`, { signal })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),

        // 6. Earnings calendar
        fetch(`/api/earnings-calendar?symbol=${sym}`, { signal })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),

        // 7. Economic calendar
        fetch('/api/economic-calendar?days=14&impact=high', { signal })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),
      ]);

    if (signal.aborted) return;

    // Parse results
    const quoteRaw = quoteRes.status === 'fulfilled' ? quoteRes.value : null;
    const scannerRaw = scannerRes.status === 'fulfilled' ? scannerRes.value : null;
    const flowRaw = flowRes.status === 'fulfilled' ? flowRes.value : null;
    const optionsRaw = optionsRes.status === 'fulfilled' ? optionsRes.value : null;
    const newsRaw = newsRes.status === 'fulfilled' ? newsRes.value : null;
    const earningsRaw = earningsRes.status === 'fulfilled' ? earningsRes.value : null;
    const econRaw = econRes.status === 'fulfilled' ? econRes.value : null;

    // Build quote
    let quote: QuoteData | null = null;
    if (quoteRaw?.ok && quoteRaw.price) {
      quote = {
        symbol: sym,
        price: quoteRaw.price,
        change: quoteRaw.change ?? 0,
        changePercent: quoteRaw.changePercent ?? 0,
        volume: quoteRaw.volume,
        previousClose: quoteRaw.previousClose,
        high: quoteRaw.high,
        low: quoteRaw.low,
        open: quoteRaw.open,
        source: quoteRaw.source,
      };
    }

    // Build scanner result (picks best match for this symbol)
    let scanner: ScannerResult | null = null;
    if (scannerRaw?.results?.length > 0) {
      // Match by symbol (scanner returns e.g. "TSLA" or "BTC-USD")
      const match = scannerRaw.results.find((r: any) => {
        const s = (r.symbol ?? '').toUpperCase().replace(/-USD$/, '');
        return s === sym.toUpperCase() || (r.symbol ?? '').toUpperCase() === sym.toUpperCase();
      }) || scannerRaw.results[0];
      if (match) {
        // Translate scanner direction to expected enum
        const dir: 'LONG' | 'SHORT' = match.direction === 'bearish' ? 'SHORT' : 'LONG';
        // Compute entry/stop/target from price + ATR if not already set
        const price = match.price ?? 0;
        const atr = match.atr ?? 0;
        const entry = match.entry ?? price;
        const stop = match.stop ?? (dir === 'LONG' ? price - atr * 1.5 : price + atr * 1.5);
        const target = match.target ?? (dir === 'LONG' ? price + atr * 3 : price - atr * 3);
        const riskPerUnit = Math.abs(entry - stop);
        const rMultiple = match.rMultiple ?? (riskPerUnit > 0 ? Math.abs(target - entry) / riskPerUnit : 0);

        // Build support/resistance from EMA and chart data
        const levels: { support: number[]; resistance: number[] } = match.levels ?? { support: [], resistance: [] };
        if (levels.support.length === 0 && levels.resistance.length === 0 && price > 0) {
          const ema200 = match.ema200;
          if (ema200 && ema200 > 0) {
            if (ema200 < price) levels.support.push(ema200);
            else levels.resistance.push(ema200);
          }
          if (stop > 0 && dir === 'LONG') levels.support.push(stop);
          if (stop > 0 && dir === 'SHORT') levels.resistance.push(stop);
          if (target > 0 && dir === 'LONG') levels.resistance.push(target);
          if (target > 0 && dir === 'SHORT') levels.support.push(target);
        }

        scanner = {
          symbol: match.symbol,
          score: match.score ?? 0,
          direction: dir,
          confidence: match.confidence ?? Math.min(99, Math.abs(match.score ?? 0)),
          setup: match.setup ?? (match.signals ? `${match.signals.bullish}B/${match.signals.bearish}Be signals` : ''),
          entry,
          stop: Math.max(0, stop),
          target: Math.max(0, target),
          rMultiple,
          indicators: {
            rsi: match.rsi,
            macd_hist: match.macd_hist,
            ema200: match.ema200,
            atr: match.atr,
            adx: match.adx,
            stoch_k: match.stoch_k,
            stoch_d: match.stoch_d,
            cci: match.cci,
            aroon_up: match.aroon_up,
            aroon_down: match.aroon_down,
            obv: match.obv,
            chartData: match.chartData,
          },
          levels,
        };
      }
    }

    // Build flow — unwrap { success, data } envelope
    const flow: FlowData | null = (flowRaw?.success && flowRaw?.data) ? flowRaw.data : null;

    // Build options — reject docs response (GET returns API documentation, not scan data)
    // Options-scan POST returns { success, data: { ...analysis, capitalFlow, dealerGamma, ... } }
    let options: OptionsData | null = null;
    if (optionsRaw?.success && optionsRaw?.data) {
      const d = optionsRaw.data;
      const ivAnalysis = d.ivAnalysis;
      const oiAnalysis = d.openInterestAnalysis;
      const dealerGamma = d.dealerGamma;
      options = {
        symbol: sym,
        iv: Number(ivAnalysis?.currentIV ?? ivAnalysis?.avgImpliedVol ?? 0) * (ivAnalysis?.currentIV > 1 ? 1 : 100),
        ivRank: Number(ivAnalysis?.ivRank ?? ivAnalysis?.ivRankHeuristic ?? 0),
        expectedMove: Number(d.expectedMove?.selectedExpiryPercent ?? 0),
        putCallRatio: Number(oiAnalysis?.pcRatio ?? 0),
        maxPain: Number(oiAnalysis?.maxPainStrike ?? dealerGamma?.maxPainStrike ?? 0),
        topStrikes: (oiAnalysis?.highOIStrikes ?? []).slice(0, 10).map((s: any) => ({
          strike: s.strike ?? 0,
          type: (s.dominantSide ?? 'call').toLowerCase().includes('put') ? 'put' as const : 'call' as const,
          volume: s.volume ?? 0,
          oi: s.totalOI ?? ((s.callOI ?? 0) + (s.putOI ?? 0)),
        })),
        gex: dealerGamma?.netGammaExposure ?? undefined,
        dex: dealerGamma?.netDeltaExposure ?? undefined,
      };
    }

    // Build news
    const news: NewsItem[] = (newsRaw?.recentHeadlines ?? []).map((h: any) => ({
      title: h.title,
      source: h.source,
      publishedAt: h.publishedAt,
      url: h.url,
      sentiment: h.overallSentiment ?? { score: 0, label: 'Neutral' },
    }));

    // Build earnings
    const earnings: EarningsEvent[] = (earningsRaw?.earnings ?? earningsRaw?.events ?? []).slice(0, 10);

    // Build economic events
    const economic: EconomicEvent[] = (econRaw?.events ?? econRaw?.calendar ?? []).slice(0, 20);

    setCtx({
      symbol: sym,
      assetClass: ac,
      quote,
      scanner,
      flow,
      options,
      news,
      earnings,
      economic,
      loading: false,
    });
  }, []);

  useEffect(() => {
    if (symbol && symbol.trim().length > 0) {
      fetchAll(symbol.toUpperCase(), assetClass);
    } else {
      setCtx(prev => ({ ...prev, symbol: '', loading: false, quote: null, scanner: null, flow: null, options: null, news: [], earnings: [], economic: [] }));
    }
  }, [symbol, assetClass, fetchAll]);

  return ctx;
}
