'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePolling } from '@/hooks/usePolling';
import type { Regime } from '@/lib/risk-governor-hard';
import type { RegimeDataQuality } from '@/lib/regime/riskLevel';

type RiskLevel = 'low' | 'moderate' | 'elevated' | 'extreme';
type Permission = 'YES' | 'CONDITIONAL' | 'NO';

export interface RegimeSignal {
  source: string;
  regime: string;
  weight: number;
  stale: boolean;
  /** 'market' = stored market data (VIX, SPY/QQQ trend); 'workspace' = this account's own signals. */
  kind?: 'market' | 'workspace';
  /** False when shown for context only (did not decide the regime). */
  counted?: boolean;
  asOf?: string | null;
  detail?: string;
}

/** An available regime. When /api/regime has no regime, `data` is null and `unavailableReason` says why. */
export interface UnifiedRegime {
  available?: true;
  basis?: 'market' | 'workspace';
  regime: Regime;
  riskLevel: RiskLevel;
  permission: Permission;
  /** Stale deciding inputs, as a caution (does not change riskLevel). Missing on older responses. */
  dataQuality?: RegimeDataQuality;
  signals: RegimeSignal[];
  /** Time of the underlying data (not the response time). */
  asOf?: string | null;
  updatedAt: string;
}

interface RegimeContextValue {
  data: UnifiedRegime | null;
  loading: boolean;
  error: string | null;
  /** Set when the regime is unavailable (no market data and no account signals, or an error). */
  unavailableReason: string | null;
  refresh: () => void;
}

const RegimeContext = createContext<RegimeContextValue>({
  data: null,
  loading: true,
  error: null,
  unavailableReason: null,
  refresh: () => {},
});

/** Normalise an /api/regime body: anything without a regime is "unavailable", never a default. */
export function parseRegimeResponse(json: any): { data: UnifiedRegime | null; unavailableReason: string | null } {
  if (!json || json.available === false || typeof json.regime !== 'string' || !json.regime) {
    return { data: null, unavailableReason: typeof json?.reason === 'string' && json.reason ? json.reason : 'Regime unavailable.' };
  }
  return { data: json as UnifiedRegime, unavailableReason: null };
}

export function RegimeProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<UnifiedRegime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);

  const fetchRegime = useCallback(async () => {
    try {
      const res = await fetch('/api/regime');
      if (res.status === 401) {
        // Not logged in: no regime (never a made-up default).
        setData(null);
        setUnavailableReason('Sign in to see the market regime.');
        setError(null);
        return;
      }
      const json = await res.json().catch(() => null);
      const parsed = parseRegimeResponse(json);
      setData(parsed.data);
      setUnavailableReason(parsed.unavailableReason);
      setError(res.ok ? null : `Regime API returned ${res.status}`);
    } catch (err) {
      console.warn('Regime fetch failed:', err);
      setData(null);
      setUnavailableReason('Regime unavailable: the regime service could not be reached.');
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(fetchRegime, 30_000, { immediate: true });

  return (
    <RegimeContext.Provider value={{ data, loading, error, unavailableReason, refresh: fetchRegime }}>
      {children}
    </RegimeContext.Provider>
  );
}

/**
 * Hook to read the unified regime state from anywhere in the app.
 * 
 * Usage:
 *   const { data: regime, loading } = useRegime();
 *   if (regime?.permission === 'NO') { // block action }
 */
export function useRegime() {
  return useContext(RegimeContext);
}

/**
 * Convenience: get a displayable regime badge color
 */
export function regimeBadgeColor(regime: Regime | undefined): string {
  switch (regime) {
    case 'TREND_UP': return 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
    case 'TREND_DOWN': return 'text-rose-300 border-rose-500/40 bg-rose-500/10';
    case 'VOL_EXPANSION': return 'text-amber-300 border-amber-500/40 bg-amber-500/10';
    case 'RISK_OFF_STRESS': return 'text-red-300 border-red-500/40 bg-red-500/10';
    case 'VOL_CONTRACTION': return 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10';
    default: return 'text-slate-300 border-slate-500/40 bg-slate-500/10';
  }
}

/**
 * Convenience: human-readable regime label
 */
export function regimeLabel(regime: Regime | undefined): string {
  switch (regime) {
    case 'TREND_UP': return 'Trend Up';
    case 'TREND_DOWN': return 'Trend Down';
    case 'RANGE_NEUTRAL': return 'Range / Neutral';
    case 'VOL_EXPANSION': return 'Vol Expansion';
    case 'VOL_CONTRACTION': return 'Vol Contraction';
    case 'RISK_OFF_STRESS': return 'Risk-Off Stress';
    default: return 'Unknown';
  }
}
