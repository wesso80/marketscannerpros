'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchScannerResults, type ScannerResponse, type ScanTimeframe } from '@/app/v2/_lib/api';

/** Page-local manual trigger; opening a page or changing controls never consumes a scan. */
export function useManualScannerResults(type: 'crypto' | 'equity', timeframe: ScanTimeframe) {
  const [data, setData] = useState<ScannerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  useEffect(() => {
    request.current += 1;
    setData(null); setLoading(false); setError(null);
    return () => { request.current += 1; };
  }, [type, timeframe]);
  const refetch = useCallback(async () => {
    const id = ++request.current;
    setLoading(true); setError(null);
    try {
      const result = await fetchScannerResults(type, timeframe);
      if (request.current === id) setData(result);
    } catch (cause) {
      if (request.current === id) setError(cause instanceof Error ? cause.message : 'Scan could not be completed.');
    } finally {
      if (request.current === id) setLoading(false);
    }
  }, [type, timeframe]);
  return { data, loading, error, refetch };
}
