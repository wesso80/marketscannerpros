'use client';

/**
 * useCachedTopSymbols — Reads pre-cached top symbols from worker DB.
 *
 * Calls GET /api/scanner/top-cached which reads from quotes_latest + indicators_latest
 * (populated by the background worker). Zero Alpha Vantage API calls.
 *
 * Returns ranked equity + crypto symbols with basic score, direction, price, and changePct.
 */

import { useState, useEffect, useCallback } from 'react';

export interface CachedSymbol {
  symbol: string;
  score: number;
  direction: string;
  price: number;
  changePct: number;
  rsi: number;
  adx: number;
  type: string;
}

export interface CachedTopSymbolsResult {
  equity: CachedSymbol[];
  crypto: CachedSymbol[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCachedTopSymbols(limit = 10): CachedTopSymbolsResult {
  const [equity, setEquity] = useState<CachedSymbol[]>([]);
  const [crypto, setCrypto] = useState<CachedSymbol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);

  const refetch = useCallback(() => setTrigger(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/scanner/top-cached?type=all&limit=${limit}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (cancelled) return;
        setEquity(data.equity || []);
        setCrypto(data.crypto || []);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [limit, trigger]);

  return { equity, crypto, loading, error, refetch };
}
