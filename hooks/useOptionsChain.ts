'use client';

import { atmStrike } from '@/lib/options/atmStrike';
import { selectOptionsExpiry } from '@/lib/options/expiry';
import { atmImpliedVol, quoteDaysToExpiry } from '@/lib/goldenEgg/optionsChain';
import { hasTwoSidedQuote } from '@/lib/options/quoteQuality';
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
  spotObservation: OptionsChainResponse['spotObservation'];
  provider: string;
  /** realtime | previous_session | marks_only (see /api/options-chain). */
  quoteBasis: string;
  /** Session date the quotes belong to (YYYY-MM-DD) or ''. */
  asOfDate: string;
  sourceLabel: string;
  providerIssues: string[];

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
export function buildStrikeGroups(contracts: OptionsContract[], spot: number): StrikeGroup[] {
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
        isAtm: strike === atmStrike(contracts.map(c=>c.strike), spot),
        call,
        put,
      };
    })
    .sort((a, b) => a.strike - b.strike);
}

export function buildBestStrikes(contracts: OptionsContract[], spot: number, expectedMove = 0): BestStrike[] {
  const nearest = atmStrike(contracts.map(c=>c.strike),spot);
  contracts = oiContextContracts(contracts,spot,expectedMove);
  const calls = contracts.filter((c) => c.type === 'call');
  const puts = contracts.filter((c) => c.type === 'put');

  const best: BestStrike[] = [];

  // ATM call — closest to 0.50 delta
  const atmCall = calls.find(c=>c.strike===nearest);
  if (atmCall) best.push({ label: 'ATM Call', strike: atmCall.strike, type: 'call', reason: `Δ ${atmCall.delta.toFixed(2)}`, contract: atmCall });

  // ATM put — closest to -0.50 delta
  const atmPut = puts.find(c=>c.strike===nearest);
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

export function buildIVMetrics(contracts: OptionsContract[], spot: number, expiry: string, asOfDate: string): IVMetrics {
  const avgIV = atmImpliedVol(contracts.map(c => ({strike:c.strike, implied_volatility:c.iv})), spot) ?? 0;
  const days = quoteDaysToExpiry(expiry, asOfDate);
  const expectedMoveAbs = days != null ? spot * avgIV * Math.sqrt(days / 365) : 0;
  const nearest = atmStrike(contracts.map(c=>c.strike),spot);
  const call = contracts.find(c=>c.strike===nearest && c.type==='call' && hasTwoSidedQuote(c));
  const put = contracts.find(c=>c.strike===nearest && c.type==='put' && hasTwoSidedQuote(c));
  const atmStraddleMid = call && put ? (call.bid+call.ask+put.bid+put.ask)/2 : null;
  return {avgIV,ivLevel:'unavailable',expectedMoveAbs,expectedMovePct:spot>0?expectedMoveAbs/spot*100:0,atmStraddleMid};
}

export function buildOIHeatmap(groups: StrikeGroup[]): OIHeatmapRow[] {
  return groups
    .map(g => ({...g, call:g.call && hasTwoSidedQuote(g.call)?g.call:undefined, put:g.put && hasTwoSidedQuote(g.put)?g.put:undefined}))
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

/** Shared OI/notable universe. No expected move available => explicitly labelled 10% spot band. */
export function oiContextContracts(contracts:OptionsContract[],spot:number,expectedMove:number) {
  const width=expectedMove>0?3*expectedMove:spot*.1;
  return contracts.filter(c=>hasTwoSidedQuote(c)&&spot>0&&Math.abs(c.strike-spot)<=width);
}

/* ── Hook ─────────────────────────────────────────────────────────── */
export function useOptionsChain(): UseOptionsChainState {
  const [contracts, setContracts] = useState<OptionsContract[]>([]);
  const [expirations, setExpirations] = useState<ExpirationMeta[]>([]);
  const [underlyingPrice, setUnderlyingPrice] = useState(0);
  const [spotObservation, setSpotObservation] = useState<OptionsChainResponse['spotObservation']>(null);
  const [provider, setProvider] = useState('');
  const [quoteBasis, setQuoteBasis] = useState('');
  const [asOfDate, setAsOfDate] = useState('');
  const [providerIssues, setProviderIssues] = useState<string[]>([]);
  const [sourceLabel, setSourceLabel] = useState('');
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
    setContracts([]);
    setUnderlyingPrice(0);
    setSpotObservation(null);
    setExpirations([]);
    setProvider('');
    setQuoteBasis('');
    setAsOfDate('');
    setSourceLabel('');
    setProviderIssues([]);
    setLastFetchedAt(0);
    setError(null);

    const params = new URLSearchParams({ symbol });
    if (expiration) params.set('expiration', expiration);

    fetch(`/api/options-chain?${params.toString()}`, { signal: ctrl.signal })
      .then(async (res) => {
        const json: OptionsChainResponse = await res.json();
        if (ctrl.signal.aborted) return;
        setProviderIssues(json.providerIssues ?? []);
        if (!res.ok || !json.success) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        if (ctrl.signal.aborted) return;
        const dates = [...new Set(json.contracts.map(c => c.expiration))].sort();
        const chosen = selectOptionsExpiry(dates, expiration);
        setContracts(json.contracts.filter(c => c.expiration === chosen));
        setExpirations(json.expirations);
        setUnderlyingPrice(json.underlyingPrice);
        setSpotObservation(json.spotObservation ?? null);
        setProvider(json.provider);
        setQuoteBasis(json.quoteBasis ?? '');
        setAsOfDate(json.asOfDate ?? '');
        setSourceLabel(json.sourceLabel ?? '');
        setLastFetchedAt(json.cachedAt || Date.now());
        setError(null);
      })
      .catch((err) => {
        if (ctrl.signal.aborted || err?.name === 'AbortError') return;
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

  const ivMetrics = buildIVMetrics(contracts, underlyingPrice, contracts[0]?.expiration ?? '', asOfDate);
  const oiContracts = oiContextContracts(contracts, underlyingPrice, ivMetrics.expectedMoveAbs);
  const bestStrikes = buildBestStrikes(contracts, underlyingPrice, ivMetrics.expectedMoveAbs);
  const oiHeatmap = buildOIHeatmap(buildStrikeGroups(oiContracts, underlyingPrice));

  return {
    contracts,
    expirations,
    underlyingPrice,
    spotObservation,
    provider,
    quoteBasis,
    asOfDate,
    sourceLabel,
    providerIssues,
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
