'use client';

/**
 * useRankedQueue — the canonical research queue, shared by Scanner and Command Center.
 *
 * Same source as Scanner's ranked mode: POST /api/scanner/run for equity + crypto (daily),
 * scored with computeMspScore under the current regime and sorted desc. Command Center used to
 * read /api/scanner/top-cached (a different, lighter score) plus raw movers — two "queues" that
 * disagreed. Now there is one.
 */
import { useMemo } from 'react';
import { useRegime, useScannerResults, type ScanTimeframe } from '@/app/v2/_lib/api';
import { buildRankedQueue, mergeScanResults, type RankedQueueRow } from '@/lib/scanner/rankedQueue';
import { rowHasWeakData } from '@/lib/scanner/researchValidity';

export interface RankedQueueResult {
  rows: RankedQueueRow[];
  equity: RankedQueueRow[];
  crypto: RankedQueueRow[];
  loading: boolean;
  error: string | null;
  qualityWarnings: string[];
  /** True when either feed reports stale worker data. */
  stale: boolean;
  /** Minutes since the older of the two feeds was computed, when known. */
  ageMinutes: number | null;
  localDemo: boolean;
  regime: string;
  refetch: () => void;
}

export function useRankedQueue(timeframe: ScanTimeframe = 'daily'): RankedQueueResult {
  const equity = useScannerResults('equity', timeframe);
  const crypto = useScannerResults('crypto', timeframe);
  const regime = useRegime();
  const regimeRaw = regime.data?.regime || 'RANGE_NEUTRAL'; // unavailable regime → neutral weights (what /api/regime used to return with no signals)

  const rows = useMemo(
    () => buildRankedQueue(mergeScanResults(equity.data?.results, crypto.data?.results), regimeRaw),
    [equity.data, crypto.data, regimeRaw],
  );
  const qualityWarnings = [{ name: 'Equity', feed: equity }, { name: 'Crypto', feed: crypto }].flatMap(({ name, feed }) => {
    if (feed.loading) return [`${name} scan pending`];
    if (feed.isAuthError) return [`${name} scan requires sign-in`];
    if (feed.error || !feed.data?.success) return [`${name} scan unavailable`];
    const quality = feed.data.metadata?.dataQuality;
    const weak = feed.data.results.filter(rowHasWeakData).length;
    if (!quality || quality.stale || quality.providerStatus?.degraded || weak) return [`${name} scan data incomplete${weak ? ` (${weak} weak rows)` : ''}`];
    return [];
  });

  const ageMinutes = useMemo(() => {
    const stamps = [equity.data?.metadata?.dataQuality?.computedAt, crypto.data?.metadata?.dataQuality?.computedAt]
      .map((s) => (s ? Date.parse(s) : NaN))
      .filter((n) => Number.isFinite(n));
    if (!stamps.length) return null;
    return Math.max(0, Math.round((Date.now() - Math.min(...stamps)) / 60000));
  }, [equity.data, crypto.data]);

  return {
    rows,
    equity: rows.filter((r) => r.assetClass === 'equity'),
    crypto: rows.filter((r) => r.assetClass === 'crypto'),
    loading: (equity.loading || crypto.loading) && rows.length === 0,
    error: equity.error || crypto.error || null,
    qualityWarnings,
    stale: Boolean(equity.data?.metadata?.dataQuality?.stale || crypto.data?.metadata?.dataQuality?.stale),
    ageMinutes,
    localDemo: Boolean(equity.data?.metadata?.localDemo || crypto.data?.metadata?.localDemo),
    regime: regimeRaw,
    refetch: () => { equity.refetch(); crypto.refetch(); },
  };
}
