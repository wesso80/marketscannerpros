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
      ? sessionStorage.getItem("admin_secret")
      : null;
  return secret
    ? { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

/* ── Generic fetcher ── */
async function adminFetch<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { headers: getAdminHeaders(), credentials: "include", signal });
  if (!res.ok) {
    throw new Error(`Admin API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/** Drop any row tagged with a different saved-scan market than the one requested (belt and braces). */
export function filterHitsForMarket(hits: ScannerHit[], market?: string): ScannerHit[] {
  if (!market) return hits;
  const want = market.toUpperCase();
  return hits.filter((h) => !h.market || String(h.market).toUpperCase() === want);
}

/* ── Scanner Feed ── */
type ScannerResponse = {
  hits: ScannerHit[];
  health: SystemHealth;
  /** Saved-scan age/status (the feed serves the shared saved admin scan). */
  savedScan?: import("@/components/admin/SavedScanStatus").SavedScanStatusData;
  meta: {
    symbolsScanned: number;
    errorsCount: number;
    errors: { symbol: string; error: string }[];
    timestamp: string;
  };
};

/** `market` omitted → the server's admin default (EQUITIES while crypto market data is off). */
export function useScannerFeed(
  symbols?: string[],
  market?: string,
  timeframe = "15m",
  pollInterval = 0, // 0 = no polling
) {
  const [hits, setHits] = useState<ScannerHit[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [savedScan, setSavedScan] = useState<ScannerResponse["savedScan"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every request gets a sequence number; only the latest one may write state. The page opens on
  // EQUITIES (~190 symbols, slower) and is switched to CRYPTO, so without this guard the older
  // equities response could land last and overwrite the crypto list (the "crypto shows equities" leak).
  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const symbolsKey = symbols?.join(",") ?? "";

  const fetchScanner = useCallback(async () => {
    const seq = ++requestSeq.current;
    abortRef.current?.abort();
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ timeframe });
      if (market) params.set("market", market);
      if (symbolsKey) params.set("symbols", symbolsKey);
      const data = await adminFetch<ScannerResponse>(
        `/api/admin/scanner/live?${params}`,
        controller?.signal,
      );
      if (seq !== requestSeq.current) return;
      setHits(filterHitsForMarket(data.hits ?? [], market));
      setHealth(data.health);
      setSavedScan(data.savedScan ?? null);
    } catch (err: unknown) {
      if (seq !== requestSeq.current) return;
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Scanner fetch failed");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [symbolsKey, market, timeframe]);

  // Switching market/timeframe must not keep showing the previous market's rows while loading.
  useEffect(() => {
    setHits([]);
    setSavedScan(null);
  }, [market, timeframe]);

  useEffect(() => {
    fetchScanner();
    if (pollInterval > 0) {
      const id = setInterval(fetchScanner, pollInterval);
      return () => {
        clearInterval(id);
        abortRef.current?.abort();
      };
    }
    return () => abortRef.current?.abort();
  }, [fetchScanner, pollInterval]);

  return { hits, health, savedScan, loading, error, refetch: fetchScanner };
}

/* ── Symbol Intelligence ── */
/** `market` omitted → the server infers it from the symbol (else the admin default). */
export function useSymbolIntelligence(
  symbol: string,
  market?: string,
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
      const params = new URLSearchParams({ timeframe });
      if (market) params.set("market", market);
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
