'use client';
import {useEffect,useRef,useState} from 'react';
import type {CryptoPaperStats as Stats,CryptoStatsGroup,ExitPlanComparison} from '@/lib/admin/cryptoPaperStats';
import CryptoPaperStats,{Table} from './CryptoPaperStats';
type Counts={markedAtHorizon?:number;filledBars?:number;tradesWithFilledBars?:number;coins:number;done:number;failed:number;signals:number;noEntry:number;overlapping:number;trades:number;openAtHorizon:number;dataGaps:number;requests:number;droppedRows:number};
type View={state:{status:'RUNNING'|'COMPLETE';startedAt:string;updatedAt:string;from:string;to:string;universeAt:string;coins:{id:string;product:string;status:string;error?:string}[]}|null;summary:{endDaysAgo?:number;regimes?:{byBtc200:CryptoStatsGroup[];byBreadth:CryptoStatsGroup[];byGate:CryptoStatsGroup[]};stats:Stats;halves:CryptoStatsGroup[];exitPlans:ExitPlanComparison;counts:Counts}|null};
export default function CryptoBacktest({refreshVersion=0}:{refreshVersion?:number}){
 const [windowOffset,setWindowOffset]=useState(0);
 const [data,setData]=useState<View|null>(null),[running,setRunning]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true);
 async function call(action?:'start'|'next'){
  const r=await fetch('/api/admin/crypto-markets/backtest',{method:action?'POST':'GET',cache:'no-store',...(action?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action,endDaysAgo:windowOffset})}:{})}),b=await r.json();
  if(b.state!==undefined&&alive.current)setData(b);
  if(r.status===429)return b as View;
  if(!r.ok)throw Error(b.error||'Backtest unavailable');
  return b as View;
 }
 useEffect(()=>{alive.current=true;void call().catch(e=>setError((e as Error).message));return()=>{alive.current=false;};},[refreshVersion]);
 // Advances batches only while this tab is visible; progress is saved server-side and resumes on the next click.
 useEffect(()=>{
  if(!running)return;let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
  const step=async()=>{
   if(cancelled)return;if(document.hidden){setRunning(false);return;}
   setBusy(true);setError('');
   try{const b=await call('next');if(!cancelled&&b.state?.status==='RUNNING')timer=setTimeout(()=>void step(),2000);else setRunning(false);}
   catch(e){if(!cancelled){setError((e as Error).message);setRunning(false);}}
   finally{if(alive.current)setBusy(false);}
  };
  void step();return()=>{cancelled=true;if(timer)clearTimeout(timer);};
 },[running]);
 async function start(){setBusy(true);setError('');try{await call('start');setRunning(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const s=data?.state,sum=data?.summary,c=sum?.counts;
 return <section aria-label="Crypto momentum backtest" className="space-y-3 rounded border border-amber-700 p-4">
  <h2 className="text-xl">Momentum backtest · SIMULATED · RESEARCH ONLY</h2>
  <p>Replays the live 4h momentum entry rules and both exit plans on the last 90 days of Coinbase USD candles, for up to 40 coins from the saved discovery universe. It uses the same entry, exit and shadow code as the paper account, and only candles completed at each decision. Rules are the live rules; nothing is tuned to this data.</p>
  <div className="flex flex-wrap gap-3">
   <select aria-label="Backtest window" disabled={busy||running} value={windowOffset} onChange={e=>setWindowOffset(Number(e.target.value))} className="rounded border bg-slate-900 px-2"><option value={0}>Last 90 days</option><option value={90}>Previous 90 days (ends 90 days ago)</option><option value={180}>90 days ending 180 days ago</option></select>
   <button disabled={busy||running} onClick={()=>void start()} className="rounded bg-amber-800 px-3 py-2 disabled:opacity-50">{s?'Start new backtest':'Start backtest'}</button>
   {s?.status==='RUNNING'&&<button disabled={busy} onClick={()=>setRunning(r=>!r)} className="rounded border px-3 py-2">{running?'Pause':'Resume backtest'}</button>}
  </div>
  <p className="text-xs text-slate-400">About 3 coins per batch and roughly 10–40 Coinbase requests per coin; a full run takes several minutes and needs this tab open. Pausing keeps progress.</p>
  {busy&&<p>Running backtest batch…</p>}{error&&<p role="alert" className="text-amber-300">{error}</p>}
  {s&&c&&<>
   <p>{s.status==='COMPLETE'?'COMPLETE':'IN PROGRESS'} · {sum.endDaysAgo?`window ending ${sum.endDaysAgo} days ago`:'latest window'} · coins {c.done}/{c.coins} done{c.failed?` · ${c.failed} failed`:''} · window {s.from.slice(0,10)} → {s.to.slice(0,10)} · universe from discovery {new Date(s.universeAt).toLocaleString()} · updated {new Date(s.updatedAt).toLocaleString()} · source Coinbase public candles ({c.requests} requests)</p>
   <p className="text-sm">Signals {c.signals} · traded {c.trades} · no valid entry within 4h {c.noEntry} · skipped while a trade was open in that coin {c.overlapping} · marked at 7-day horizon or window end {c.markedAtHorizon??0} · still unresolved (excluded) {c.openAtHorizon} · 15m data gaps over 2h (excluded) {c.dataGaps} · no-trade 15m candles filled flat {c.filledBars??0} across {c.tradesWithFilledBars??0} trades · invalid candle rows dropped {c.droppedRows}</p>
   <details className="rounded border border-slate-700 p-3"><summary>Integrity findings (read before trusting results)</summary><ul className="list-disc space-y-1 pl-5 text-sm">
    <li><b>HIGH · Survivorship bias:</b> the universe is coins liquid on Coinbase today. Coins that collapsed or were delisted in the window are missing, so results are likely optimistic.</li>
    <li><b>MEDIUM · Fills:</b> historical bid/ask is unavailable. Entries assume a 0.05% half-spread at the first in-zone hourly open, plus 0.05% slippage and 0.05% fees per side. The live system checks real order books every 15 minutes.</li>
    <li><b>MEDIUM · Independent trades:</b> no portfolio, cash, correlation or daily caps; one position per coin at a time. Account-level drawdown is not modelled; judge by R per trade.</li>
    <li><b>MEDIUM · Coinbase only:</b> OKX USDT pairs traded by the paper account are not included.</li>
    <li><b>LOW · No-trade candles:</b> Coinbase omits 15m candles with no trades. Runs of up to 8 missing candles (2h) between real candles are filled flat at the prior close, the same rule as live exits; longer gaps exclude the trade. A later real candle that opens away from that close is treated as a gap at its open.</li>
    <li><b>MEDIUM · Regime breadth uses today's universe:</b> breadth is measured over the coins in this backtest, so past bear-market breadth may be overstated by missing delisted coins.</li>
    <li><b>LOW · Horizon:</b> fixed-plan trades that hit neither stop nor target within 7 days (or before the window ends) are marked at that completed close ({c.markedAtHorizon??0}) instead of dropped. Shadow trails still running at 7 days are closed at that candle's close (HORIZON) so long winners are not dropped.</li>
    <li><b>INFO · No lookahead:</b> signals, entries, exits, trails and the BTC trend use only candles completed before each decision. Rules were not fitted to this window; compare the two halves below for stability.</li>
    <li><b>Re-test before relying on it:</b> a different 90-day window, a universe that includes delisted coins, and live spreads.</li>
   </ul></details>
   <p><a href="/api/admin/crypto-markets/backtest?format=csv" className="underline">Download backtest trades (CSV)</a></p>
   {!!sum.halves.length&&<Table title="Stability: first vs second half of window" rows={sum.halves} />}
   {sum.regimes&&<div className="space-y-1 rounded border border-amber-800 p-3">
    <h3 className="font-semibold">Bull/bear regime test (definitions fixed before testing)</h3>
    <p className="text-xs text-slate-400">BTC 200-day regime: BULL when the daily close is above the 200-day average and the 50-day is above the 200-day; BEAR when both are below; otherwise TRANSITION. Breadth: share of this backtest's coins above their own 50-day average. Bull gate ON = BTC BULL and breadth ≥ 50%. All from daily candles completed before each signal. Compare windows before enabling any gate.</p>
    <Table title="By bull gate" rows={sum.regimes.byGate} />
    <Table title="By BTC 200-day regime" rows={sum.regimes.byBtc200} />
    <Table title="By altcoin breadth" rows={sum.regimes.byBreadth} />
   </div>}
   <CryptoPaperStats stats={sum.stats} exitPlans={sum.exitPlans} title="Backtest statistics" source={`backtest trades on Coinbase history, 1R = $500 (0.25% of $200k)`} />
  </>}
 </section>;
}
