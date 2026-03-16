'use client';

/**
 * useEdgeProfile — React hook for fetching the trader's edge profile.
 * Follows the same useApi pattern as other v2 hooks.
 */

import { useState, useEffect, useCallback } from 'react';
import type { EdgeProfile } from '@/lib/intelligence/edgeProfile';

export interface UseEdgeProfileResult {
  data: EdgeProfile | null;
  error: string | null;
  loading: boolean;
  isEmpty: boolean;
  refetch: () => void;
}

export function useEdgeProfile(lookbackDays?: number): UseEdgeProfileResult {
  const [data, setData] = useState<EdgeProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [trigger, setTrigger] = useState(0);

  const refetch = useCallback(() => setTrigger(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (lookbackDays != null) params.set('lookback', String(lookbackDays));

    fetch(`/api/intelligence/edge-profile${params.toString() ? '?' + params : ''}`, {
      credentials: 'same-origin',
    })
      .then(res => {
        if (res.status === 401 || res.status === 403) return null;
        if (!res.ok) throw new Error(`Edge profile ${res.status}`);
        return res.json();
      })
      .then(json => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [trigger, lookbackDays]);

  return {
    data,
    error,
    loading,
    isEmpty: !loading && (data?.totalOutcomes ?? 0) === 0,
    refetch,
  };
}
