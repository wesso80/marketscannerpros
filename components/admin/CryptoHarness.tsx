'use client';
import {useEffect,useRef,useState} from 'react';
import type {HarnessResult} from '@/lib/admin/strategyHarnessJob';
type View={error?:string;config:{version:string;from:string;inSampleEnd:string;universeTop:number;halfSpread:number;cost:number;fixedHorizonDays:number};variants:{id:string;label:string}[];
 state:{status:string;startedAt:string;updatedAt:string;dataEnd:string;requests:number;pendingPass1?:number;counts:Record<string,number>;problems:{coin:string;status:string;error?:string}[]}|null;result:(Omit<HarnessResult,'trades'>&{tradeCount:number})|null};
const r2=(n:number|null|undefined,s='')=>n==null?'—':`${n>=0&&s==='R'?'+':''}${n.toFixed(2)}${s}`;
const pct=(n:number|null|undefined)=>n==null?'—':`${n>=0?'+':''}${(n*100).toFixed(1)}%`;
const tone=(n:number|null|undefined)=>n==null?'':n>0?'text-emerald-300':n<0?'text-red-300':'';
export default function CryptoHarness({refreshVersion=0}:{refreshVersion?:number}){
 const [data,setData]=useState<View|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[running,setRunning]=useState(false);
 const alive=useRef(true);
 async function call(action?:string){
  setBusy(true);setError('');
  try{const r=await fetch('/api/admin/crypto-markets/harness',{method:action?'POST':'GET',cache:'no-store',...(action?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action})}:{})}),b=await r.json();
   if(b.config&&alive.current)setData(b);if(r.status===429)return b as View;if(!r.ok)throw Error(b.error||'Harness unavailable');return b as View;}
  catch(e){setError((e as Error).message);setRunning(false);return null;}finally{if(alive.current)setBusy(false);}
 }
 useEffect(()=>{alive.current=true;void call();return()=>{alive.current=false;};},[refreshVersion]);
 // Batches advance only while this tab is visible; progress is saved, and results are computed when all coins are done.
 useEffect(()=>{if(!running)return;let stop=false,t:ReturnType<typeof setTimeout>|undefined;
  const step=async()=>{if(stop||document.hidden){setRunning(false);return;}const b=await call('batch');
   if(stop)return;if(b?.state?.status==='RUNNING')t=setTimeout(()=>void step(),2000);else{if(b?.state?.status==='COMPLETE')await call('compute');setRunning(false);}};
  void step();return()=>{stop=true;if(t)clearTimeout(t);};},[running]);
 const s=data?.state,res=data?.result;
 return <section aria-label="Strategy test harness" className="space-y-3 rounded border border-fuchsia-700 p-4">
  <h2 className="text-xl">Strategy test harness · SIMULATED · RESEARCH ONLY</h2>
  <p className="text-sm">Runs the same period (from {data?.config.from}) through six pre-defined variants with identical costs, universe and data, next to two benchmarks. Nothing here changes the live paper rules or places orders.</p>
  {res&&<p className="rounded border border-amber-700 p-2 text-sm"><b>Overfitting check:</b> {res.variantsTested} variants tested in this harness ({res.version}), plus {res.earlierVariants.length} related ideas examined earlier on overlapping 2026 data ({res.earlierVariants.join('; ')}). With {res.variantsTested+res.earlierVariants.length} ideas tried, the best in-sample result is expected to look better than it is: judge variants on the out-of-sample column, and only by margins that clearly exceed the others.</p>}
  <details className="rounded border border-slate-700 p-3 text-sm"><summary className="font-semibold">Variant definitions and method (fixed before running)</summary>
   <ul className="list-disc space-y-1 pl-5">{data?.variants.map(v=><li key={v.id}><b>{v.id}</b>: {v.label}</li>)}</ul>
   <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
    <li><b>Universe:</b> a coin may trade only on days it was in the top {data?.config.universeTop} by market cap on that day (Phase 4 CoinGecko data; stablecoins excluded; delisted coins included).</li>
    <li><b>Candles:</b> CoinGecko OHLC has no per-candle volume, so 4h and daily signals use Coinbase hourly candles (the live system&apos;s source, served for delisted Coinbase pairs too). A Coinbase pair is used only when its daily closes agree with CoinGecko within 3% on at least 90% of days; coins without a Coinbase USD pair are excluded and counted.</li>
    <li><b>Costs, identical for every variant:</b> {((data?.config.halfSpread??0)*100).toFixed(2)}% half-spread at entry, {((data?.config.cost??0)*100).toFixed(2)}% fee and {((data?.config.cost??0)*100).toFixed(2)}% slippage per side. Entries use the live planner at the first hourly open inside the entry zone (E: next daily open).</li>
    <li><b>Exits:</b> checked on hourly candles (the live system uses 15-minute candles), stop first when a candle touches both. Trades still open at the end of the data are marked at the last close and counted as marked.</li>
    <li><b>Drawdown:</b> cumulative R by exit time with 1R per trade and no cap on overlapping positions; benchmarks use weekly percentage drawdown. R and percentage figures are not directly comparable.</li>
   </ul></details>
  <div className="flex flex-wrap gap-3">
   <button disabled={busy||running} onClick={()=>void call('start')} className="rounded bg-fuchsia-800 px-3 py-2 disabled:opacity-50">{s?'Start again':'Start harness'}</button>
   {s?.status==='RUNNING'&&<button disabled={busy&&!running} onClick={()=>setRunning(v=>!v)} className="rounded border px-3 py-2">{running?'Pause':'Run batches while this tab is open'}</button>}
   {s?.status==='COMPLETE'&&<button disabled={busy} onClick={()=>void call('compute')} className="rounded border px-3 py-2">Compute results</button>}
  </div>
  <p className="text-xs text-slate-400">Requires the History data job (Phase 4) to have finished pass 1. Uses no CoinGecko credits: CoinGecko data comes from the database; candles come from Coinbase&apos;s public API. Each coin needs up to ~140 Coinbase requests.</p>
  {busy&&<p>Working…</p>}{error&&<p role="alert" className="text-amber-300">{error}</p>}
  {s&&<p className="text-sm">{s.status} · coins: {Object.entries(s.counts).map(([k,v])=>`${k} ${v}`).join(' · ')} · {s.requests.toLocaleString()} Coinbase requests · data to {s.dataEnd} · updated {new Date(s.updatedAt).toLocaleString()}</p>}
  {s&&(s.pendingPass1??0)>0&&<p className="text-xs text-amber-300">{s.pendingPass1} coin(s) were still pending in History pass 1 at start (daily top-up or retried errors); the universe may miss them if they were ever in the top 100.</p>}
  {!!s?.problems.length&&<details className="text-xs"><summary>Excluded or failed coins ({s.problems.length} shown)</summary><ul className="pl-5">{s.problems.map(p=><li key={p.coin}>{p.coin}: {p.status} {p.error??''}</li>)}</ul></details>}
  {res&&res.periods.map((p,k)=><div key={p.label} className="overflow-auto">
   <h3 className="mt-2 text-sm font-semibold">{p.label} · {p.from} → {p.to}</h3>
   <table className="w-full min-w-[820px] text-left text-sm"><thead><tr>{['Variant','Trades','Win rate','Expectancy','Profit factor','Max drawdown','Total','Avg hold','Marked'].map(h=><th key={h} className="p-1">{h}</th>)}</tr></thead><tbody>
    {res.variants.map(v=>{const x=v.stats[k];return <tr key={v.id} className="border-t border-slate-800"><td className="p-1" title={v.label}>{v.id}</td><td className="p-1">{x.trades}{x.trades<30?<span className="text-amber-300"> · few</span>:null}</td><td className="p-1">{x.winRate==null?'—':`${(x.winRate*100).toFixed(0)}%`}</td><td className={`p-1 ${tone(x.expectancyR)}`}>{r2(x.expectancyR,'R')}</td><td className="p-1">{r2(x.profitFactor)}</td><td className="p-1">{r2(x.maxDrawdownR,'R')}</td><td className={`p-1 ${tone(x.totalR)}`}>{r2(x.totalR,'R')}</td><td className="p-1">{x.avgHoldDays==null?'—':`${x.avgHoldDays.toFixed(1)}d`}</td><td className="p-1">{x.marked}</td></tr>;})}
    {res.benchmarks.map(b=>{const x=b.byPeriod[k];return <tr key={b.label} className="border-t border-slate-800 text-slate-300"><td className="p-1">{b.label}</td><td className="p-1">—</td><td className="p-1">—</td><td className="p-1">—</td><td className="p-1">—</td><td className="p-1">{pct(x.maxDrawdown)}</td><td className={`p-1 ${tone(x.totalReturn)}`}>{pct(x.totalReturn)}{x.cagr!=null?` (${pct(x.cagr)}/yr)`:''}</td><td className="p-1">—</td><td className="p-1">—</td></tr>;})}
   </tbody></table></div>)}
  {res&&<p className="text-sm"><a className="underline" href="/api/admin/crypto-markets/harness?format=csv">Download all harness trades (CSV, {res.tradeCount.toLocaleString()} trades)</a> · computed {new Date(res.computedAt).toLocaleString()}</p>}
 </section>;
}
