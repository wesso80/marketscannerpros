'use client';
const CryptoSetupEmail = dynamic(()=>import('@/components/admin/CryptoSetupEmail'), {ssr:false});
const CryptoPaperAccount = dynamic(()=>import('@/components/admin/CryptoPaperAccount'), {ssr:false});
const CryptoBacktest = dynamic(()=>import('@/components/admin/CryptoBacktest'), {ssr:false});
const CryptoRotation = dynamic(()=>import('@/components/admin/CryptoRotation'), {ssr:false});
const CryptoMarketData = dynamic(()=>import('@/components/admin/CryptoMarketData'), {ssr:false});
const CryptoHistoryData = dynamic(()=>import('@/components/admin/CryptoHistoryData'), {ssr:false});
const CryptoHarness = dynamic(()=>import('@/components/admin/CryptoHarness'), {ssr:false});
const CryptoAttentionStrip = dynamic(()=>import('@/components/admin/CryptoAttentionStrip'), {ssr:false});
const TABS = [['paper','Paper account'],['setups','Setups'],['learning','Learning'],['recommendations','Recommendations'],['watchlists','Watchlists & discovery'],['backtest','Backtest'],['rotation','Rotation lab'],['marketdata','Market data'],['history','History data'],['harness','Strategy harness'],['alerts','Alerts']] as const;
type Tab = typeof TABS[number][0];
const CryptoMomentumScanner = dynamic(()=>import('@/components/admin/CryptoMomentumScanner'), {ssr:false});
const CryptoForwardScore = dynamic(()=>import('@/components/admin/CryptoForwardScore'), {ssr:false});
const CryptoRecommendations = dynamic(()=>import('@/components/admin/CryptoRecommendations'), {ssr:false});
const CryptoLearning = dynamic(()=>import('@/components/admin/CryptoLearning'), {ssr:false});
const CryptoBaseScanner = dynamic(()=>import('@/components/admin/CryptoBaseScanner'), {ssr:false});
const CryptoMarketContext = dynamic(()=>import('@/components/admin/CryptoMarketContext'), {ssr:false});
import type {BaseReview} from '@/lib/admin/cryptoBase';
import dynamic from 'next/dynamic';
import type { MomentumChart } from '@/lib/admin/cryptoMomentum';
const CryptoExchangeVolume = dynamic(()=>import('@/components/admin/CryptoExchangeVolume'), {ssr:false});
const CryptoReviewChart = dynamic(()=>import('@/components/admin/CryptoReviewChart'), {ssr:false});
import { useEffect, useState } from 'react';
import type { DiscoveryRow, VenueEvidence } from '@/lib/admin/cryptoDiscovery';
import {reviewStatusLabel,type MomentumReview} from '@/lib/admin/cryptoMomentum';
type Snapshot = { startedAt:string; finishedAt:string; requests:number; partial:boolean; uniqueCoins:number; missingMarketIds?:string[]; failedMarketBatches?:number[];
  coverage:{exchange:string; pages:number; status:string; pairsSeen:number}[];
  rows:(DiscoveryRow & {venues:VenueEvidence[]})[] };
const pct = (n:number|null) => n === null ? 'Unavailable' : `${n.toFixed(2)}%`;
export default function CryptoMarketsPage() {
  const [data,setData] = useState<Snapshot|null>(null), [error,setError] = useState('');
  const [busy,setBusy] = useState(false), [query,setQuery] = useState('');
  const [now,setNow] = useState(Date.now());
  const [refreshVersion,setRefreshVersion] = useState(0);
  // Remembered per browser only; the page renders the default tab when storage is unavailable.
  const [tab,setTabState] = useState<Tab>('paper');
  useEffect(()=>{try{const t=localStorage.getItem('crypto-markets-tab');if(TABS.some(([k])=>k===t))setTabState(t as Tab);}catch{}},[]);
  function setTab(t:string){if(!TABS.some(([k])=>k===t))return;setTabState(t as Tab);try{localStorage.setItem('crypto-markets-tab',t);}catch{}}
  function refreshSaved(){setRefreshVersion(v=>v+1);void load('GET');}
  const [review,setReview] = useState<MomentumReview|null>(null);
  const [volumeLabel,setVolumeLabel] = useState<string|null>(null);
  const [base,setBase] = useState<BaseReview|null>(null);
  const [chart,setChart] = useState<MomentumChart|null>(null);
  const [analyzing,setAnalyzing] = useState('');
  const [researchOpen,setResearchOpen] = useState(false);
  async function analyze(coinId:string) {
    setTab('watchlists');setResearchOpen(false);setAnalyzing(coinId);setError('');setReview(null);setChart(null);setBase(null);
    try {
      const res=await fetch('/api/admin/crypto-discovery/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({coinId})});
      const body=await res.json();if(!res.ok) throw new Error(body.error||'Analysis failed');setReview(body.review);setChart(body.chart??null);setBase(body.base??null);setNow(Date.now());
    } catch(e) {setError(e instanceof Error?e.message:'Analysis failed');}
    finally {setAnalyzing('');}
  }
  async function load(method:'GET'|'POST') {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/admin/crypto-discovery',{method,cache:'no-store'});
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Discovery request failed');
      setData(body.snapshot); setResearchOpen(false);setReview(null);setChart(null);setBase(null); setNow(Date.now());
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
    <h1 className="text-2xl font-bold">Crypto Markets</h1>
    <p>SIMULATED paper trading only; no real orders.</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <CryptoAttentionStrip now={now} refreshVersion={refreshVersion} onOpen={setTab} />
    <div className="flex flex-wrap gap-3">
      <button disabled={busy} onClick={()=>void load('POST')} className="rounded bg-emerald-700 px-4 py-2 disabled:opacity-50">{busy?'Loading…':'Scan major exchanges'}</button>
      <button disabled={busy} onClick={refreshSaved} className="rounded border px-4 py-2">Refresh saved dashboard</button>
      <input aria-label="Find coin" placeholder="Find coin, e.g. QNT" value={query} onChange={e=>{setQuery(e.target.value);setTab('watchlists');}} className="rounded border bg-slate-900 px-3" />
    </div>
    <details className="rounded border border-slate-700 p-3 text-sm"><summary className="cursor-pointer">About discovery scans and provider budgets</summary>
      <p>Major-exchange momentum research: Binance, Coinbase, Kraken, KuCoin and OKX.</p>
      <p className="text-slate-400">Screens the first 300 pairs by reported volume per exchange, deduplicated by CoinGecko ID. This is a capped discovery window, not every exchange listing. Discovery refreshes do not create trades. The paper account applies its own entry checks.</p>
      <p>Manual scan: at most 21 CoinGecko request attempts, no Alpha Vantage requests. Shared 15-minute cooldown. Opening this page and Refresh saved dashboard read saved discovery, scans and paper results only; they do not request new provider data.</p>
      <p>Analyze candles: up to 2 CoinGecko requests per coin, capped at 10 coins per shared 15-minute window. Uses completed daily / 4h / 1h candles. CoinGecko candles contain prices only; exchange candle volume can be checked inside a coin review.</p>
      <p>4-hour entry zone: a MOMENTUM_VOLUME close between the entry floor and the chase limit. EXTENDED names, and cycle decisions marked BLOCKED, are listed with one reason. That list is not a new scan.</p>
    </details>
    <nav role="tablist" aria-label="Crypto Markets sections" className="flex flex-wrap gap-1 border-b border-slate-700">
      {TABS.map(([k,label])=><button key={k} role="tab" aria-selected={tab===k} onClick={()=>setTab(k)} className={`rounded-t px-3 py-2 text-sm ${tab===k?'bg-slate-800 font-semibold':'text-slate-400 hover:text-slate-200'}`}>{label}</button>)}
    </nav>
    {tab==='alerts' && <CryptoSetupEmail refreshVersion={refreshVersion} />}
    {tab==='paper' && <CryptoPaperAccount now={now} refreshVersion={refreshVersion} onRefresh={refreshSaved} />}
    {tab==='backtest' && <CryptoBacktest refreshVersion={refreshVersion} />}
    {tab==='rotation' && <CryptoRotation refreshVersion={refreshVersion} />}
    {tab==='marketdata' && <CryptoMarketData refreshVersion={refreshVersion} />}
    {tab==='history' && <CryptoHistoryData refreshVersion={refreshVersion} />}
    {tab==='harness' && <CryptoHarness refreshVersion={refreshVersion} />}
    {tab==='recommendations' && <CryptoRecommendations refreshVersion={refreshVersion} />}
    {tab==='learning' && <CryptoLearning refreshVersion={refreshVersion} />}
    {tab==='setups' && <>
    <CryptoForwardScore refreshVersion={refreshVersion} />
    <CryptoMomentumScanner now={now} refreshVersion={refreshVersion} />
    <CryptoMomentumScanner now={now} refreshVersion={refreshVersion} hourly />
    </>}
    {tab==='watchlists' && <>
    <CryptoBaseScanner now={now} refreshVersion={refreshVersion} />
    {review && <section aria-label="Momentum candle review" className="rounded border border-slate-600 p-4 space-y-2">
      <h2 className="text-xl">{review.symbol} · {(volumeLabel&&volumeLabel!=='confirmed'?reviewStatusLabel(review).replace('_CONFIRMED',''):reviewStatusLabel(review))} · Research only</h2>
      <p>{now-Date.parse(review.reviewedAt)>15*60000?'STALE REVIEW · ':''}Reviewed {new Date(review.reviewedAt).toLocaleString()} · {review.coinId}</p>
      <p>{((volumeLabel&&volumeLabel!=='confirmed')||!reviewStatusLabel(review).includes('CONFIRMED')?review.reasons.map(r=>r.replace(/\bconfirmed\b/gi,'matched')):review.reasons).join(' · ')}</p>
      <p>Daily trend rising: {review.evidence.dailyAsOf?String(review.evidence.dailyTrend):'unavailable'} · 4h trend rising: {review.evidence.fourHourAsOf?String(review.evidence.fourHourTrend):'unavailable'} · Hourly bars: {review.evidence.hourlyBars} · Daily bars: {review.evidence.dailyBars}</p>
      <p>Last closed 1h: {review.evidence.hourlyAsOf??'unavailable'} · 4h: {review.evidence.fourHourAsOf??'unavailable'} · Daily: {review.evidence.dailyAsOf??'unavailable'} · Quote: {review.evidence.quoteAsOf??'unavailable'}</p>
      {review.levels && <p>Observed price: {review.levels.entry.toPrecision(6)} · Trigger: {review.levels.trigger.toPrecision(6)} · Maximum entry: {review.levels.maxEntry.toPrecision(6)} · Structural stop: {review.levels.stop.toPrecision(6)} · Model 2R target: {review.levels.target.toPrecision(6)} · Current R:R: {review.levels.currentRewardRisk.toFixed(2)}</p>}
      {base&&<section aria-label="Base and breakout evidence" className="rounded border border-sky-800 p-3">
        <h3>Base strategy · {base.stage} · Price only</h3><p>{base.reason}</p>
        <p>Range low: {base.low?.toPrecision(6)??'Unavailable'} · Range high: {base.high?.toPrecision(6)??'Unavailable'} · Width: {base.widthPct?.toFixed(2)??'Unavailable'}% · MA gap: {base.maGapPct?.toFixed(2)??'Unavailable'}% · MA slope: {base.slopePct?.toFixed(2)??'Unavailable'}%</p>
        <p className="text-xs text-slate-400">Experimental 21-day base ending before the latest completed 4h candle. No minimum holding period. Thresholds are unvalidated. Volume contraction, breakout volume and market regime are not confirmed. This assessment runs only when you open a coin review; the first scan still ranks price momentum.</p>
      </section>}
      <CryptoReviewChart key={review.coinId} chart={chart} review={review} base={base} onLabel={setVolumeLabel} />
      <CryptoExchangeVolume key={review.coinId+review.reviewedAt} coinId={review.coinId} now={now} />
      <section aria-label="Further research" className="rounded border border-slate-700 p-4 space-y-3">
        <button type="button" aria-expanded={researchOpen} aria-controls="crypto-further-research" onClick={()=>setResearchOpen(open=>!open)} className="rounded border px-3 py-2">{researchOpen?'Close further research':'Open further research'} · {review.symbol}</button>
        <p className="text-sm text-slate-400">Optional market news and trending context after reviewing the setup. These feeds do not change the initial scan ranking or trade status.</p>
        {researchOpen&&<div id="crypto-further-research"><CryptoMarketContext now={now} /></div>}
      </section>
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
          <td className="p-2">{r.symbol}<br/><span className="text-slate-400">{r.id}</span><br/><button className="underline disabled:opacity-40" disabled={!!analyzing||busy||stale||r.stage==='EXCLUDED'} onClick={()=>void analyze(r.id)}>{analyzing===r.id?'Analyzing…':`Chart & review ${r.symbol}`}</button></td><td>{r.stage}</td><td>{r.price?.toLocaleString(undefined,{maximumSignificantDigits:7}) ?? 'Unavailable'}</td>
          <td>{pct(r.change1h)}</td><td>{pct(r.change24h)}</td><td>{pct(r.change7d)}</td>
          <td>{r.venues.map(v=>`${v.exchange} ${v.pair} (${v.spreadPct.toFixed(3)}%)`).join(', ')}</td>
          <td>{r.fixedScanCovered?'Covered':'Outside fixed list'}</td><td>{r.reasons.join(', ') || 'None at scan'}</td>
        </tr>)}</tbody></table></div>
      <p>Showing {rows.length} matching coins (maximum 100). Search the complete saved snapshot by coin name or ID. Missing here can mean outside the capped pair window, failed venue checks or missing market data.</p>
    </>}
    </>}
  </div>;
}
