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

        // 4. Options scan (Pro Trader)
        fetch(`/api/options-scan?symbol=${sym}`, { signal })
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
      const match = scannerRaw.results.find((r: any) => r.symbol?.toUpperCase() === sym.toUpperCase());
      if (match) {
        scanner = {
          symbol: match.symbol,
          score: match.score ?? 0,
          direction: match.direction ?? 'LONG',
          confidence: match.confidence ?? 0,
          setup: match.setup ?? '',
          entry: match.entry ?? 0,
          stop: match.stop ?? 0,
          target: match.target ?? 0,
          rMultiple: match.rMultiple ?? 0,
          indicators: match.indicators ?? {},
          levels: match.levels,
        };
      }
    }

    // Build flow
    const flow: FlowData | null = flowRaw ?? null;

    // Build options
    const options: OptionsData | null = optionsRaw ?? null;

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
