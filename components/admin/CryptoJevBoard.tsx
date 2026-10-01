'use client';
import {useEffect,useMemo,useState} from 'react';
import type {JevBoard,JevBoardRow,JevLedgerLine,JevReadStatus} from '@/lib/admin/cryptoJevBoard';
const OUTCOME:Record<JevLedgerLine['outcome'],string>={paperR:'Paper',forward24h:'Forward',baseR:'Base sleeve',backtestR:'Backtest'};
const STATUS:Record<JevReadStatus,{label:string;cls:string}>={
 scored:{label:'scored',cls:'text-emerald-300'},
 unavailable:{label:'unavailable',cls:'text-amber-300'},
 unstamped:{label:'not stamped',cls:'text-slate-400'},
 'no-headlines':{label:'no headlines',cls:'text-slate-300'},
};
type View='current'|'attention'|'forward';
function when(iso:string|null){if(!iso)return '—';const t=Date.parse(iso);return Number.isFinite(t)?new Date(t).toLocaleString():'—';}
function Prob({n,caution,plain}:{n:number|null;caution?:boolean;plain?:boolean}){
 if(n==null)return <span className="text-slate-500">—</span>;
 const hot=n>=0.5;
 const cls=plain?'text-slate-300':hot?caution?'text-amber-300':'text-emerald-300':'text-slate-300';
 return <span className={`tabular-nums ${cls}`} title={plain?'Recorded. This read repeats the entry rule and is not graded.':undefined}>{n.toFixed(2)}</span>;
}
function stampTitle(row:JevBoardRow){
 const parts=[`${row.symbol} · ${row.source}`];
 if(row.jev.checkedAt)parts.push(`shadow ${row.jev.checkedAt}`);
 if(row.jev.btcTrend)parts.push(`btc ${row.jev.btcTrend}`);
 if(row.jev.flowStamp)parts.push(`flow ${row.jev.flowStamp}`);
 if(row.jev.reason)parts.push(`shadow unavailable: ${row.jev.reason}`);
 if(row.chart.reason)parts.push(`chart unavailable: ${row.chart.reason}`);
 if(row.catalyst.reason)parts.push(`catalyst unavailable: ${row.catalyst.reason}`);
 return parts.join(' · ');
}
function needsLook(row:JevBoardRow){
 return row.jev.status==='unavailable'||row.chart.status==='unavailable'||row.catalyst.status==='unavailable';
}
function rowStatus(row:JevBoardRow):JevReadStatus{
 if(needsLook(row))return 'unavailable';
 if(row.jev.status==='unstamped'&&row.chart.status==='unstamped'&&row.catalyst.status==='unstamped')return 'unstamped';
 return 'scored';
}
function Count({label,c}:{label:string;c:JevBoard['coverage']['jev']}){
 return <div className="rounded border border-slate-700 p-3">
  <h3 className="text-sm font-semibold">{label}</h3>
  <p className="mt-1 text-sm tabular-nums">{c.scored} scored · {c.unavailable} unavailable · {c.unstamped} not stamped{c.noHeadlines?` · ${c.noHeadlines} no headlines`:''}</p>
 </div>;
}
export default function CryptoJevBoard({refreshVersion=0}:{refreshVersion?:number}){
 const [board,setBoard]=useState<JevBoard|null>(null),[error,setError]=useState(''),[view,setView]=useState<View>('current'),[query,setQuery]=useState('');
 useEffect(()=>{const c=new AbortController();
  void fetch('/api/admin/crypto-markets/jev',{cache:'no-store',signal:c.signal}).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error);if(!c.signal.aborted){setBoard(b);setError('');}}).catch(e=>{if(!c.signal.aborted&&e.name!=='AbortError')setError(e.message||'Saved Jev board unavailable');});
  return ()=>c.abort();
 },[refreshVersion]);
 const rows=useMemo(()=>{
  const q=query.trim().toLowerCase();
  return (board?.rows??[]).filter(row=>{
   if(view==='forward'?row.source!=='forward':row.source==='forward')return false;
   if(view==='attention'&&!needsLook(row))return false;
   return !q||`${row.symbol} ${row.stage} ${row.kind??''}`.toLowerCase().includes(q);
  });
 },[board,view,query]);
 const currentCount=board?.rows.filter(r=>r.source!=='forward').length??0;
 const attentionCount=board?.rows.filter(r=>r.source!=='forward'&&needsLook(r)).length??0;
 const forwardCount=board?.rows.filter(r=>r.source==='forward').length??0;
 return <section aria-label="Jev findings" className="space-y-4 rounded border border-slate-600 p-4">
  <h2 className="text-xl">Jev <span className="text-sm font-normal text-slate-400">· every saved stamp in one place</span></h2>
  <p className="text-sm text-slate-300">Shadow, chart, and catalyst answers already stored on the 4-hour scan, the 1-hour scan, and the forward book. A number is a probability from 0 to 1. Amber means a caution at or above 0.50: chase, Bitcoin headwind, or overhead supply. Green means flow, a clean base, or a strong close at or above 0.50. Volume stays plain because that read repeats the entry rule and is not graded. Opening this tab does not call Jev and does not open a trade.</p>
  {error&&<p role="alert" className="text-amber-300">{error}</p>}
  {!board&&!error&&<p>Loading saved Jev stamps…</p>}
  {board&&<>
   <p className="text-xs text-slate-400">4h scan {when(board.scans.fourAt)} · 1h scan {when(board.scans.earlyAt)} · forward book {when(board.scans.forwardAt)} · ledger {when(board.scans.ledgerAt)}</p>
   <div className="grid gap-3 md:grid-cols-3">
    <Count label="Shadow · chase, flow agrees, Bitcoin headwind" c={board.coverage.jev}/>
    <Count label="Chart · base, close, volume, overhead" c={board.coverage.chart}/>
    <Count label="Catalyst · last 48h of coin-tagged headlines" c={board.coverage.catalyst}/>
   </div>
   <div className="flex flex-wrap items-center gap-2">
    {([['current',`Current setups (${currentCount})`],['attention',`Needs a look (${attentionCount})`],['forward',`Forward history (${forwardCount})`]] as const).map(([id,label])=><button key={id} type="button" aria-pressed={view===id} onClick={()=>setView(id)} className={`rounded px-3 py-1.5 text-sm ${view===id?'bg-slate-700 font-semibold':'border border-slate-600 text-slate-300'}`}>{label}</button>)}
    <input aria-label="Find a Jev stamp" placeholder="Find a symbol" value={query} onChange={e=>setQuery(e.target.value)} className="rounded border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm"/>
   </div>
   {!rows.length&&<p className="text-sm text-slate-400">{view==='forward'?'No saved forward row carries a Jev stamp yet.':view==='attention'?'No current stamp is unavailable.':'No named setups in the saved scans yet.'}</p>}
   {!!rows.length&&<div className="max-h-[36rem] overflow-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="sticky top-0 bg-slate-950"><tr>{['Coin','Where','Setup','Chase','Flow','BTC','Base','Close','Volume','Overhead','Catalyst','Shadow','Status'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>
    {rows.map(row=>{const status=rowStatus(row);return <tr key={row.key} className="border-t border-slate-700 align-top" title={stampTitle(row)}>
     <td className="p-2 font-medium">{row.symbol}</td>
     <td className="p-2 whitespace-nowrap">{row.source}</td>
     <td className="p-2 whitespace-nowrap">{row.stage}{row.kind?<div className="text-xs text-slate-400">{row.kind}</div>:null}</td>
     <td className="p-2"><Prob n={row.jev.chase} caution/></td>
     <td className="p-2"><Prob n={row.jev.flowAgrees}/></td>
     <td className="p-2"><Prob n={row.jev.btcHeadwind} caution/></td>
     <td className="p-2"><Prob n={row.chart.cleanBase}/></td>
     <td className="p-2"><Prob n={row.chart.strongClose}/></td>
     <td className="p-2"><Prob n={row.chart.volumeExpansion} plain/></td>
     <td className="p-2"><Prob n={row.chart.overheadSupply} caution/></td>
     <td className="p-2 text-xs">{row.catalyst.status==='scored'?`${row.catalyst.headlines??0} headline${row.catalyst.headlines===1?'':'s'}${row.catalyst.flags?` · ${row.catalyst.flags}`:''}`:STATUS[row.catalyst.status].label}{row.catalyst.reason?<div className="text-amber-300">{row.catalyst.reason}</div>:null}</td>
     <td className={`p-2 tabular-nums ${row.shadow==null?'text-slate-500':row.shadow>0?'text-emerald-300':row.shadow<0?'text-red-300':'text-slate-300'}`}>{row.shadow==null?'—':`${row.shadow>0?'+':''}${row.shadow.toFixed(2)}`}</td>
     <td className={`p-2 text-xs ${STATUS[status].cls}`}>{STATUS[status].label}{status==='unavailable'&&row.jev.reason?<div>{row.jev.reason}</div>:null}{status==='unavailable'&&row.chart.reason?<div>chart {row.chart.reason}</div>:null}</td>
    </tr>;})}
   </tbody></table></div>}
   <div className="space-y-2">
    <h3 className="text-sm font-semibold">What the saved ledger says about these reads</h3>
    <p className="text-xs text-slate-400">Same ledger as Learning, limited to shadow, chart, catalyst, and the composite score. Chase and volume expansion are recorded and not graded: they repeat the entry rule. A side under 30 rows stays collecting. Nothing here is a win rate.</p>
    {!board.ledger.length&&<p className="text-sm text-slate-400">No Jev ledger lines saved yet. Recompute on Learning writes them.</p>}
    {!!board.ledger.length&&<div className="max-h-[24rem] overflow-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="sticky top-0 bg-slate-950"><tr>{['Book','Read','Side','Rows','Lift','Status'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>
     {board.ledger.map(line=><tr key={`${line.outcome}|${line.field}|${line.side}`} className="border-t border-slate-700">
      <td className="p-2">{OUTCOME[line.outcome]}</td>
      <td className="p-2">{line.label}<div className="text-xs text-slate-500">{line.field}</div></td>
      <td className="p-2">{line.side}{line.informational?<span className="text-slate-500"> · not graded</span>:null}</td>
      <td className="p-2 tabular-nums">{line.n}</td>
      <td className={`p-2 tabular-nums ${line.lift==null?'':line.lift>0?'text-emerald-300':'text-red-300'}`}>{line.lift==null?'—':`${line.lift>=0?'+':''}${line.lift.toFixed(2)}${line.unit}`}</td>
      <td className="p-2">{line.informational?'not graded':line.status}</td>
     </tr>)}
    </tbody></table></div>}
   </div>
  </>}
 </section>;
}
