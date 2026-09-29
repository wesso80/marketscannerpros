'use client';
import {useEffect,useRef,useState} from 'react';
import type {RotationResult} from '@/lib/admin/cryptoRotationData';
type Result=Omit<RotationResult,'trades'>&{tradeCount:number};
type View={state:{rules:string;status:'FETCHING'|'DATA_COMPLETE';startedAt:string;updatedAt:string;fromDay:number;toDay:number;requests:number;droppedRows:number;productListCounts:Record<string,number>;counts:{products:number;done:number;failed:number;withHistory:number};failures:{product:string;error?:string}[]}|null;result:Result|null;error?:string};
const pct=(n:number|null|undefined,d=0)=>n==null?'—':`${n>=0&&d?'+':''}${(n*100).toFixed(d)}%`;
const num=(n:number|null|undefined)=>n==null?'—':n.toFixed(2);
// Categorical slots 1–4 (validated on the dark admin surface #0f172a); fixed per series, never by rank.
const SERIES=[['rotation-0.003','Rotation (0.3% cost)','Rotation','#3987e5'],['btc-hold','Hold BTC','BTC','#d95926'],['equal-weight','Equal-weight universe','Equal wt','#199e70'],['rotation-no-regime','Rotation, no BTC switch','No switch','#c98500']] as const;
export function EquityChart({result}:{result:Result}){
 const [hover,setHover]=useState<number|null>(null);
 const lines=SERIES.map(([k,label,short,color])=>({label,short,color,pts:result.strategies.find(s=>s.key===k)?.curve??[]})).filter(l=>l.pts.length>1);
 if(!lines.length)return null;
 const W=760,H=300,L=56,R=120,T=12,B=28,all=lines.flatMap(l=>l.pts);
 const t0=Math.min(...all.map(p=>p.t)),t1=Math.max(...all.map(p=>p.t)),lo=Math.log(Math.min(...all.map(p=>p.v))*.9),hi=Math.log(Math.max(...all.map(p=>p.v))*1.1);
 const x=(t:number)=>L+(t-t0)/(t1-t0)*(W-L-R),y=(v:number)=>T+(hi-Math.log(v))/(hi-lo)*(H-T-B);
 const ticks=[.25,.5,1,2,4,8,16].filter(v=>Math.log(v)>lo&&Math.log(v)<hi),split=result.periods[1]?.from;
 const years=Array.from({length:new Date(t1).getUTCFullYear()-new Date(t0).getUTCFullYear()+1},(_,k)=>Date.UTC(new Date(t0).getUTCFullYear()+k,0,1)).filter(t=>t>=t0&&t<=t1);
 // End labels sorted by height and pushed at least 14px apart so they never overlap.
 const ends=lines.map(l=>({l,y:y(l.pts.at(-1)!.v)})).sort((a,b)=>a.y-b.y);for(let k=1;k<ends.length;k++)ends[k].y=Math.max(ends[k].y,ends[k-1].y+14);
 const at=hover==null?null:lines.map(l=>({...l,p:l.pts.reduce((b,p)=>Math.abs(p.t-hover)<Math.abs(b.t-hover)?p:b)}));
 return <figure className="space-y-1">
  <figcaption className="text-sm font-semibold">Growth of $1 (log scale) · weekly points · after 0.3% cost per side</figcaption>
  <div className="flex flex-wrap gap-3 text-xs text-slate-300" aria-label="Legend">{lines.map(l=><span key={l.label} className="flex items-center gap-1"><span className="inline-block h-0.5 w-4" style={{background:l.color}} />{l.label}</span>)}</div>
  <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-4xl" role="img" aria-label="Equity curves; exact figures are in the tables below"
   onMouseMove={e=>{const r=e.currentTarget.getBoundingClientRect(),px=(e.clientX-r.left)/r.width*W;setHover(px<L||px>W-R?null:t0+(px-L)/(W-L-R)*(t1-t0));}} onMouseLeave={()=>setHover(null)}>
   {ticks.map(v=><g key={v}><line x1={L} x2={W-R} y1={y(v)} y2={y(v)} stroke="#334155" strokeWidth={1} /><text x={L-6} y={y(v)+4} textAnchor="end" fontSize={11} fill="#94a3b8">${v}</text></g>)}
   {years.map(t=><text key={t} x={x(t)} y={H-8} textAnchor="middle" fontSize={11} fill="#94a3b8">{new Date(t).getUTCFullYear()}</text>)}
   {split&&split>t0&&split<t1&&<g><line x1={x(split)} x2={x(split)} y1={T} y2={H-B} stroke="#64748b" strokeDasharray="4 4" /><text x={x(split)+4} y={T+10} fontSize={11} fill="#cbd5e1">out-of-sample →</text></g>}
   {lines.map(l=><polyline key={l.label} fill="none" stroke={l.color} strokeWidth={2} strokeLinejoin="round" points={l.pts.map(p=>`${x(p.t)},${y(p.v)}`).join(' ')} />)}
   {ends.map(({l,y:ly})=><text key={l.label} x={W-R+6} y={ly+4} fontSize={11} fill="#e2e8f0"><tspan fill={l.color}>■ </tspan>{l.short} ${l.pts.at(-1)!.v.toFixed(2)}</text>)}
   {at&&<g><line x1={x(at[0].p.t)} x2={x(at[0].p.t)} y1={T} y2={H-B} stroke="#94a3b8" />{at.map(a=><circle key={a.label} cx={x(a.p.t)} cy={y(a.p.v)} r={4} fill={a.color} stroke="#0f172a" strokeWidth={2} />)}</g>}
  </svg>
  {at&&<div className="rounded border border-slate-700 bg-slate-900 p-2 text-xs" role="status">{new Date(at[0].p.t).toISOString().slice(0,10)} · {at.map(a=><span key={a.label} className="mr-3"><span style={{color:a.color}}>■</span> {a.label}: ${a.p.v.toFixed(2)}</span>)}</div>}
 </figure>;
}
export default function CryptoRotation({refreshVersion=0}:{refreshVersion?:number}){
 const [data,setData]=useState<View|null>(null),[running,setRunning]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true);
 async function call(action?:'start'|'next'|'compute'){
  const r=await fetch('/api/admin/crypto-markets/rotation',{method:action?'POST':'GET',cache:'no-store',...(action?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action})}:{})}),b=await r.json();
  if(b.state!==undefined&&alive.current)setData(b);
  if(r.status===429)return b as View;if(!r.ok)throw Error(b.error||'Rotation lab unavailable');return b as View;
 }
 useEffect(()=>{alive.current=true;void call().catch(e=>setError((e as Error).message));return()=>{alive.current=false;};},[refreshVersion]);
 // Fetches history only while this tab is visible; progress is saved server-side. Runs the simulation once history is complete.
 useEffect(()=>{
  if(!running)return;let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
  const step=async()=>{
   if(cancelled)return;if(document.hidden){setRunning(false);return;}
   setBusy(true);setError('');
   try{
    let b=await call('next');
    if(!cancelled&&b.state?.status==='DATA_COMPLETE'&&!b.result){b=await call('compute');setRunning(false);}
    else if(!cancelled&&b.state?.status==='FETCHING')timer=setTimeout(()=>void step(),1500);else setRunning(false);
   }catch(e){if(!cancelled){setError((e as Error).message);setRunning(false);}}
   finally{if(alive.current)setBusy(false);}
  };
  void step();return()=>{cancelled=true;if(timer)clearTimeout(timer);};
 },[running]);
 async function start(){if(data?.result&&!confirm('Start again? This replaces the saved history and results.'))return;setBusy(true);setError('');try{await call('start');setRunning(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const s=data?.state,r=data?.result,c=s?.counts;
 return <section aria-label="Crypto rotation lab" className="space-y-3 rounded border border-sky-700 p-4">
  <h2 className="text-xl">Relative-strength rotation lab · SIMULATED · RESEARCH ONLY</h2>
  <p className="text-sm">A separate research system, not the paper account. It never places or routes orders. It tests a weekly rotation from 2022 onward on Coinbase daily candles, against holding BTC and an equal-weight basket.</p>
  <details className="rounded border border-slate-700 p-3" open={!r}><summary className="font-semibold">Rules (rotation-v1, fixed before the first run)</summary><ul className="list-disc space-y-1 pl-5 text-sm">
   <li><b>Switch:</b> invested only while BTC's daily close is above its 200-day average; otherwise everything is sold and held as cash.</li>
   <li><b>Universe each week:</b> the 50 Coinbase USD coins with the highest median 30-day dollar volume (at least $1m a day, at least 120 days of candles). Stablecoins and wrapped coins excluded. Coinbase's list of delisted pairs is included when it still serves their history.</li>
   <li><b>Ranking:</b> average of the 30-, 60- and 90-day returns, divided by 90-day daily volatility. Only candles completed at the decision close.</li>
   <li><b>Entries (Monday close):</b> fill empty slots, up to 6 holdings, with the best-ranked coins that have a positive score and close above their 20-day average. Each slot is 1/6 of equity, reduced for coins more volatile than 4% a day. No leverage.</li>
   <li><b>Exits:</b> daily close below the 20-day average, rank worse than 12 at the weekly check, or the BTC switch turning off. All fills at the next day's open.</li>
   <li><b>Costs:</b> fee plus slippage per side, reported at 0.1%, 0.3% (primary) and 0.6%.</li>
   <li><b>Periods:</b> 2022–2024 is the design period; 2025 onward is out-of-sample. Changing a rule creates a new version, reported separately.</li>
   <li><b>Not in phase 1:</b> funding-rate skip (no free full history), the 4-hour parabolic trailing stop and the hybrid 4-hour entry (phase 2).</li>
  </ul></details>
  <div className="flex flex-wrap gap-3">
   <button disabled={busy||running} onClick={()=>void start()} className="rounded bg-sky-800 px-3 py-2 disabled:opacity-50">{s?'Start again':'Start rotation lab'}</button>
   {s?.status==='FETCHING'&&<button disabled={busy} onClick={()=>setRunning(v=>!v)} className="rounded border px-3 py-2">{running?'Pause':'Resume fetching'}</button>}
   {s?.status==='DATA_COMPLETE'&&!r&&<button disabled={busy} onClick={()=>{setBusy(true);void call('compute').catch(e=>setError((e as Error).message)).finally(()=>setBusy(false));}} className="rounded border px-3 py-2">Run simulation</button>}
  </div>
  <p className="text-xs text-slate-400">Fetches about 4 coins per batch and roughly 7 Coinbase requests per coin; a full history load takes several minutes and needs this tab open. Pausing keeps progress.</p>
  {busy&&<p>Working…</p>}{error&&<p role="alert" className="text-amber-300">{error}</p>}
  {s&&c&&<p className="text-sm">{s.status==='DATA_COMPLETE'?'HISTORY COMPLETE':'FETCHING HISTORY'} · {s.rules} · products {c.done+c.failed}/{c.products}{c.failed?` · ${c.failed} failed`:''} · {c.withHistory} with candles · {new Date(s.fromDay).toISOString().slice(0,10)} → {new Date(s.toDay).toISOString().slice(0,10)} · Coinbase product list status: {Object.entries(s.productListCounts).map(([k,v])=>`${k} ${v}`).join(', ')} · {s.requests} requests · invalid rows dropped {s.droppedRows} · updated {new Date(s.updatedAt).toLocaleString()}</p>}
  {!!s?.failures.length&&<details className="text-xs"><summary>Failed products ({s.failures.length} shown)</summary><ul className="pl-5">{s.failures.map(f=><li key={f.product}>{f.product}: {f.error}</li>)}</ul></details>}
  {r&&<>
   <details className="rounded border border-amber-800 p-3" open><summary className="font-semibold">Integrity findings (read before trusting results)</summary><ul className="list-disc space-y-1 pl-5 text-sm">
    <li><b>{r.counts.nonOnlineWithHistory?'MEDIUM':'HIGH'} · Survivorship bias:</b> {r.counts.nonOnlineWithHistory} of {r.counts.withHistory} coins with history are no longer online on Coinbase. Coins Coinbase no longer lists at all cannot be included, so results may still be optimistic.</li>
    <li><b>MEDIUM · Fills:</b> daily opens with the stated cost; no order-book depth. Weekly turnover makes the 0.6% row the realistic one for small Coinbase accounts.</li>
    <li><b>MEDIUM · Data gaps:</b> {r.counts.dataEndedExits} positions closed at their last close after candles stopped (DATA_ENDED) · {r.counts.unfilledEntries} entries unfilled (no open) · {r.counts.regimeUnknownDays} days with the BTC switch unavailable (no new entries).</li>
    <li><b>LOW · One version:</b> {r.rules.version}. If the out-of-sample result is poor, that is the answer; tuning the rules afterwards would be fitting.</li>
   </ul></details>
   <EquityChart result={r} />
   {r.periods.map((p,k)=><div key={p.label} className="overflow-auto">
    <h3 className="mt-2 text-sm font-semibold">{p.label}{r.strategies[0].metrics[k]?` · ${r.strategies[0].metrics[k]!.from.slice(0,10)} → ${r.strategies[0].metrics[k]!.to.slice(0,10)}`:''}</h3>
    <table className="w-full min-w-[760px] text-left text-sm"><thead><tr>{['Strategy','Total return','CAGR','Max drawdown','Volatility (ann.)','Sharpe','Time invested'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead>
     <tbody>{r.strategies.map(st=>{const m=st.metrics[k];return <tr key={st.key} className="border-t border-slate-700"><td className="p-2">{st.label}</td><td className="p-2">{pct(m?.totalReturn,1)}</td><td className="p-2">{pct(m?.cagr,1)}</td><td className="p-2">{pct(m?.maxDrawdown,1)}</td><td className="p-2">{pct(m?.annVol)}</td><td className="p-2">{num(m?.sharpe)}</td><td className="p-2">{pct(m?.timeInMarket)}</td></tr>;})}</tbody></table>
    {(()=>{const t=r.tradeStats[k];return t&&<p className="text-xs text-slate-400">Primary rotation trades entered in this period: {t.trades} · win rate {pct(t.winRate)} · average {pct(t.avgReturn,1)} per trade after costs · average hold {t.avgHoldDays?.toFixed(0)??'—'} days · best {pct(t.best,0)} · worst {pct(t.worst,0)} · top 3 trades = {pct(t.top3ShareOfGains)} of all gains · exits: {Object.entries(t.byReason).map(([a,b])=>`${a} ${b}`).join(', ')}</p>;})()}
   </div>)}
   <p className="text-sm"><a className="underline" href="/api/admin/crypto-markets/rotation?format=csv">Download rotation trades (CSV, {r.tradeCount} trades)</a> · computed {new Date(r.computedAt).toLocaleString()} · data through {r.dataThrough.slice(0,10)} · source Coinbase public daily candles</p>
  </>}
 </section>;
}
