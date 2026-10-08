'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { boundedJsonFetch } from '@/lib/boundedFetch';
import { symbolHref } from '@/lib/market/links';
import { matchesFindSymbolFilters, type PublicScannerObservation } from '@/lib/scanner/publicObservations';

type Packet = { contract: string; observations: PublicScannerObservation[]; notice?: string | null; error?: string; coverage?: { attempted: number | null; universe: number | null; unavailable: number | null } };
const display = (n: number | null) => n === null ? 'Not available' : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function FindSymbols() {
  const [market, setMarket] = useState<'equity' | 'crypto'>('equity');
  const [timeframe, setTimeframe] = useState('daily');
  const [packet, setPacket] = useState<Packet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rsiMax, setRsiMax] = useState('');
  const [adxMin, setAdxMin] = useState('');
  const [above, setAbove] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function scan() {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(null); setPacket(null);
    try {
      const { response, body } = await boundedJsonFetch<Packet>('/api/scanner/run', {
        method: 'POST', credentials: 'include', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: market, timeframe, limit: 100 }),
      }, 60_000);
      if (!response.ok || body.contract !== 'public-scanner-observations-v1') throw new Error(body.error || 'Observations are unavailable.');
      if (!controller.signal.aborted) setPacket(body);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Observations are unavailable.');
    } finally { pending.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  const valid = (s: string) => s === '' || (Number.isFinite(Number(s)) && Number(s) >= 0 && Number(s) <= 100);
  const validFilters = valid(rsiMax) && valid(adxMin);
  const rows = validFilters ? (packet?.observations ?? []).filter(row => matchesFindSymbolFilters(row, {
    ...(rsiMax !== '' ? { rsiMax: Number(rsiMax) } : {}), ...(adxMin !== '' ? { adxMin: Number(adxMin) } : {}), ...(above ? { aboveEma200: true } : {}),
  })) : [];
  return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
    <header><p className="text-sm text-teal-300">Symbol research</p><h1 className="mt-2 text-3xl font-semibold">Find symbols</h1><p className="mt-3 text-slate-400">Explore measured conditions, then open a Symbol report for the evidence and its explanation.</p></header>
    <section aria-label="Scan controls" className="flex flex-wrap items-end gap-4 rounded-2xl border border-white/10 bg-slate-900/50 p-5">
      <label className="grid gap-2">Market<select className="rounded bg-slate-800 p-3" disabled={busy} value={market} onChange={e => { setMarket(e.target.value as 'equity' | 'crypto'); setPacket(null); }}><option value="equity">Equities</option><option value="crypto">Crypto</option></select></label>
      <label className="grid gap-2">Requested timeframe<select className="rounded bg-slate-800 p-3" disabled={busy} value={timeframe} onChange={e => { setTimeframe(e.target.value); setPacket(null); }}>{['15m', '1h', 'daily', 'weekly'].map(t => <option key={t}>{t}</option>)}</select></label>
      <button onClick={() => void scan()} disabled={busy} className="min-h-12 rounded-lg bg-teal-300 px-6 font-semibold text-slate-950 disabled:opacity-50">{busy ? 'Collecting observations…' : 'Find symbols'}</button>
      <p className="w-full text-sm text-slate-400">Runs only when requested and uses your scan allowance. Filters below apply to the loaded sample without another scan.</p>
    </section>
    <section aria-label="Factual filters" className="flex flex-wrap items-end gap-5">
      <label className="grid gap-2">RSI at most<input className="w-28 rounded bg-slate-800 p-3" type="number" min="0" max="100" value={rsiMax} onChange={e => setRsiMax(e.target.value)} placeholder="Any" /></label>
      <label className="grid gap-2">ADX at least<input className="w-28 rounded bg-slate-800 p-3" type="number" min="0" max="100" value={adxMin} onChange={e => setAdxMin(e.target.value)} placeholder="Any" /></label>
      <label className="py-3"><input type="checkbox" checked={above} onChange={e => setAbove(e.target.checked)} /> Price above EMA200</label>
      <button className="min-h-11 underline" onClick={() => { setRsiMax(''); setAdxMin(''); setAbove(false); }}>Clear filters</button>
    </section>
    {!validFilters && <p role="alert">RSI and ADX filters must be between 0 and 100.</p>}
    {error && <p role="alert">{error}</p>}
    {packet?.notice && <p role="status" className="rounded border border-amber-400 p-4">{packet.notice}</p>}
    {packet && <p className="text-sm text-slate-400">{rows.length} of {packet.observations.length} loaded observations match. Symbol A–Z; no composite ranking. Attempted {packet.coverage?.attempted ?? 'unknown'} of {packet.coverage?.universe ?? 'unknown'} universe symbols; unavailable {packet.coverage?.unavailable ?? 'unknown'}. This is a sample, not a whole-market screen.</p>}
    <div aria-live="polite" className="grid gap-4 md:grid-cols-2">
      {rows.map(row => <article key={`${row.assetClass}:${row.symbol}`} className="min-w-0 rounded-2xl border border-white/10 bg-slate-900/50 p-5">
        <Link className="text-xl font-semibold text-teal-300 underline" href={symbolHref(row.symbol, row.assetClass, row.requestedTimeframe ?? undefined)}>{row.symbol}</Link>
        <dl className="my-4 grid grid-cols-2 gap-4 sm:grid-cols-4">{[['Price', row.price.value], ['RSI', row.indicators.rsi.value], ['ADX', row.indicators.adx.value], ['EMA200', row.indicators.ema200.value]].map(([label, n]) => <div key={String(label)}><dt className="text-xs text-slate-400">{label}</dt><dd>{display(n as number | null)}</dd></div>)}</dl>
        <p className="break-words text-xs text-slate-400">Source: {row.basis.source ?? 'Not available'} · Actual bars: {row.barInterval ?? 'Not available'} · Last completed bar: {row.basis.lastCompletedBarAt ?? 'Not available'} · History: {row.basis.historyBars ?? 'unknown'} bars.</p>
        <p className="mt-2 text-xs text-slate-400">{row.priceTimeNote} Missing inputs never satisfy a filter.</p>
        {row.basis.intervalMismatch && <p className="mt-2 text-sm text-amber-300">Actual bars differ from the requested timeframe.</p>}
        {row.basis.priceDiscontinuity && <p className="mt-2 text-sm text-amber-300">A price discontinuity was reported; indicators may be unreliable.</p>}
      </article>)}
    </div>
    {!busy && !packet && !error && <p>Choose a market and request observations to begin.</p>}
    {packet && rows.length === 0 && validFilters && <p>No loaded observations match these conditions. Missing measurements are excluded when required by a filter.</p>}
  </main>;
}
