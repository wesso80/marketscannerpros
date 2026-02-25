'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  CryptoDerivativesResponse,
  TopCoinsDerivativesResponse,
  DerivativeRow,
  FundingHeatmapCell,
  DerivedSignal,
} from '@/types/cryptoTerminal';

/* ─── single-coin state ──────────────────────────── */

export interface UseCryptoDerivativesState {
  data: CryptoDerivativesResponse | null;
  loading: boolean;
  error: string | null;
  fetch: (symbol: string) => Promise<void>;
  lastFetchedAt: string | null;
}

export function useCryptoDerivatives(initialSymbol = 'BTC'): UseCryptoDerivativesState {
  const [data, setData] = useState<CryptoDerivativesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (symbol: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/crypto-derivatives?symbol=${encodeURIComponent(symbol)}`, {
        signal: ctrl.signal,
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: CryptoDerivativesResponse = await res.json();
      if (!ctrl.signal.aborted) setData(json);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError(e.message || 'Failed to fetch derivatives data');
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(initialSymbol);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    data,
    loading,
    error,
    fetch: fetchData,
    lastFetchedAt: data?.fetchedAt ?? null,
  };
}

/* ─── multi-coin state (heatmap / overview) ──────── */

export interface UseMultiCoinDerivativesState {
  data: TopCoinsDerivativesResponse | null;
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
}

export function useMultiCoinDerivatives(): UseMultiCoinDerivativesState {
  const [data, setData] = useState<TopCoinsDerivativesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/crypto-derivatives?mode=multi', {
        signal: ctrl.signal,
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: TopCoinsDerivativesResponse = await res.json();
      if (!ctrl.signal.aborted) setData(json);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError(e.message || 'Failed to fetch multi-coin data');
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading, error, fetch: fetchData };
}

/* ─── derived builders (pure functions) ──────────── */

/** Build funding heatmap cells from multi-coin data */
export function buildFundingHeatmap(
  data: TopCoinsDerivativesResponse
): FundingHeatmapCell[] {
  const cells: FundingHeatmapCell[] = [];
  for (const coin of data.coins) {
    for (const row of coin.exchanges) {
      cells.push({
        symbol: coin.symbol,
        exchange: row.market,
        fundingPct: row.fundingPct,
        oi: row.openInterest,
      });
    }
  }
  return cells;
}

/** Generate signals from single-coin data */
export function buildSignals(data: CryptoDerivativesResponse): DerivedSignal[] {
  const signals: DerivedSignal[] = [];
  const { coin, rows, aggregatedFunding, aggregatedOI } = data;

  // Funding rate extremes
  if (Math.abs(aggregatedFunding.fundingRatePct) > 0.05) {
    const dir = aggregatedFunding.fundingRatePct > 0 ? 'bullish' : 'bearish';
    signals.push({
      symbol: coin.symbol,
      type: 'funding',
      label: `Extreme funding ${aggregatedFunding.fundingRatePct > 0 ? '(longs paying)' : '(shorts paying)'}`,
      detail: `Avg funding ${aggregatedFunding.fundingRatePct.toFixed(4)}% across ${aggregatedFunding.exchangeCount} exchanges → ${dir === 'bullish' ? 'short squeeze risk if price dips' : 'long squeeze risk if price pumps'}`,
      severity: dir,
    });
  }

  // Funding divergence across exchanges
  const spread = aggregatedFunding.max - aggregatedFunding.min;
  if (spread > 0.02 && rows.length >= 3) {
    signals.push({
      symbol: coin.symbol,
      type: 'funding',
      label: 'Funding divergence across exchanges',
      detail: `Spread: ${spread.toFixed(4)}% (${aggregatedFunding.min.toFixed(4)}% to ${aggregatedFunding.max.toFixed(4)}%) — possible arbitrage opportunity`,
      severity: 'neutral',
    });
  }

  // High OI relative to volume
  if (aggregatedOI.totalOI > 0 && aggregatedOI.totalVolume24h > 0) {
    const oiToVol = aggregatedOI.totalOI / aggregatedOI.totalVolume24h;
    if (oiToVol > 3) {
      signals.push({
        symbol: coin.symbol,
        type: 'oi',
        label: 'High OI-to-volume ratio',
        detail: `OI/Volume = ${oiToVol.toFixed(1)}x — positions are crowded relative to activity, potential for squeeze`,
        severity: 'neutral',
      });
    }
  }

  // Basis trade opportunity
  const basisRows = rows.filter(r => Math.abs(r.basis) > 0.05);
  if (basisRows.length > 0) {
    const worst = basisRows.sort((a, b) => Math.abs(b.basis) - Math.abs(a.basis))[0];
    signals.push({
      symbol: coin.symbol,
      type: 'basis',
      label: `Significant basis on ${worst.market}`,
      detail: `Basis: ${worst.basis.toFixed(4)} — ${worst.basis > 0 ? 'premium (futures > spot)' : 'discount (futures < spot)'}`,
      severity: worst.basis > 0 ? 'bullish' : 'bearish',
    });
  }

  return signals;
}
