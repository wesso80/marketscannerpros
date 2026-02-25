'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  OptionsContract,
  OptionsChainResponse,
  ExpirationMeta,
  StrikeGroup,
  BestStrike,
  IVMetrics,
  OIHeatmapRow,
} from '@/types/optionsTerminal';

/* ── Public hook state ───────────────────────────────────────────── */
export interface UseOptionsChainState {
  /* raw */
  contracts: OptionsContract[];
  expirations: ExpirationMeta[];
  underlyingPrice: number;
  provider: string;

  /* derived */
  strikeGroups: StrikeGroup[];
  bestStrikes: BestStrike[];
  ivMetrics: IVMetrics;
  oiHeatmap: OIHeatmapRow[];

  /* UI */
  loading: boolean;
  error: string | null;
  lastFetchedAt: number;

  /* actions */
  fetch: (symbol: string, expiration?: string) => void;
}

/* ── Helpers ──────────────────────────────────────────────────────── */
function buildStrikeGroups(contracts: OptionsContract[], spot: number): StrikeGroup[] {
  const map = new Map<number, { call?: OptionsContract; put?: OptionsContract }>();
  for (const c of contracts) {
    const entry = map.get(c.strike) || {};
    if (c.type === 'call') entry.call = c;
    else entry.put = c;
    map.set(c.strike, entry);
  }

  return Array.from(map.entries())
    .map(([strike, { call, put }]) => {
      const distFromSpotAbs = strike - spot;
      const distFromSpot = spot > 0 ? ((strike - spot) / spot) * 100 : 0;
      return {
        strike,
        distFromSpot,
        distFromSpotAbs,
        isAtm: Math.abs(distFromSpot) < 1.5,
        call,
        put,
      };
    })
    .sort((a, b) => a.strike - b.strike);
}

function buildBestStrikes(contracts: OptionsContract[], spot: number): BestStrike[] {
  const calls = contracts.filter((c) => c.type === 'call');
  const puts = contracts.filter((c) => c.type === 'put');

  const best: BestStrike[] = [];

  // ATM call — closest to 0.50 delta
  const atmCall = [...calls].sort((a, b) => Math.abs(a.delta - 0.5) - Math.abs(b.delta - 0.5))[0];
  if (atmCall) best.push({ label: 'ATM Call', strike: atmCall.strike, type: 'call', reason: `Δ ${atmCall.delta.toFixed(2)}`, contract: atmCall });

  // ATM put — closest to -0.50 delta
  const atmPut = [...puts].sort((a, b) => Math.abs(Math.abs(a.delta) - 0.5) - Math.abs(Math.abs(b.delta) - 0.5))[0];
  if (atmPut) best.push({ label: 'ATM Put', strike: atmPut.strike, type: 'put', reason: `Δ ${atmPut.delta.toFixed(2)}`, contract: atmPut });

  // 25Δ call
  const d25c = [...calls].sort((a, b) => Math.abs(a.delta - 0.25) - Math.abs(b.delta - 0.25))[0];
  if (d25c) best.push({ label: '25Δ Call', strike: d25c.strike, type: 'call', reason: `Δ ${d25c.delta.toFixed(2)}`, contract: d25c });

  // 25Δ put
  const d25p = [...puts].sort((a, b) => Math.abs(Math.abs(a.delta) - 0.25) - Math.abs(Math.abs(b.delta) - 0.25))[0];
  if (d25p) best.push({ label: '25Δ Put', strike: d25p.strike, type: 'put', reason: `Δ ${d25p.delta.toFixed(2)}`, contract: d25p });

  // Highest OI call
  const hiOICall = [...calls].sort((a, b) => b.openInterest - a.openInterest)[0];
  if (hiOICall) best.push({ label: 'Top OI Call', strike: hiOICall.strike, type: 'call', reason: `OI ${hiOICall.openInterest.toLocaleString()}`, contract: hiOICall });

  // Highest OI put
  const hiOIPut = [...puts].sort((a, b) => b.openInterest - a.openInterest)[0];
  if (hiOIPut) best.push({ label: 'Top OI Put', strike: hiOIPut.strike, type: 'put', reason: `OI ${hiOIPut.openInterest.toLocaleString()}`, contract: hiOIPut });

  // Highest volume call
  const hiVolCall = [...calls].sort((a, b) => b.volume - a.volume)[0];
  if (hiVolCall && hiVolCall !== hiOICall) best.push({ label: 'Top Vol Call', strike: hiVolCall.strike, type: 'call', reason: `Vol ${hiVolCall.volume.toLocaleString()}`, contract: hiVolCall });

  // Highest volume put
  const hiVolPut = [...puts].sort((a, b) => b.volume - a.volume)[0];
  if (hiVolPut && hiVolPut !== hiOIPut) best.push({ label: 'Top Vol Put', strike: hiVolPut.strike, type: 'put', reason: `Vol ${hiVolPut.volume.toLocaleString()}`, contract: hiVolPut });

  return best;
}

function buildIVMetrics(contracts: OptionsContract[], spot: number, dte: number): IVMetrics {
  const atmContracts = contracts.filter((c) => {
    const dist = Math.abs(c.strike - spot) / (spot || 1);
    return dist < 0.05 && c.iv > 0;
  });

  const avgIV = atmContracts.length
    ? atmContracts.reduce((s, c) => s + c.iv, 0) / atmContracts.length
    : contracts.filter((c) => c.iv > 0).reduce((s, c) => s + c.iv, 0) / (contracts.filter((c) => c.iv > 0).length || 1);

  const ivLevel: IVMetrics['ivLevel'] =
    avgIV > 0.8 ? 'extreme' : avgIV > 0.5 ? 'high' : avgIV > 0.2 ? 'normal' : 'low';

  const t = Math.max(dte, 1) / 365;
  const expectedMoveAbs = spot * avgIV * Math.sqrt(t);
  const expectedMovePct = avgIV * Math.sqrt(t) * 100;

  return { avgIV, ivLevel, expectedMoveAbs, expectedMovePct };
}

function buildOIHeatmap(groups: StrikeGroup[]): OIHeatmapRow[] {
  return groups
    .map((g) => ({
      strike: g.strike,
      callOI: g.call?.openInterest ?? 0,
      putOI: g.put?.openInterest ?? 0,
      totalOI: (g.call?.openInterest ?? 0) + (g.put?.openInterest ?? 0),
      callVol: g.call?.volume ?? 0,
      putVol: g.put?.volume ?? 0,
    }))
    .filter((r) => r.totalOI > 0);
}

/* ── Hook ─────────────────────────────────────────────────────────── */
export function useOptionsChain(): UseOptionsChainState {
  const [contracts, setContracts] = useState<OptionsContract[]>([]);
  const [expirations, setExpirations] = useState<ExpirationMeta[]>([]);
  const [underlyingPrice, setUnderlyingPrice] = useState(0);
  const [provider, setProvider] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const fetchChain = useCallback((symbol: string, expiration?: string) => {
    if (!symbol) return;

    // cancel in-flight
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ symbol });
    if (expiration) params.set('expiration', expiration);

    fetch(`/api/options-chain?${params.toString()}`, { signal: ctrl.signal })
      .then(async (res) => {
        const json: OptionsChainResponse = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        setContracts(json.contracts);
        setExpirations(json.expirations);
        setUnderlyingPrice(json.underlyingPrice);
        setProvider(json.provider);
        setLastFetchedAt(json.cachedAt || Date.now());
        setError(null);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setError(err?.message || 'Failed to load options chain');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
  }, []);

  // cleanup
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // derived data
  const strikeGroups = buildStrikeGroups(contracts, underlyingPrice);
  const bestStrikes = buildBestStrikes(contracts, underlyingPrice);
  const nearestDte = expirations.find((e) =>
    contracts.some((c) => c.expiration === e.date)
  )?.dte ?? 30;
  const ivMetrics = buildIVMetrics(contracts, underlyingPrice, nearestDte);
  const oiHeatmap = buildOIHeatmap(strikeGroups);

  return {
    contracts,
    expirations,
    underlyingPrice,
    provider,
    strikeGroups,
    bestStrikes,
    ivMetrics,
    oiHeatmap,
    loading,
    error,
    lastFetchedAt,
    fetch: fetchChain,
  };
}
