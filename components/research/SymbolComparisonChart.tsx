'use client';
import { useEffect, useRef, useState } from 'react';
import type { SymbolComparison } from '@/lib/research/symbolComparison';
const COLORS = ['#5eead4', '#fbbf24', '#a5b4fc'];
const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
export default function SymbolComparisonChart({ symbol, type }: { symbol: string; type: 'equity' | 'crypto' }) {
  const [days, setDays] = useState(90), [cursor, setCursor] = useState<number | null>(null);
  const key = `${symbol}:${type}:${days}`;
  const [result, setResult] = useState<{ key: string; data?: SymbolComparison; error?: string } | null>(null);
  const host = useRef<HTMLDivElement>(null), [width, setWidth] = useState(500);
  useEffect(() => {
    const abort = new AbortController(); setCursor(null);
    fetch(`/api/symbol-comparison?${new URLSearchParams({ symbol, type, days: String(days) })}`, { signal: abort.signal })
      .then(async r => { const body = await r.json(); if (!r.ok) throw Error(body.error || 'Comparison unavailable'); if (body.symbol !== symbol || !Array.isArray(body.series) || !Array.isArray(body.dates) || !Array.isArray(body.missing)) throw Error('Matching comparison data unavailable'); if (!abort.signal.aborted) setResult({ key, data: body }); })
      .catch(e => { if (!abort.signal.aborted) setResult({ key, error: e instanceof Error ? e.message : 'Comparison unavailable' }); });
    return () => abort.abort();
  }, [key, symbol, type, days]);
  useEffect(() => {
    if (!host.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(250, entry.contentRect.width)));
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  const data = result?.key === key ? result.data : undefined, error = result?.key === key ? result.error : undefined;
  const series = data?.series || [], dates = data?.dates || [], index = Math.min(cursor ?? dates.length - 1, dates.length - 1);
  const all = series.flatMap(s => s.values), low = Math.min(0, ...all), high = Math.max(0, ...all), span = Math.max(1, high - low);
  const min = low - span * .12, max = high + span * .12, left = 48, right = width - 12, top = 20, bottom = 244;
  const x = (i: number) => left + i / Math.max(1, dates.length - 1) * (right - left), y = (v: number) => bottom - (v - min) / (max - min) * (bottom - top);
  return <section className="relative overflow-hidden rounded-2xl border border-teal-300/20 bg-[linear-gradient(135deg,#132a34_0%,#101b2d_48%,#111726_100%)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:p-6" aria-label="Benchmark comparison">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-200">Market perspective</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{symbol} in context<span className="text-teal-300">.</span></h2><p className="mt-2 max-w-xl text-sm text-slate-300">{type === 'equity' ? 'Against SPY and QQQ. Shared dates, one starting point.' : 'Against Bitcoin. A shared starting point for the price paths.'}</p></div>
      <div className="flex rounded-xl border border-white/10 bg-black/20 p-1" aria-label="Comparison period">{[[30, '1M'], [90, '3M'], [365, '1Y']].map(([value, label]) => <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(Number(value))} className={`min-h-11 min-w-12 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 ${days === value ? 'bg-teal-200 text-slate-950' : 'text-slate-300 hover:bg-white/10'}`}>{label}</button>)}</div>
    </div>
    <div className="mt-6 grid gap-2 sm:grid-cols-3">{series.map((s, i) => <div key={s.symbol} className="rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3"><div className="flex items-center justify-between gap-2 text-xs text-slate-300"><span><span aria-hidden="true" style={{ color: COLORS[i] }}>● </span>{s.symbol}</span><span>{s.symbol === symbol ? 'Selected symbol' : 'Benchmark'}</span></div><p className="mt-2 text-2xl font-semibold tabular-nums text-white">{pct(s.values[index] ?? s.changePct)}</p><p className="mt-1 text-[11px] text-slate-400">{s.symbol === symbol ? `Price change since ${data?.from}` : s.correlation == null ? 'Return correlation unavailable' : `Return correlation ${s.correlation.toFixed(2)} · ${data?.returnPairs} pairs`}</p></div>)}</div>
    <div ref={host} className="mt-4 min-w-0">
      {!data && !error ? <div role="status" className="flex h-64 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-slate-400">Loading matched daily observations…</div> : error || !data || !series.length ? <p role="status" className="rounded-xl border border-dashed border-white/10 p-8 text-sm text-slate-300">{error || 'Comparison unavailable: matching daily history is missing.'}</p> : <>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-400"><span>Price change · common start = 0%</span><span className="tabular-nums">{dates[index]}</span></div>
        <svg role="img" aria-label={`${symbol} and benchmarks: percentage price change from ${data.from} to ${data.to}. Use the date slider to inspect each observation.`} viewBox={`0 0 ${width} 278`} width="100%" height="278" onPointerMove={e => { const box = e.currentTarget.getBoundingClientRect(); setCursor(Math.max(0, Math.min(dates.length - 1, Math.round(((e.clientX - box.left) * width / box.width - left) / (right - left) * (dates.length - 1))))); }} onPointerLeave={() => setCursor(null)}>
          {[0, 1, 2, 3, 4].map(t => { const v = min + t / 4 * (max - min); return <g key={t}><line x1={left} x2={right} y1={y(v)} y2={y(v)} stroke="#94a3b8" strokeOpacity=".12"/><text x={left - 8} y={y(v) + 4} textAnchor="end" fill="#94a3b8" fontSize="10">{v.toFixed(1)}%</text></g>; })}
          <line x1={left} x2={right} y1={y(0)} y2={y(0)} stroke="#94a3b8" strokeOpacity=".5" strokeDasharray="3 5"/>
          {series.map((s, i) => <polyline key={s.symbol} points={s.values.map((v, n) => `${x(n).toFixed(2)},${y(v).toFixed(2)}`).join(' ')} fill="none" stroke={COLORS[i]} strokeWidth={i === 0 ? 2.8 : 1.8} strokeDasharray={i === 2 ? '6 3' : undefined} vectorEffect="non-scaling-stroke"/>)}
          <line x1={x(index)} x2={x(index)} y1={top} y2={bottom} stroke="#cbd5e1" strokeOpacity=".35" strokeDasharray="3 4"/>
          {series.map((s, i) => <circle key={s.symbol} cx={x(index)} cy={y(s.values[index])} r="3.5" fill={COLORS[i]} stroke="#111726" strokeWidth="2"/>)}
          <text x={left} y="271" fill="#94a3b8" fontSize="10">{data.from}</text><text x={right} y="271" textAnchor="end" fill="#94a3b8" fontSize="10">{data.to}</text>
        </svg>
        <input aria-label="Inspect comparison date" type="range" min="0" max={dates.length - 1} value={index} onChange={e => setCursor(Number(e.target.value))} className="h-6 w-full accent-teal-300"/>
        <details className="mt-3 text-xs leading-5 text-slate-400"><summary className="cursor-pointer text-slate-300">Data and calculation · {dates.length} matching closes · {days}-day request</summary><p className="mt-2">{data.basis} Observations are evenly spaced on the chart. Actual coverage: {data.from} to {data.to}.</p>{series.map(s => <p key={s.symbol}>{s.symbol}: {s.source}</p>)}</details>
      </>}
    </div>
    {data?.missing.map(message => <p key={message} className="mt-2 text-xs text-amber-200">{message}</p>)}
  </section>;
}
