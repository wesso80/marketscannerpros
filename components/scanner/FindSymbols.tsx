'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import studio from '@/components/public-design/FindSymbolsStudio.module.css';
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
  return <main className={studio.page}>
    <header className={studio.hero}><div><p className={studio.kicker}>SYMBOL RESEARCH / DISCOVERY</p><h1>Find symbols</h1><p className={studio.lead}>Start with a condition.<br />Follow the evidence.</p></div><p className={studio.introduction}>Explore measured conditions, then open a Symbol report for the evidence and its explanation. Each observation keeps its source, date and limitations alongside it.</p></header>
    <section aria-label="Scan controls" className={studio.controls}>
      <label className={studio.field}>Market<select className={studio.input} disabled={busy} value={market} onChange={e => { setMarket(e.target.value as 'equity' | 'crypto'); setPacket(null); }}><option value="equity">Equities</option><option value="crypto">Crypto</option></select></label>
      <label className={studio.field}>Requested timeframe<select className={studio.input} disabled={busy} value={timeframe} onChange={e => { setTimeframe(e.target.value); setPacket(null); }}>{['15m', '1h', 'daily', 'weekly'].map(t => <option key={t}>{t}</option>)}</select></label>
      <button onClick={() => void scan()} disabled={busy} className={studio.primary}>{busy ? 'Collecting observations…' : 'Find symbols'}</button>
      <p className={studio.controlNote}>Runs only when requested and uses your scan allowance. Filters below apply to the loaded sample without another scan.</p>
    </section>
    <section aria-label="Factual filters" className={studio.filters}>
      <label className={studio.field}>RSI at most<input className={studio.input} type="number" min="0" max="100" value={rsiMax} onChange={e => setRsiMax(e.target.value)} placeholder="Any" /></label>
      <label className={studio.field}>ADX at least<input className={studio.input} type="number" min="0" max="100" value={adxMin} onChange={e => setAdxMin(e.target.value)} placeholder="Any" /></label>
      <label className={studio.checkbox}><input type="checkbox" checked={above} onChange={e => setAbove(e.target.checked)} /> Price above EMA200</label>
      <button className={studio.clear} onClick={() => { setRsiMax(''); setAdxMin(''); setAbove(false); }}>Clear filters</button>
    </section>
    {!validFilters && <p role="alert">RSI and ADX filters must be between 0 and 100.</p>}
    {error && <p role="alert">{error}</p>}
    {packet?.notice && <p role="status" className={studio.notice}>{packet.notice}</p>}
    {packet && <p className={studio.coverage}>{rows.length} of {packet.observations.length} loaded observations match. Symbol A–Z; no composite ranking. Attempted {packet.coverage?.attempted ?? 'unknown'} of {packet.coverage?.universe ?? 'unknown'} universe symbols; unavailable {packet.coverage?.unavailable ?? 'unknown'}. This is a sample, not a whole-market screen.</p>}
    <div className={studio.sectionHeading}><h2>Measured observations</h2><span>{packet ? `${rows.length} symbols · A–Z` : "Your research starts here"}</span></div>
    <div aria-live="polite" className={studio.results}>
      {rows.map(row => <article key={`${row.assetClass}:${row.symbol}`} className={studio.row}>
        <div className={studio.rowData}><Link className={studio.symbol} href={symbolHref(row.symbol, row.assetClass, row.requestedTimeframe ?? undefined)}>{row.symbol}</Link>
        <dl className={studio.metrics}>{[['Price', row.price.value], ['RSI', row.indicators.rsi.value], ['ADX', row.indicators.adx.value], ['EMA200', row.indicators.ema200.value]].map(([label, n]) => <div key={String(label)}><dt className="text-xs text-slate-400">{label}</dt><dd>{display(n as number | null)}</dd></div>)}</dl></div>
        <p className={studio.source}>Source: {row.basis.source ?? 'Not available'} · Actual bars: {row.barInterval ?? 'Not available'} · Last completed bar: {row.basis.lastCompletedBarAt ?? 'Not available'} · History: {row.basis.historyBars ?? 'unknown'} bars.</p>
        <p className={studio.note}>{row.priceTimeNote} Missing inputs never satisfy a filter.</p>
        {row.basis.intervalMismatch && <p className={studio.notice}>Actual bars differ from the requested timeframe.</p>}
        {row.basis.priceDiscontinuity && <p className={studio.notice}>A price discontinuity was reported; indicators may be unreliable.</p>}
      </article>)}
    </div>
    {!busy && !packet && !error && <div className={studio.empty}><span aria-hidden="true">01 — 02 — 03</span><p>Choose a market. Set your conditions. Open the evidence.</p><small>Nothing runs until you request observations.</small></div>}
    {packet && rows.length === 0 && validFilters && <p>No loaded observations match these conditions. Missing measurements are excluded when required by a filter.</p>}
  </main>;
}
