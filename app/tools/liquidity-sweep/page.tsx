'use client';

import React, { useState, useCallback, useEffect } from 'react';
import ToolPageLayout from '@/components/tools/ToolPageLayout';
import Link from 'next/link';
import LockedPreview from '@/components/free/LockedPreview';
import { levelName, sweepPrice, sweepSession } from '@/components/liquidity-sweep/presentation';
import { useUserTier, canAccessScanner, canAccessUnlimitedScanning } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';


/* ── Types matching API response ── */

interface LiquidityLevel {
  level: number;
  label: string;
}

interface SweepResult {
  symbol: string;
  price: number;
  change24h: number;
  candleDate?: string;
  changeBasis?: string;
  sweepDetected: boolean;
  sweepPattern: { name: string; bias: string; confidence: number; reason: string } | null;
  nearestLevel: LiquidityLevel | null;
  proximityPct: number;
  levels: LiquidityLevel[];
  levelCount: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  setupType: 'active_sweep' | 'near_level' | 'at_level' | 'no_setup';
  atr: number;
  atrPct: number;
  keyLines: Array<{ name: string; level: number; reason: string }>;
}

interface ScanResponse {
  success: boolean;
  type: string;
  scanned: number;
  sweepCount: number;
  nearLevelCount: number;
  results: SweepResult[];
  duration: string;
}

/* ── Page ── */

const SWEEP_AUTO_KEY = 'msp.liquiditySweep.autoScan';
const SWEEP_CACHE_KEY = 'msp.liquiditySweep.lastResult';

export default function LiquiditySweepPage() {
  const { tier, isLoading } = useUserTier();
  const [scanType, setScanType] = useState<'equity' | 'crypto'>('equity');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<'all' | 'sweep' | 'near'>('all');

  const runScan = useCallback(async () => {
    if (isLoading || !canAccessUnlimitedScanning(tier)) return;
    setShowAll(false);
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch('/api/liquidity-sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: scanType }),
      });
      if (!res.ok) throw new Error(`Scan failed (${res.status})`);
      const json: ScanResponse = await res.json();
      if (!json.success) throw new Error('Scan returned unsuccessful');
      setData(json);
      try { sessionStorage.setItem(SWEEP_CACHE_KEY, JSON.stringify(json)); } catch { /* keep the on-screen result */ }
    } catch (err: any) {
      setError(err?.message || 'Scan failed');
    } finally {
      setLoading(false);
    }
  }, [scanType, isLoading, tier]);

  useEffect(() => {
    if (isLoading || !canAccessUnlimitedScanning(tier)) return;
    let cached: ScanResponse | null = null;
    try {
      const raw = sessionStorage.getItem(SWEEP_CACHE_KEY);
      cached = raw ? JSON.parse(raw) as ScanResponse : null;
    } catch {
      cached = null;
    }
    const matches = Boolean(cached?.success && cached.type === scanType && Array.isArray(cached.results));
    let already = false;
    try {
      already = sessionStorage.getItem(SWEEP_AUTO_KEY) === '1';
      if (!already) sessionStorage.setItem(SWEEP_AUTO_KEY, '1');
    } catch {
      if (matches && cached) { setData(cached); setError(null); }
      return;
    }
    if (matches && cached) {
      setData(cached);
      setError(null);
      return;
    }
    if (already) return;
    void runScan();
  }, [isLoading, tier, runScan, scanType]);

  if (!canAccessScanner(tier)) {
    return <UpgradeGate requiredTier="pro" feature="Liquidity Sweep Scanner" />;
  }

  const filtered = data?.results.filter(r => {
    if (filter === 'sweep') return r.sweepDetected;
    if (filter === 'near') return r.setupType === 'at_level' || r.setupType === 'near_level' || r.sweepDetected;
    return true;
  }) ?? [];

  if (isLoading) return <p role="status" className="p-4 text-sm text-slate-400">Loading access…</p>;
  if (!canAccessUnlimitedScanning(tier)) return <LockedPreview tool="Liquidity Sweep" />;

  const visible = showAll ? filtered : filtered.slice(0, 6);
  const verdict = loading ? 'Scanning completed candles…' : error ? 'Scan request failed' : data
    ? `${data.sweepCount} sweep observations across ${data.scanned} symbols` : 'No scan has run in this view';
  return (
    <ToolPageLayout
      identity={<header className="space-y-3">
        <h1 className="text-2xl font-semibold">Liquidity Sweep</h1>
        <p data-sweep-verdict role="status" className={`text-base ${error ? 'text-amber-300' : 'text-slate-200'}`}>{verdict}</p>
        <p className="text-sm text-slate-400">Completed-candle observations around recorded price levels.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={runScan} disabled={loading} className="min-h-10 rounded-lg border border-emerald-400/40 px-4 text-sm text-emerald-200 disabled:opacity-50">{loading ? 'Scanning…' : 'Run scan'}</button>
          <Link href="/tools/golden-egg" className="inline-flex min-h-10 items-center px-2 text-sm text-slate-300 underline">Open Symbol</Link>
          <Link href="/tools/terminal" className="inline-flex min-h-10 items-center px-2 text-sm text-slate-300 underline">Open Terminal</Link>
        </div>
      </header>}
      primary={<div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['equity', 'crypto'] as const).map(t => <button key={t} type="button" disabled={loading} aria-pressed={scanType === t}
            onClick={() => { if (t === scanType) return; setScanType(t); setData(null); setError(null); setShowAll(false); }}
            className={`min-h-10 rounded-lg border px-3 text-sm ${scanType === t ? 'border-slate-400 text-white' : 'border-slate-700 text-slate-400'}`}>
            {t === 'equity' ? 'Equity' : 'Crypto'}
          </button>)}
          <select aria-label="Observation filter" value={filter} onChange={e => { setFilter(e.target.value as typeof filter); setShowAll(false); }} className="min-h-10 max-w-full rounded-lg border border-slate-700 bg-slate-950 px-2 text-sm">
            <option value="all">All observations</option><option value="sweep">Sweeps only</option><option value="near">Sweeps and nearby levels</option>
          </select>
          {data && <span className="text-xs text-slate-400">{data.scanned} scanned · {filtered.length} matching</span>}
        </div>
        {error && <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">{error}. {error.includes('(429)') ? 'Wait before trying again.' : /\((401|403)\)/.test(error) ? 'Check your sign-in and access.' : 'Run again to retry.'}</p>}
        {data && <p data-sweep-source className="text-xs text-slate-400">{sweepSession(data.results.map(r => r.candleDate))} · Source: {data.type === 'crypto' ? 'CoinGecko' : 'Alpha Vantage'} completed daily candles</p>}
        {!loading && !data && !error && <p className="rounded-lg border border-amber-400/30 p-3 text-sm text-amber-200">No recorded result in this view. Use Run scan to request observations.</p>}
        {data && filtered.length > 0 && <>
          <p data-sweep-legend className="text-xs text-slate-400"><span className="text-slate-200">● Active sweep</span> means a recorded candle crossed a level. It is a price-pattern observation.</p>
          <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {visible.map(r => <article data-sweep-card key={r.symbol} className="min-w-0 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{r.symbol}{r.sweepDetected && <span className="ml-2 text-xs text-slate-400" aria-label="Sweep observed">●</span>}</h2>
                <span className="text-sm">{sweepPrice(r.price)} <span className="text-xs text-slate-400">{Number.isFinite(r.change24h) ? `${r.change24h >= 0 ? '+' : ''}${r.change24h.toFixed(1)}%` : ''}</span></span>
              </div>
              {r.nearestLevel && <p className="mt-1 text-xs text-slate-300">{levelName(r.nearestLevel.label)} · {sweepPrice(r.nearestLevel.level)}{Number.isFinite(r.proximityPct) ? ` · ${r.proximityPct.toFixed(1)}% away` : ''}</p>}
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>{r.sweepDetected ? r.direction === 'bullish' ? 'Swept below' : r.direction === 'bearish' ? 'Swept above' : 'Level crossed' : r.nearestLevel ? r.nearestLevel.level > r.price ? 'Level above' : r.nearestLevel.level < r.price ? 'Level below' : 'At level' : 'No nearby level'}</span>
                <details><summary className="cursor-pointer py-1">Level details</summary>
                  <div className="space-y-1 py-2">{r.levels.map((lev, i) => <p key={i}>{levelName(lev.label)} · {sweepPrice(lev.level)}</p>)}
                    {Number.isFinite(r.atrPct) && <p>Measured range: {r.atrPct.toFixed(1)}%</p>}
                    {Number.isFinite(r.confidence) && <p>Pattern reading: {r.confidence}</p>}
                    <p>{r.levelCount} recorded levels</p>
                  </div>
                </details>
              </div>
            </article>)}
          </div>
          {filtered.length > 6 && <button className="min-h-10 rounded-lg border border-slate-700 px-4 text-sm" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show top 6' : `Show all (${filtered.length})`}</button>}
        </>}
        {!loading && data && filtered.length === 0 && <p className="rounded-lg border border-slate-700 p-3 text-sm text-slate-400">No observations match this filter.</p>}
      </div>}
      footer={<div style={{fontSize:'11px',color:'var(--msp-text-faint)',textAlign:'center',padding:'12px 0'}}>
        Liquidity sweep detection is for educational purposes only. Sweeps are technical price-pattern observations and do not predict future direction or provide buy or sell instructions. Not financial advice.
        Sweep observations describe possible stop-hunt behavior but do not guarantee reversal.
      </div>}
    />
  );
}
