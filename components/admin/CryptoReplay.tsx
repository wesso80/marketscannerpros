'use client';
import {useEffect,useRef,useState} from 'react';
type BookSummary={taken:number;closed:number;realisedPnl:number;finalEquity:number;maxDrawdownPct:number;pnlUnknown:number};
type View={error?:string;
 config:{version:string;from:string;segmentDays:number;horizonDays:number;halfSpread:number;cost:number;startingBalance:number;liquiditySource:string;featuresVersion:string;unavailableFeatures:Record<string,string>;shadowPlans:string[];universeTop:number};
 state:{runId:string;status:'RUNNING'|'READY_TO_SIMULATE'|'SIMULATED';startedAt:string;updatedAt:string;from:string;dataEnd:string;btcDownFilter:boolean;requests:number;dropped:number;rows:number;
  counts:Record<string,number>;segments:{total:number;done:number;failed:number};problems:{coin:string;status:string;error?:string}[];
  simulation?:{at:string;btcDownFilter:boolean;summary:Record<string,BookSummary>}}|null;
 dataset:{total:string;extended:string;no_entry:string;taken:string;skipped:string;taken_r:number|null;skipped_r:number|null;extended_r:number|null;first_signal:string|null;last_signal:string|null;skipReasons:{reason:string;n:string}[]}|null};
const r2=(n:number|string|null|undefined)=>n==null?'—':`${Number(n)>=0?'+':''}${Number(n).toFixed(2)}R`;
const usd=(n:number)=>`USD ${n.toLocaleString(undefined,{maximumFractionDigits:0})}`;
const START_OPTIONS=['2022-01-01','2023-01-01','2024-01-01','2025-01-01'];
export default function CryptoReplay({refreshVersion=0}:{refreshVersion?:number}){
 const [data,setData]=useState<View|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[running,setRunning]=useState(false),[from,setFrom]=useState(START_OPTIONS[0]);
 const alive=useRef(true);
 async function call(action?:string,extra:Record<string,unknown>={}){
  setBusy(true);setError('');
  try{const r=await fetch('/api/admin/crypto-markets/replay',{method:action?'POST':'GET',cache:'no-store',...(action?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra})}:{})}),b=await r.json();
   if(b.config&&alive.current)setData(b);if(r.status===429)return b as View;if(!r.ok)throw Error(b.error||'Replay unavailable');return b as View;}
  catch(e){setError((e as Error).message);setRunning(false);return null;}finally{if(alive.current)setBusy(false);}
 }
 useEffect(()=>{alive.current=true;void call();return()=>{alive.current=false;};},[refreshVersion]);
 // Batches advance only while this tab is visible; progress is saved after every segment.
 useEffect(()=>{if(!running)return;let stop=false,t:ReturnType<typeof setTimeout>|undefined;
  const step=async()=>{if(stop||document.hidden){setRunning(false);return;}const b=await call('batch');
   if(stop)return;if(b?.state?.status==='RUNNING')t=setTimeout(()=>void step(),1500);else{if(b?.state?.status==='READY_TO_SIMULATE')await call('simulate');setRunning(false);}};
  void step();return()=>{stop=true;if(t)clearTimeout(t);};},[running]);
 const s=data?.state,d=data?.dataset,c=data?.config,sim=s?.simulation;
 const pct=s&&s.segments.total?Math.round(s.segments.done/s.segments.total*100):0;
 return <section aria-label="History replay" className="space-y-3 rounded border border-cyan-700 p-4">
  <h2 className="text-xl">History replay · SIMULATED · RESEARCH ONLY</h2>
  <p className="text-sm">Replays historical Coinbase candles through the live paper code and keeps <b>every</b> 4h signal, taken or skipped, with point-in-time features and outcomes under every exit plan. This dataset is the input for the shadow model (Phase 4). Nothing here changes the live paper rules or places orders.</p>
  <details className="rounded border border-slate-700 p-3 text-sm"><summary className="font-semibold">Method and limits</summary>
   <ul className="list-disc space-y-1 pl-5 text-slate-300">
    <li><b>Universe:</b> a coin is replayed only on days it was in the top {c?.universeTop} by market cap that day (History data; stablecoins excluded, delisted included) and has a Coinbase USD pair whose daily closes agree with CoinGecko.</li>
    <li><b>Signals:</b> the live 4h rule on completed candles. Chase-limited (EXTENDED) setups are kept as skipped, with a hypothetical entry for comparison (live never enters them).</li>
    <li><b>Entry:</b> the live planner at the first hourly open inside the entry zone within 4h ({((c?.halfSpread??0)*100).toFixed(2)}% half-spread, {((c?.cost??0)*100).toFixed(2)}% fee and slippage per side). Live checks every 15 minutes with a live quote, so live fills can differ.</li>
    <li><b>Exits:</b> the live exit evaluator on 15-minute candles with the live 72h time stop (fixed 2R plan), MFE/MAE, and every shadow plan ({c?.shadowPlans.join(', ')}) over a {c?.horizonDays}-day horizon.</li>
    <li><b>Taken or skipped:</b> a chronological simulation of both paper books (live sleeve and research) through the live account gate: BTC-down filter ({s?.btcDownFilter?'on':'off'} at start), one position per correlation cluster on the live sleeve, cluster cap and risk scaling on research, position, daily and open-risk caps, and the 1% liquidity cap. <b>Approximations:</b> liquidity uses {c?.liquiditySource}; equity counts realised P&amp;L only (open positions at cost); the 4-entry cycle limit is applied per entry hour without the live retry; ties in the same hour are ordered by relative volume.</li>
    <li><b>Features</b> ({c?.featuresVersion}) use only candles completed at the signal close. Not available point-in-time, so recorded as missing (never estimated): {c&&Object.entries(c.unavailableFeatures).map(([k,v])=>`${k} (${v})`).join('; ')}.</li>
   </ul></details>
  <div className="flex flex-wrap items-center gap-3">
   <label className="text-sm">From <select aria-label="Replay start" value={from} onChange={e=>setFrom(e.target.value)} className="rounded border bg-slate-900 px-2 py-1">{START_OPTIONS.map(o=><option key={o}>{o}</option>)}</select></label>
   <button disabled={busy||running} onClick={()=>{if(!s||confirm('Start a new replay? The current dataset is replaced.'))void call('start',{from});}} className="rounded bg-cyan-800 px-3 py-2 disabled:opacity-50">{s?'Start again':'Start replay'}</button>
   {s?.status==='RUNNING'&&<button disabled={busy&&!running} onClick={()=>setRunning(v=>!v)} className="rounded border px-3 py-2">{running?'Pause':'Run batches while this tab is open'}</button>}
   {s&&s.status!=='RUNNING'&&<button disabled={busy} onClick={()=>void call('simulate')} className="rounded border px-3 py-2">{sim?'Simulate again':'Simulate books'}</button>}
  </div>
  <p className="text-xs text-slate-400">Requires the History data job. Uses no CoinGecko credits (universe from the database; candles from Coinbase&apos;s public API). A long replay needs many batches; progress is saved after every coin segment.</p>
  {busy&&<p>Working…</p>}{error&&<p role="alert" className="text-amber-300">{error}</p>}
  {s&&<p className="text-sm">{s.status.replace(/_/g,' ')} · segments {s.segments.done.toLocaleString()} / {s.segments.total.toLocaleString()} ({pct}%){s.segments.failed?` · ${s.segments.failed} failed`:''} · coins: {Object.entries(s.counts).map(([k,v])=>`${k} ${v}`).join(' · ')} · {s.requests.toLocaleString()} Coinbase requests{s.dropped?` · ${s.dropped} invalid candle rows dropped`:''} · {s.from} → data to {new Date(s.dataEnd).toLocaleString()} · updated {new Date(s.updatedAt).toLocaleString()}</p>}
  {!!s?.problems.length&&<details className="text-xs"><summary>Excluded or failed coins ({s.problems.length} shown)</summary><ul className="pl-5">{s.problems.map(p=><li key={p.coin}>{p.coin}: {p.status} {p.error??''}</li>)}</ul></details>}
  {d&&Number(d.total)>0&&<div className="space-y-2 text-sm">
   <p><b>{Number(d.total).toLocaleString()}</b> signals ({d.first_signal?new Date(d.first_signal).toISOString().slice(0,10):'—'} → {d.last_signal?new Date(d.last_signal).toISOString().slice(0,10):'—'}) · {Number(d.extended).toLocaleString()} chase-limited · {Number(d.no_entry).toLocaleString()} with no entry inside the zone{sim?<> · <b>{Number(d.taken).toLocaleString()}</b> taken · {Number(d.skipped).toLocaleString()} skipped</>:<> · not simulated yet</>}</p>
   {sim&&<p>Average fixed-plan R: taken {r2(d.taken_r)} · skipped confirmed setups {r2(d.skipped_r)} · chase-limited (hypothetical) {r2(d.extended_r)}</p>}
   {sim&&<div className="overflow-auto"><table className="min-w-[560px] text-left"><thead><tr>{['Book','Taken','Closed','Realised P&L','Final equity','Max drawdown','P&L unknown'].map(h=><th key={h} className="p-1">{h}</th>)}</tr></thead><tbody>
    {Object.entries(sim.summary).map(([k,b])=><tr key={k} className="border-t border-slate-800"><td className="p-1">{k==='live'?'Live sleeve':'Research'}</td><td className="p-1">{b.taken}</td><td className="p-1">{b.closed}</td><td className={`p-1 ${b.realisedPnl>0?'text-emerald-300':b.realisedPnl<0?'text-red-300':''}`}>{usd(b.realisedPnl)}</td><td className="p-1">{usd(b.finalEquity)}</td><td className="p-1">{b.maxDrawdownPct.toFixed(2)}%</td><td className="p-1" title="Taken trades whose 15m path had a data gap or was still open at the data end; released at the horizon with no P&L">{b.pnlUnknown}</td></tr>)}
   </tbody></table><p className="text-xs text-slate-400">Simulated {new Date(sim.at).toLocaleString()} · BTC-down filter {sim.btcDownFilter?'on':'off'} · equity is realised P&amp;L only.</p></div>}
   {sim&&!!d.skipReasons.length&&<details><summary>Top skip reasons</summary><ul className="pl-5 text-xs">{d.skipReasons.map(x=><li key={x.reason}>{Number(x.n).toLocaleString()} · {x.reason}</li>)}</ul></details>}
   <p><a className="underline" href="/api/admin/crypto-markets/replay?format=csv">Download the labelled dataset (CSV, one row per signal)</a>{!sim&&' · decisions are blank until the books are simulated'}</p>
  </div>}
 </section>;
}
