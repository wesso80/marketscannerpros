"use client";

/**
 * Admin Terminal — Data hooks
 * Replace mock-data imports with real API fetches.
 * All hooks read the admin secret from sessionStorage for auth.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { AdminSymbolIntelligence, ScannerHit, SystemHealth } from "./types";

/* ── Auth helper ── */
function getAdminHeaders(): HeadersInit {
  const secret =
    typeof window !== "undefined"
      ? sessionStorage.getItem("admin_secret") ?? ""
      : "";
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

/* ── Generic fetcher ── */
async function adminFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: getAdminHeaders() });
  if (!res.ok) {
    throw new Error(`Admin API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/* ── Scanner Feed ── */
type ScannerResponse = {
  hits: ScannerHit[];
  health: SystemHealth;
  meta: {
    symbolsScanned: number;
    errorsCount: number;
    errors: { symbol: string; error: string }[];
    timestamp: string;
  };
};

export function useScannerFeed(
  symbols?: string[],
  market = "CRYPTO",
  timeframe = "15m",
  pollInterval = 0, // 0 = no polling
) {
  const [hits, setHits] = useState<ScannerHit[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchScanner = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ market, timeframe });
      if (symbols?.length) params.set("symbols", symbols.join(","));
      const data = await adminFetch<ScannerResponse>(
        `/api/admin/scanner/live?${params}`,
      );
      setHits(data.hits);
      setHealth(data.health);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Scanner fetch failed");
    } finally {
      setLoading(false);
    }
  }, [symbols?.join(","), market, timeframe]);

  useEffect(() => {
    fetchScanner();
    if (pollInterval > 0) {
      const id = setInterval(fetchScanner, pollInterval);
      return () => clearInterval(id);
    }
  }, [fetchScanner, pollInterval]);

  return { hits, health, loading, error, refetch: fetchScanner };
}

/* ── Symbol Intelligence ── */
export function useSymbolIntelligence(
  symbol: string,
  market = "CRYPTO",
  timeframe = "15m",
) {
  const [data, setData] = useState<AdminSymbolIntelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSymbol = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ market, timeframe });
      const result = await adminFetch<AdminSymbolIntelligence>(
        `/api/admin/symbol/${encodeURIComponent(symbol)}?${params}`,
      );
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Symbol fetch failed");
    } finally {
      setLoading(false);
    }
  }, [symbol, market, timeframe]);

  useEffect(() => {
    fetchSymbol();
  }, [fetchSymbol]);

  return { data, loading, error, refetch: fetchSymbol };
}

/* ── System Health ── */
export function useSystemHealth(pollInterval = 30000) {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await adminFetch<SystemHealth>(
        "/api/admin/system/health",
      );
      setHealth(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Health fetch failed");
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    if (pollInterval > 0) {
      const id = setInterval(fetchHealth, pollInterval);
      return () => clearInterval(id);
    }
  }, [fetchHealth, pollInterval]);

  return { health, error, refetch: fetchHealth };
}

/* ── Risk State ── */
type RiskState = {
  openExposure: number;
  openRiskUsd?: number;
  exposureUsd?: number;
  equity?: number;
  dailyPnl?: number;
  dailyDrawdown: number;
  correlationRisk: number;
  maxPositions: number;
  activePositions: number;
  killSwitchActive: boolean;
  permission: string;
  sizeMultiplier: number;
  source?: string;
  lastUpdatedAt?: string | null;
  notes?: string[];
};

export function useRiskState(pollInterval = 30000) {
  const [risk, setRisk] = useState<RiskState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRisk = useCallback(async () => {
    try {
      const data = await adminFetch<RiskState>("/api/admin/risk/state");
      setRisk(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Risk fetch failed");
    }
  }, []);

  useEffect(() => {
    fetchRisk();
    if (pollInterval > 0) {
      const id = setInterval(fetchRisk, pollInterval);
      return () => clearInterval(id);
    }
  }, [fetchRisk, pollInterval]);

  return { risk, error, refetch: fetchRisk };
}
