'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AssetClass,
  TickerContext,
  QuoteData,
  ScannerResult,
  FlowData,
  OptionsData,
  CryptoDerivatives,
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
    cryptoDerivatives: null,
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
    const isCrypto = ac === 'crypto';

    // Build request array — different for crypto vs equities
    const requests: Promise<any>[] = [
      // 0. Quote (always)
      fetch(`/api/quote?symbol=${sym}&type=${type}`, { signal })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),

      // 1. Scanner single-symbol scan (always)
      fetch('/api/scanner/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: isCrypto ? 'crypto' : 'equity', timeframe: 'daily', minScore: 0, symbols: [sym] }),
        signal,
      })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),

      // 2. Flow / Capital data — pass marketType for crypto
      fetch(`/api/flow?symbol=${sym}${isCrypto ? '&marketType=crypto' : ''}`, { signal })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),

      // 3. Options (equity only) OR Funding rates (crypto only)
      isCrypto
        ? fetch(`/api/funding-rates`, { signal })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        : fetch('/api/options-scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: sym, scanMode: 'intraday_1h' }),
            signal,
          })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null),

      // 4. News sentiment (always)
      fetch(`/api/news-sentiment?tickers=${sym}`, { signal })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),

      // 5. Earnings (equity only) OR Long/Short ratio (crypto only)
      isCrypto
        ? fetch(`/api/long-short-ratio`, { signal })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        : fetch(`/api/earnings-calendar?symbol=${sym}`, { signal })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null),

      // 6. Economic calendar (always)
      fetch('/api/economic-calendar?days=14&impact=high', { signal })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),

      // 7. Crypto liquidations (crypto only, null for equities)
      isCrypto
        ? fetch(`/api/crypto/liquidations?symbol=${sym}`, { signal })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        : Promise.resolve(null),
    ];

    const results = await Promise.allSettled(requests);

    if (signal.aborted) return;

    // Parse results
    const quoteRaw       = results[0].status === 'fulfilled' ? results[0].value : null;
    const scannerRaw     = results[1].status === 'fulfilled' ? results[1].value : null;
    const flowRaw        = results[2].status === 'fulfilled' ? results[2].value : null;
    const slotRaw        = results[3].status === 'fulfilled' ? results[3].value : null; // options OR funding rates
    const newsRaw        = results[4].status === 'fulfilled' ? results[4].value : null;
    const slot5Raw       = results[5].status === 'fulfilled' ? results[5].value : null; // earnings OR L/S ratio
    const econRaw        = results[6].status === 'fulfilled' ? results[6].value : null;
    const liquidationsRaw = results[7].status === 'fulfilled' ? results[7].value : null;

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
        // Crypto-specific fields from CoinGecko market data
        ...(isCrypto ? {
          marketCap: quoteRaw.marketCap,
          marketCapRank: quoteRaw.marketCapRank,
          circulatingSupply: quoteRaw.circulatingSupply,
          totalSupply: quoteRaw.totalSupply,
        } : {}),
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
        // Use Number.isFinite guards to prevent NaN propagation (NaN ?? 0 does NOT catch NaN)
        const price = Number.isFinite(match.price) ? match.price : 0;
        const atr = Number.isFinite(match.atr) ? match.atr : (price > 0 ? price * 0.02 : 0); // Fallback: 2% of price
        const entry = Number.isFinite(match.entry) ? match.entry : price;
        const stop = Number.isFinite(match.stop) ? match.stop : (dir === 'LONG' ? price - atr * 1.5 : price + atr * 1.5);
        const target = Number.isFinite(match.target) ? match.target : (dir === 'LONG' ? price + atr * 3 : price - atr * 3);
        const riskPerUnit = Math.abs(entry - stop);
        const rMultiple = Number.isFinite(match.rMultiple) ? match.rMultiple : (riskPerUnit > 0 ? Math.abs(target - entry) / riskPerUnit : 0);
        const confidence = Number.isFinite(match.confidence) ? match.confidence : Math.min(99, Math.abs(match.score ?? 0));

        // Build support/resistance from EMA and chart data
        const levels: { support: number[]; resistance: number[] } = match.levels ?? { support: [], resistance: [] };
        if (levels.support.length === 0 && levels.resistance.length === 0 && price > 0) {
          const ema200 = match.ema200;
          if (Number.isFinite(ema200) && ema200 > 0) {
            if (ema200 < price) levels.support.push(ema200);
            else levels.resistance.push(ema200);
          }
          if (Number.isFinite(stop) && stop > 0 && dir === 'LONG') levels.support.push(stop);
          if (Number.isFinite(stop) && stop > 0 && dir === 'SHORT') levels.resistance.push(stop);
          if (Number.isFinite(target) && target > 0 && dir === 'LONG') levels.resistance.push(target);
          if (Number.isFinite(target) && target > 0 && dir === 'SHORT') levels.support.push(target);
        }

        scanner = {
          symbol: match.symbol,
          score: match.score ?? 0,
          direction: dir,
          confidence,
          setup: match.setup ?? (match.signals ? `${match.signals.bullish}B/${match.signals.bearish}Be signals` : ''),
          entry,
          stop: Math.max(0, stop),
          target: Math.max(0, target),
          rMultiple: Math.round(rMultiple * 10) / 10,
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

    // Build options (equity only) OR crypto derivatives
    let options: OptionsData | null = null;
    let cryptoDerivatives: CryptoDerivatives | null = null;

    if (isCrypto) {
      // Assemble crypto derivatives from funding-rates, long-short-ratio, liquidations endpoints
      const fundingRaw = slotRaw;   // /api/funding-rates response
      const lsRaw = slot5Raw;       // /api/long-short-ratio response

      // Find this symbol's data in the aggregated responses
      // Both APIs return { coins: [...], average: {...} }
      const symUpper = sym.toUpperCase();
      const fundingEntry = (fundingRaw?.coins ?? []).find?.((r: any) =>
        (r.symbol ?? '').toUpperCase().replace(/-USD$|USDT$/i, '') === symUpper
      );
      const lsEntry = (lsRaw?.coins ?? []).find?.((r: any) =>
        (r.symbol ?? '').toUpperCase().replace(/-USD$|USDT$/i, '') === symUpper
      );

      if (fundingEntry || lsEntry) {
        cryptoDerivatives = {
          symbol: sym,
          fundingRate: Number(fundingEntry?.fundingRatePercent ?? fundingEntry?.fundingRate ?? 0),
          fundingAnnualized: Number(fundingEntry?.annualized ?? 0),
          openInterest: undefined, // Not in funding-rates endpoint; flow API may provide
          longShortRatio: Number(lsEntry?.longShortRatio ?? 0) || undefined,
          sentiment: fundingEntry?.sentiment ?? (lsRaw?.average?.sentiment) ?? undefined,
          basis: undefined,
          volume24h: undefined,
          exchangeCount: fundingEntry?.exchanges ?? undefined,
        };

        // Add liquidation data if available
        // Liquidations API returns { summary, coins: [...] }
        if (liquidationsRaw?.coins?.length > 0) {
          const liqEntry = liquidationsRaw.coins.find((l: any) =>
            (l.symbol ?? '').toUpperCase() === symUpper
          );
          if (liqEntry) {
            cryptoDerivatives.liquidations = {
              long24h: Number(liqEntry.longValue ?? 0),
              short24h: Number(liqEntry.shortValue ?? 0),
              total24h: Number(liqEntry.totalValue ?? 0),
            };
          }
        }

        // Add top contracts from funding data
        const contracts = fundingEntry?.contracts ?? fundingEntry?.exchanges ?? [];
        if (Array.isArray(contracts) && contracts.length > 0) {
          cryptoDerivatives.topContracts = contracts.slice(0, 8).map((c: any) => ({
            exchange: c.exchange ?? c.name ?? '',
            symbol: c.symbol ?? c.pair ?? '',
            fundingRate: Number(c.fundingRate ?? 0),
            openInterest: Number(c.openInterest ?? c.oi ?? 0),
            volume24h: Number(c.volume24h ?? c.volume ?? 0),
            spread: Number(c.spread ?? 0) || undefined,
          }));
        }
      }
    } else {
      // Equity options-scan POST response
      const optionsRaw = slotRaw;
      if (optionsRaw?.success && optionsRaw?.data) {
        const d = optionsRaw.data;
        const ivAnalysis = d.ivAnalysis;
        const oiAnalysis = d.openInterestAnalysis;
        const dealerGamma = d.dealerGamma;
        const ivRaw = Number(ivAnalysis?.currentIV ?? ivAnalysis?.avgImpliedVol ?? 0);
        options = {
          symbol: sym,
          iv: ivRaw * (ivRaw > 1 ? 1 : 100),
          ivRank: Number(ivAnalysis?.ivRank ?? ivAnalysis?.ivRankHeuristic ?? 0),
          expectedMove: Number(d.expectedMove?.selectedExpiryPercent ?? 0),
          putCallRatio: Number(oiAnalysis?.pcRatio ?? 0),
          maxPain: Number(oiAnalysis?.maxPainStrike ?? dealerGamma?.maxPainStrike ?? 0),
          topStrikes: (oiAnalysis?.highOIStrikes ?? []).slice(0, 10).map((s: any) => ({
            strike: s.strike ?? 0,
            type: (s.type ?? s.dominantSide ?? 'call').toLowerCase().includes('put') ? 'put' as const : 'call' as const,
            volume: s.volume ?? 0,
            oi: s.openInterest ?? s.totalOI ?? ((s.callOI ?? 0) + (s.putOI ?? 0)),
          })),
          gex: dealerGamma?.netGexUsd ?? undefined,
          dex: dealerGamma?.netDexUsd ?? undefined,
        };
      }
    }

    // Build news — API returns 'articles' (main key) or 'recentHeadlines' (legacy)
    const rawArticles = newsRaw?.articles ?? newsRaw?.recentHeadlines ?? [];
    const news: NewsItem[] = rawArticles.map((h: any) => ({
      title: h.title,
      source: h.source,
      publishedAt: h.publishedAt ?? h.time_published ?? h.published_at ?? '',
      url: h.url,
      sentiment: h.overallSentiment ?? h.sentiment ?? { score: 0, label: 'Neutral' },
    }));

    // Build earnings (equity only — slot5 has earnings for equities)
    const earningsRaw = isCrypto ? null : slot5Raw;
    const earnings: EarningsEvent[] = isCrypto ? [] : (earningsRaw?.earnings ?? earningsRaw?.events ?? []).slice(0, 10);

    // Build economic events
    const economic: EconomicEvent[] = (econRaw?.events ?? econRaw?.calendar ?? []).slice(0, 20);

    setCtx({
      symbol: sym,
      assetClass: ac,
      quote,
      scanner,
      flow,
      options,
      cryptoDerivatives,
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
      setCtx(prev => ({ ...prev, symbol: '', loading: false, quote: null, scanner: null, flow: null, options: null, cryptoDerivatives: null, news: [], earnings: [], economic: [] }));
    }
  }, [symbol, assetClass, fetchAll]);

  return ctx;
}
