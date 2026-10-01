'use client';
import {useEffect,useState} from 'react';
import {publishPaperSnapshot,usePaperSnapshot} from './cryptoPaperSnapshot';
import {latestCryptoCycle} from '@/lib/admin/cryptoCycleReport';

type JournalEntry={title:string;createdAt:string;evidence?:string[]};
type Paper={portfolio:{status:string;unrealisedPnl:number}|null;positions:unknown[];journal:JournalEntry[]};
type ScanRow={id?:string;symbol?:string;stage:string;reason?:string;close?:number|null;entryFloor?:number;maxEntry?:number;kind?:string|null};
type Scan={startedAt:string;rows:ScanRow[]}|null;
type CycleDecision={coin?:string;status?:string;reason?:string;ask?:number};
type CycleCluster={coins?:string[];overCap?:boolean;riskUsd?:number;capUsd?:number};
export type BookHealth={
 positions:number|null;openPnl:number|null;
 cluster:'OVER CAP'|'INSIDE CAP'|'NOT RECORDED';
 clusterDetail:string;
 exits:'HEALTHY'|'UNHEALTHY'|'UNKNOWN';
};
/** cycle = the paper cycle refused a named setup; setup = a MOMENTUM_VOLUME close outside its zone; bucket = a VOLUME_WATCH/EXTENDED/UNAVAILABLE row that never qualified. */
export type BlockedSource='cycle'|'setup'|'bucket';
export type ScanDecision={
 stale:boolean;
 inZone:{symbol:string;kind:string|null}[];
 blocked:{symbol:string;reason:string;source:BlockedSource}[];
 health:BookHealth;
};

const money=(n:number)=>n.toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0});
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
function cycleReport(journal:JournalEntry[]|undefined):{decisions:CycleDecision[];clusters:CycleCluster[]|null;healthy:boolean|null;at:string|null}{
 const last=latestCryptoCycle(journal??[]);
 if(!last)return {decisions:[],clusters:null,healthy:null,at:null};
 try{
  const r=last.evidence?.[0]?JSON.parse(last.evidence[0]):null;
  return {
   decisions:Array.isArray(r?.decisions)?r.decisions:[],
   clusters:Array.isArray(r?.clusters)?r.clusters:null,
   healthy:typeof r?.monitorHealthy==='boolean'?r.monitorHealthy:null,
   at:last.createdAt,
  };
 }catch{return {decisions:[],clusters:null,healthy:null,at:last.createdAt};}
}
/** Pure: the 4-hour decision from the saved scan and the last paper cycle. No provider calls. */
export function scanDecision(paper:Paper|null,scan:Scan,now:number):ScanDecision{
 const F=4*3600000;
 const report=cycleReport(paper?.journal);
 const ask=new Map<string,number>();
 for(const d of report.decisions)if(d.coin&&finite(d.ask))ask.set(d.coin,d.ask);
 const inZone:{symbol:string;kind:string|null}[]=[];
 const blocked:ScanDecision['blocked']=[];
 const seen=new Set<string>();
 const mark=(s:string)=>s.toLowerCase();
 for(const d of report.decisions){
  if(d.status!=='BLOCKED'||!d.coin||seen.has(mark(d.coin)))continue;
  seen.add(mark(d.coin));
  blocked.push({symbol:d.coin,reason:d.reason?.trim()||'Blocked, no reason recorded',source:'cycle'});
 }
 for(const row of scan?.rows??[]){
  const symbol=row.symbol||row.id;
  if(!symbol)continue;
  const already=seen.has(mark(symbol))||seen.has(mark(row.id??''));
  const price=ask.get(row.id??symbol)??ask.get(symbol)??row.close;
  const inside=row.stage==='MOMENTUM_VOLUME'&&finite(price)&&finite(row.entryFloor)&&finite(row.maxEntry)&&row.entryFloor<=price&&price<=row.maxEntry;
  if(inside){if(!already)inZone.push({symbol,kind:row.kind??null});continue;}
  if(already)continue;
  const refused=row.stage==='EXTENDED'||row.stage==='VOLUME_WATCH'||row.stage==='UNAVAILABLE'||(row.stage==='MOMENTUM_VOLUME'&&finite(row.entryFloor)&&finite(row.maxEntry));
  if(refused){
   seen.add(symbol);
   blocked.push(row.stage==='MOMENTUM_VOLUME'?{symbol,reason:'Outside the entry zone',source:'setup'}:{symbol,reason:row.reason?.trim()||row.stage,source:'bucket'});
  }
 }
 const over=report.clusters?.filter(c=>c.overCap);
 const cluster:BookHealth['cluster']=!report.clusters?'NOT RECORDED':over?.length?'OVER CAP':'INSIDE CAP';
 const clusterDetail=!report.clusters?'Last cycle did not record a cluster check':over?.length
  ?over.map(c=>`${(c.coins??[]).join(', ')} · ${money(c.riskUsd??0)} of ${money(c.capUsd??0)}`).join(' · ')
  :'No open cluster is over its cap';
 const overdue=!!report.at&&now-Date.parse(report.at)>25*60000;
 const exits:BookHealth['exits']=report.healthy==null?'UNKNOWN':report.healthy&&!overdue?'HEALTHY':'UNHEALTHY';
 return {
  stale:!scan||Math.floor(Date.parse(scan.startedAt)/F)!==Math.floor(now/F),
  inZone,blocked,
  health:{
   positions:paper?.portfolio?paper.positions.length:null,
   openPnl:paper?.portfolio?paper.portfolio.unrealisedPnl:null,
   cluster,clusterDetail,exits,
  },
 };
}

/** Named setups the cycle or the zone refused are listed; rows that never qualified are grouped by reason so the list stays readable. */
function BlockedList({blocked}:{blocked:ScanDecision['blocked']}){
 const refused=blocked.filter(b=>b.source!=='bucket');
 const buckets=blocked.filter(b=>b.source==='bucket');
 const groups=new Map<string,string[]>();
 for(const b of buckets)groups.set(b.reason,[...(groups.get(b.reason)??[]),b.symbol]);
 const grouped=[...groups].sort((a,b)=>b[1].length-a[1].length);
 return <div>
  <h3 className="text-sm text-slate-400">Refused setups{refused.length?` (${refused.length})`:''}</h3>
  {refused.length
   ?<ul className="space-y-1 text-sm">{refused.map(c=><li key={c.symbol}><span className="font-medium">{c.symbol}</span> — {c.reason}</li>)}</ul>
   :<p className="text-sm">None. No named setup was refused on the last cycle or in the saved scan.</p>}
  {!!buckets.length&&<details className="mt-2 text-sm">
   <summary className="cursor-pointer text-slate-400">Not a setup · {buckets.length} coin{buckets.length===1?'':'s'} in {grouped.length} reason{grouped.length===1?'':'s'}</summary>
   <ul className="mt-1 space-y-1">{grouped.map(([reason,symbols])=><li key={reason}><span className="font-medium">{symbols.length}</span> · {reason}<div className="text-xs text-slate-400">{symbols.join(', ')}</div></li>)}</ul>
  </details>}
 </div>;
}

export default function CryptoAttentionStrip({now,refreshVersion=0}:{now:number;refreshVersion?:number;onOpen?:(tab:string)=>void}){
 const [data,setData]=useState<{paper:Paper|null;scan:Scan;loadedAt:number}|null>(null);
 useEffect(()=>{let c=new AbortController();
  const load=()=>{if(document.hidden)return;c.abort();c=new AbortController();const signal=c.signal;
   const get=(u:string)=>fetch(u,{cache:'no-store',signal}).then(async r=>r.ok?r.json():null).catch(()=>null);
   void Promise.all([get('/api/admin/crypto-markets/paper'),get('/api/admin/crypto-markets/momentum')]).then(([paper,m])=>{if(signal.aborted)return;if(paper)publishPaperSnapshot(paper);setData({paper,scan:m?.scan??null,loadedAt:Date.now()});});};
  load();const id=setInterval(load,60000);document.addEventListener('visibilitychange',load);
  return()=>{clearInterval(id);document.removeEventListener('visibilitychange',load);c.abort();};},[refreshVersion]);
 const shared=usePaperSnapshot();
 if(!data)return <p className="text-sm text-slate-400">Loading the 4-hour decision…</p>;
 const snapshotAge=Date.now()-data.loadedAt;
 const decision=scanDecision(shared&&shared.loadedAt>=data.loadedAt?shared.data:data.paper,data.scan,snapshotAge>180000?now:data.loadedAt);
 const h=decision.health;
 return <section aria-label="4-hour decision" className="space-y-3 rounded border border-slate-600 p-4">
  <h2 className="text-lg font-semibold">4-hour decision{decision.stale?' · STALE SCAN':''}</h2>
  <div>
   <h3 className="text-sm text-slate-400">Inside the entry zone</h3>
   {decision.inZone.length
    ?<p>{decision.inZone.map(c=>`${c.symbol}${c.kind?` ${c.kind}`:''}`).join(' · ')}</p>
    :<p>None. No saved 4-hour setup has its close inside the entry floor and chase limit.</p>}
  </div>
  <BlockedList blocked={decision.blocked}/>
  <div>
   <h3 className="text-sm text-slate-400">Book health · SIMULATED</h3>
   <p>{h.positions==null?'Open positions unavailable':`${h.positions} open`} · {h.openPnl==null?'Open P&L unavailable':`${money(h.openPnl)} open P&L`} · Cluster {h.cluster} · Exits {h.exits}</p>
   <p className="text-xs text-slate-400">{h.clusterDetail}{snapshotAge>180000?' · STALE SNAPSHOT':''}</p>
  </div>
 </section>;
}
