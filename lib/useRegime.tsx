'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Regime } from '@/lib/risk-governor-hard';

type RiskLevel = 'low' | 'moderate' | 'elevated' | 'extreme';
type Permission = 'YES' | 'CONDITIONAL' | 'NO';
type Sizing = 'full' | 'reduced' | 'probe' | 'none';

export interface UnifiedRegime {
  regime: Regime;
  riskLevel: RiskLevel;
  permission: Permission;
  sizing: Sizing;
  signals: Array<{ source: string; regime: string; weight: number; stale: boolean }>;
  updatedAt: string;
}

interface RegimeContextValue {
  data: UnifiedRegime | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const DEFAULT_REGIME: UnifiedRegime = {
  regime: 'RANGE_NEUTRAL',
  riskLevel: 'moderate',
  permission: 'CONDITIONAL',
  sizing: 'reduced',
  signals: [],
  updatedAt: new Date().toISOString(),
};

const RegimeContext = createContext<RegimeContextValue>({
  data: null,
  loading: true,
  error: null,
  refresh: () => {},
});

export function RegimeProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<UnifiedRegime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRegime = useCallback(async () => {
    try {
      const res = await fetch('/api/regime');
      if (!res.ok) {
        if (res.status === 401) {
          // Not logged in — use defaults
          setData(DEFAULT_REGIME);
          setLoading(false);
          return;
        }
        throw new Error(`Regime API returned ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      console.warn('Regime fetch failed, using defaults:', err);
      setData(DEFAULT_REGIME);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRegime();
    // Poll every 30 seconds for regime updates
    const interval = setInterval(fetchRegime, 30_000);
    return () => clearInterval(interval);
  }, [fetchRegime]);

  return (
    <RegimeContext.Provider value={{ data, loading, error, refresh: fetchRegime }}>
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
