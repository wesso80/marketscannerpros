'use client';
import {useEffect,useRef,useState} from 'react';
import type {HistState} from '@/lib/admin/cgHistoryJob';
type View={error?:string;config:{from:string;activeCandidates:number;universeSize:number;storeDailyIfPeakMcapUsd:number;maxShareOfRemaining:number;callsPerCronRun:number;callsPerManualBatch:number};state:HistState;counts:Record<string,number>;coverage:Record<string,number|string|null>};
const n=(x:unknown)=>typeof x==='number'?x.toLocaleString():'—';
export default function CryptoHistoryData({refreshVersion=0}:{refreshVersion?:number}){
 const [data,setData]=useState<View|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[auto,setAuto]=useState(false);
 const alive=useRef(true);
 async function call(action?:string,extra:Record<string,unknown>={}){
  setBusy(true);setError('');
  try{const r=await fetch('/api/admin/crypto-markets/history',{method:action?'POST':'GET',cache:'no-store',...(action?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra})}:{})}),b=await r.json();
   if(b.state&&alive.current)setData(b);if(!r.ok)throw Error(b.error||'History unavailable');return b as View;}
  catch(e){setError((e as Error).message);setAuto(false);return null;}finally{if(alive.current)setBusy(false);}
 }
 useEffect(()=>{alive.current=true;void call();return()=>{alive.current=false;};},[refreshVersion]);
 // Optional faster progress while this tab is visible; the 15-minute cron keeps going regardless.
 useEffect(()=>{if(!auto)return;let stop=false,t:ReturnType<typeof setTimeout>|undefined;
  const step=async()=>{if(stop||document.hidden){setAuto(false);return;}const b=await call('batch');if(!stop&&b?.state.phase==='RUNNING')t=setTimeout(()=>void step(),3000);else setAuto(false);};
  void step();return()=>{stop=true;if(t)clearTimeout(t);};},[auto]);
 const s=data?.state,e=s?.estimate,c=data?.counts??{},cov=data?.coverage??{};
 const inactiveServed=(c['inactive:OK']??0)+(c['inactive:SMALL']??0),inactiveMissing=(c['inactive:NO_HISTORY']??0)+(c['inactive:ERROR']??0);
 function approve(){if(!e)return;if(!confirm(`Approve the history download?\n\nEstimated ${e.calls.totalLow.toLocaleString()}–${e.calls.totalHigh.toLocaleString()} CoinGecko credits.\nHard cap: ${e.cap?.toLocaleString()??'set at approval'} credits (50% of credits remaining at approval). The job stops at the cap even if unfinished.`))return;void call('approve',{confirm:true});}
 return <section aria-label="CoinGecko history data" className="space-y-3 rounded border border-indigo-700 p-4">
  <h2 className="text-xl">History data · CoinGecko · RESEARCH ONLY</h2>
  <p className="text-sm">A one-off download of daily history from {data?.config.from??'2021-06-01'} (covering 2022 with a 200-day warm-up), stored in this app&apos;s database so it is fetched once, then small daily top-ups. It feeds point-in-time backtests: the universe on each past date is the top {data?.config.universeSize??150} coins by market cap <i>on that date</i>, including coins that were later delisted.</p>
  <details className="rounded border border-slate-700 p-3 text-sm"><summary className="font-semibold">What is downloaded and how credits are protected</summary><ul className="list-disc space-y-1 pl-5">
   <li><b>Candidates:</b> today&apos;s top {n(data?.config.activeCandidates)} active coins plus every coin CoinGecko lists as inactive (/coins/list?status=inactive). An active coin that was large in 2022 but is below #{n(data?.config.activeCandidates)} today is missed; this is reported, not hidden.</li>
   <li><b>Pass 1:</b> one /coins/&#123;id&#125;/market_chart/range call per candidate (daily price, market cap, volume at 00:00 UTC). Coins that never reached ${((data?.config.storeDailyIfPeakMcapUsd??1e8)/1e6).toFixed(0)}M market cap cannot enter a top-150 universe: only their summary is kept.</li>
   <li><b>Pass 2:</b> daily OHLC via /coins/&#123;id&#125;/ohlc/range in 180-day chunks, only for coins that were ever in the daily top {data?.config.universeSize??150} (stablecoins, priced within 3% of $1 on 90% of days, excluded). Plus /global/market_cap_chart for the market regime on every date.</li>
   <li><b>Day key:</b> each row is the UTC date of a 00:00 UTC observation, i.e. the close of the previous UTC day. OHLC timestamps are candle close times.</li>
   <li><b>Credits:</b> nothing downloads until you approve the estimate. The job then never spends more than {Math.round((data?.config.maxShareOfRemaining??.5)*100)}% of the credits remaining at approval (measured as the larger of CoinGecko&apos;s own /key drop, which includes the app&apos;s other usage, and the job&apos;s own count) and pauses while total credits are below 15%. It runs {data?.config.callsPerCronRun} calls per 15-minute cron run, or {data?.config.callsPerManualBatch} per manual batch.</li>
  </ul></details>
  <div className="flex flex-wrap gap-3">
   <button disabled={busy||s?.phase==='RUNNING'} onClick={()=>void call('estimate')} className="rounded bg-indigo-800 px-3 py-2 disabled:opacity-50">1. Estimate credit cost</button>
   <button disabled={busy||!(s?.phase==='ESTIMATED'||s?.phase==='PAUSED_CAP')} onClick={approve} className="rounded border px-3 py-2 disabled:opacity-50">2. Approve and start</button>
   {s?.phase==='RUNNING'&&<button disabled={busy&&!auto} onClick={()=>setAuto(v=>!v)} className="rounded border px-3 py-2">{auto?'Stop fast batches':'Run fast batches while this tab is open'}</button>}
   {(s?.phase==='RUNNING'||s?.phase==='PAUSED_MANUAL')&&<button disabled={busy} onClick={()=>void call(s.phase==='RUNNING'?'pause':'resume')} className="rounded border px-3 py-2">{s.phase==='RUNNING'?'Pause':'Resume'}</button>}
   <button disabled={busy} onClick={()=>void call('retry_errors')} className="rounded border px-3 py-2">Retry errors</button>
  </div>
  {busy&&<p>Working…</p>}{error&&<p role="alert" className="text-amber-300">{error}</p>}
  {s&&<p className="text-sm">Status: <b>{s.phase}</b>{s.cap!=null?` · job credits ${n(s.jobCalls)} of cap ${n(s.cap)} (remaining at approval ${n(s.startRemaining)}, ${s.remainingSource})`:''}{s.lastBatchAt?` · last batch ${new Date(s.lastBatchAt).toLocaleString()} (${s.lastStep})`:''}{s.lastError?<span className="text-amber-300"> · {s.lastError}</span>:''}</p>}
  {e&&<div className="overflow-auto rounded border border-slate-700 p-3"><h3 className="font-semibold">Credit estimate · {new Date(e.at).toLocaleString()}</h3>
   <table className="w-full min-w-[520px] text-left text-sm"><tbody>
    <tr><td className="p-1">Candidates</td><td className="p-1">{n(e.candidates.active)} active + {n(e.candidates.inactive)} inactive = {n(e.candidates.total)} (still pending)</td></tr>
    <tr><td className="p-1">Lists + global chart</td><td className="p-1">{n(e.calls.lists+e.calls.global)}</td></tr>
    <tr><td className="p-1">Pass 1 market charts (exact)</td><td className="p-1">{n(e.calls.marketCharts)}</td></tr>
    <tr><td className="p-1">Pass 2 OHLC (range)</td><td className="p-1">{n(e.calls.ohlcLow)}–{n(e.calls.ohlcHigh)}</td></tr>
    <tr className="font-semibold"><td className="p-1">Total</td><td className="p-1">{n(e.calls.totalLow)}–{n(e.calls.totalHigh)} credits</td></tr>
    <tr><td className="p-1">Remaining now / job cap (50%)</td><td className="p-1">{n(e.remaining)} / {n(e.cap)} {e.fitsCap===false?<span className="text-amber-300">· the high estimate exceeds the cap: the job would stop early; approve again next month to continue</span>:e.fitsCap?<span className="text-emerald-300">· fits within the cap</span>:''}</td></tr>
    <tr><td className="p-1">Daily top-up after backfill</td><td className="p-1">≈ {n(e.dailyTopUp)} credits/day</td></tr>
   </tbody></table><p className="text-xs text-slate-400">{e.note}</p></div>}
  <div className="rounded border border-slate-700 p-3 text-sm"><h3 className="font-semibold">Coverage</h3>
   {'error' in cov?<p className="text-amber-300">{String(cov.error)}</p>:<>
    <p>Daily rows {n(cov.dailyRows)} for {n(cov.coinsWithDaily)} coins · {String(cov.first??'—')} → {String(cov.last??'—')} · rows with OHLC {n(cov.ohlcRows)} · global market cap days {n(cov.globalDays)} ({String(cov.globalFirst??'—')} → {String(cov.globalLast??'—')})</p>
    <p>Universe members (ever top {data?.config.universeSize}): {n(cov.universeMembers)}, of which delisted {n(cov.inactiveUniverseMembers)}</p>
    <p>Survivorship check · inactive coins with history served: {n(inactiveServed)} · inactive coins where CoinGecko returned no history or failed: <span className={inactiveMissing?'text-amber-300':''}>{n(inactiveMissing)}</span>. Coins with no history cannot be backtested; results may still be optimistic by that amount.</p>
    <p className="text-xs text-slate-400">By status: {Object.entries(c).sort().map(([k,v])=>`${k} ${v.toLocaleString()}`).join(' · ')||'none yet'}</p>
   </>}
  </div>
 </section>;
}
