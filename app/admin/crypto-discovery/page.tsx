'use client';
import { useEffect, useState } from 'react';
import type { DiscoveryRow, VenueEvidence } from '@/lib/admin/cryptoDiscovery';
import type { MomentumReview } from '@/lib/admin/cryptoMomentum';
type Snapshot = { startedAt:string; finishedAt:string; requests:number; partial:boolean; uniqueCoins:number; missingMarketIds?:string[]; failedMarketBatches?:number[];
  coverage:{exchange:string; pages:number; status:string; pairsSeen:number}[];
  rows:(DiscoveryRow & {venues:VenueEvidence[]})[] };
const pct = (n:number|null) => n === null ? 'Unavailable' : `${n.toFixed(2)}%`;
export default function CryptoDiscoveryPage() {
  const [data,setData] = useState<Snapshot|null>(null), [error,setError] = useState('');
  const [busy,setBusy] = useState(false), [query,setQuery] = useState('');
  const [now,setNow] = useState(Date.now());
  const [review,setReview] = useState<MomentumReview|null>(null);
  const [analyzing,setAnalyzing] = useState('');
  async function analyze(coinId:string) {
    setAnalyzing(coinId);setError('');setReview(null);
    try {
      const res=await fetch('/api/admin/crypto-discovery/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({coinId})});
      const body=await res.json();if(!res.ok) throw new Error(body.error||'Analysis failed');setReview(body.review);setNow(Date.now());
    } catch(e) {setError(e instanceof Error?e.message:'Analysis failed');}
    finally {setAnalyzing('');}
  }
  async function load(method:'GET'|'POST') {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/admin/crypto-discovery',{method,cache:'no-store'});
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Discovery request failed');
      setData(body.snapshot); setReview(null); setNow(Date.now());
    } catch(e) {setError(e instanceof Error ? e.message : 'Discovery unavailable');}
    finally {setBusy(false);}
  }
  useEffect(()=>{void load('GET');},[]);
  // Local clock only. No polling, provider calls, or hidden-tab timer.
  useEffect(()=>{const update=()=>setNow(Date.now()); const id=setInterval(()=>{if(!document.hidden) update();},60000);
    document.addEventListener('visibilitychange',update);
    return ()=>{clearInterval(id); document.removeEventListener('visibilitychange',update);};},[]);
  const stale = !!data && now - Date.parse(data.startedAt) > 15*60000;
  const rows = data?.rows.filter(r=>`${r.symbol} ${r.name} ${r.id}`.toLowerCase().includes(query.toLowerCase())).slice(0,100) ?? [];
  return <div className="space-y-5 p-6 text-slate-100">
    <h1 className="text-2xl font-bold">Crypto Discovery</h1>
    <p>Major-exchange momentum research: Binance, Coinbase, Kraken, KuCoin and OKX. No six-week holding requirement.</p>
    <p className="text-sm text-slate-400">Screens the first 300 pairs by reported volume per exchange, deduplicated by CoinGecko ID. This is a capped discovery window, not every exchange listing. No paper orders or entry signals are created here.</p>
    <div className="flex flex-wrap gap-3">
      <button disabled={busy} onClick={()=>void load('POST')} className="rounded bg-emerald-700 px-4 py-2 disabled:opacity-50">{busy?'Loading…':'Scan major exchanges'}</button>
      <button disabled={busy} onClick={()=>void load('GET')} className="rounded border px-4 py-2">Load saved results</button>
      <input aria-label="Find coin" placeholder="Find coin, e.g. QNT" value={query} onChange={e=>setQuery(e.target.value)} className="rounded border bg-slate-900 px-3" />
    </div>
    <p className="text-sm">Manual scan: at most 21 CoinGecko request attempts, no Alpha Vantage requests. Shared 15-minute cooldown. Opening this page only reads saved results.</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <p className="text-sm">Analyze candles: up to 2 CoinGecko requests per coin, capped at 10 coins per shared 15-minute window. Uses completed daily / 4h / 1h candles. No candle volume is available.</p>
    {review && <section aria-label="Momentum candle review" className="rounded border border-slate-600 p-4 space-y-2">
      <h2 className="text-xl">{review.symbol} · {review.status} · Research only</h2>
      <p>{now-Date.parse(review.reviewedAt)>15*60000?'STALE REVIEW · ':''}Reviewed {new Date(review.reviewedAt).toLocaleString()} · {review.coinId}</p>
      <p>{review.reasons.join(' · ')}</p>
      <p>Daily trend rising: {review.evidence.dailyAsOf?String(review.evidence.dailyTrend):'unavailable'} · 4h trend rising: {review.evidence.fourHourAsOf?String(review.evidence.fourHourTrend):'unavailable'} · Hourly bars: {review.evidence.hourlyBars} · Daily bars: {review.evidence.dailyBars}</p>
      <p>Last closed 1h: {review.evidence.hourlyAsOf??'unavailable'} · 4h: {review.evidence.fourHourAsOf??'unavailable'} · Daily: {review.evidence.dailyAsOf??'unavailable'} · Quote: {review.evidence.quoteAsOf??'unavailable'}</p>
      {review.levels && <p>Observed price: {review.levels.entry.toPrecision(6)} · Trigger: {review.levels.trigger.toPrecision(6)} · Maximum entry: {review.levels.maxEntry.toPrecision(6)} · Structural stop: {review.levels.stop.toPrecision(6)} · Model 2R target: {review.levels.target.toPrecision(6)} · Current R:R: {review.levels.currentRewardRisk.toFixed(2)}</p>}
      <p>{review.exitRule}</p>
      <p className="text-sm text-slate-400">Long-side research rule: completed daily and 4h closes above rising SMA20; 1h close above the previous 20-bar high, or reclaim of a pullback near SMA20. Stop below the last six hourly lows minus 0.25 ATR; maximum chase 0.5 ATR and minimum current 1.5R to a model target. Not a calibrated edge or paper-trade permission.</p>
    </section>}
    {!data && !busy && <p>No saved discovery snapshot. Run a scan to establish coverage.</p>}
    {data && <>
      <p>{stale?'STALE SNAPSHOT':data.partial?'PARTIAL COVERAGE':'SNAPSHOT AVAILABLE'} · {data.uniqueCoins} coins with market data · {data.requests} request attempts · Started {new Date(data.startedAt).toLocaleString()} · Finished {new Date(data.finishedAt).toLocaleString()}</p>
      <p className="text-sm">{data.coverage.map(c=>`${c.exchange}: ${c.pairsSeen} pairs, ${c.status}`).join(' · ')}</p>
      {!!data.missingMarketIds?.length && <p className="text-amber-300">Market data not returned for: {data.missingMarketIds.join(', ')}</p>}
      {!!data.failedMarketBatches?.length && <p className="text-amber-300">Failed market-data batches: {data.failedMarketBatches.join(', ')}</p>}
      <p className="text-sm text-slate-400">Screen: market cap ≥ $10m, global 24h volume ≥ $2m; at least one observed pair with ≥ $250k volume, spread ≤ 0.5%, no stale/anomaly flag and a trade within 15 minutes of scan start. Reported volume is not order-book depth. Stable/wrapped screening is heuristic.</p>
      <p className="text-sm text-slate-400">MOMENTUM: 1h ≥ 1% and 24h ≥ 3%. EXTENDED: 1h ≥ 10% or 24h ≥ 30%; retained for review, not a buy signal. WATCH: other passing screens. These are unvalidated discovery rules, not a profitability score. Ordered by stage then 1h change.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Coin / ID','Stage at scan','Price USD','1h','24h','7d','Venues / pair spreads','Fixed scanner','Exclusions'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map(r=><tr key={r.id} className="border-t border-slate-700">
          <td className="p-2">{r.symbol}<br/><span className="text-slate-400">{r.id}</span><br/><button className="underline disabled:opacity-40" disabled={!!analyzing||busy||stale||r.stage==='EXCLUDED'} onClick={()=>void analyze(r.id)}>{analyzing===r.id?'Analyzing…':`Analyze ${r.symbol} candles`}</button></td><td>{r.stage}</td><td>{r.price?.toLocaleString(undefined,{maximumSignificantDigits:7}) ?? 'Unavailable'}</td>
          <td>{pct(r.change1h)}</td><td>{pct(r.change24h)}</td><td>{pct(r.change7d)}</td>
          <td>{r.venues.map(v=>`${v.exchange} ${v.pair} (${v.spreadPct.toFixed(3)}%)`).join(', ')}</td>
          <td>{r.fixedScanCovered?'Covered':'Outside fixed list'}</td><td>{r.reasons.join(', ') || 'None at scan'}</td>
        </tr>)}</tbody></table></div>
      <p>Showing {rows.length} matching coins (maximum 100). Search the complete saved snapshot by coin name or ID. Missing here can mean outside the capped pair window, failed venue checks or missing market data.</p>
    </>}
  </div>;
}
