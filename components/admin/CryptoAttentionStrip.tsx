'use client';
import {useEffect,useState} from 'react';
type Chip={label:string;value:string;tone:'ok'|'warn'|'bad'|'info';detail:string};
type Paper={portfolio:{status:string;unrealisedPnl:number}|null;positions:unknown[];reconciliation?:{status:string;checkedAt:string};journal:{title:string;createdAt:string;evidence?:string[]}[]};
type Scan={startedAt:string;rows:{stage:string}[]}|null;
type Ops={operations?:{state?:{checkedAt:string;healthy:boolean;issues:string[]}}};
const ago=(at:string,now:number)=>{const m=Math.round((now-Date.parse(at))/60000);return m<60?`${m} min ago`:`${Math.round(m/60)} h ago`;};
const money=(n:number)=>n.toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0});
/** Pure: turns saved dashboard data into attention chips. Missing inputs become explicit UNAVAILABLE chips. */
export function attentionChips(paper:Paper|null,scan:Scan,ops:Ops|null,now:number):Chip[]{
 const chips:Chip[]=[];
 if(!paper)chips.push({label:'Paper account',value:'UNAVAILABLE',tone:'bad',detail:'Saved paper ledger could not be read'});
 else if(!paper.portfolio)chips.push({label:'Paper account',value:'NOT ENABLED',tone:'info',detail:'Enable it in the Paper account tab'});
 else{
  const last=paper.journal.find(j=>j.title==='Crypto paper cycle completed');
  let healthy:boolean|null=null;try{healthy=last?.evidence?.[0]?JSON.parse(last.evidence[0]).monitorHealthy!==false:null;}catch{healthy=null;}
  const overdue=!last||now-Date.parse(last.createdAt)>25*60000;
  chips.push({label:'Last cycle',value:last?(overdue?'OVERDUE':ago(last.createdAt,now)):'NONE YET',tone:overdue?'bad':'ok',detail:last?`Paper cycle journal · ${new Date(last.createdAt).toLocaleString()}`:'No completed cycle recorded'});
  chips.push({label:'Exit monitoring',value:healthy==null?'UNKNOWN':healthy?'HEALTHY':'UNHEALTHY — entries blocked',tone:healthy==null?'warn':healthy?'ok':'bad',detail:'From the latest cycle report'});
  chips.push({label:'Open positions',value:`${paper.positions.length} · ${money(paper.portfolio.unrealisedPnl)}`,tone:'info',detail:`Entries ${paper.portfolio.status} · open P&L before exit costs, marked at last cycle`});
  if(paper.reconciliation)chips.push({label:'Ledger check',value:paper.reconciliation.status,tone:paper.reconciliation.status==='MATCHED'?'ok':'bad',detail:`Reconciliation · ${new Date(paper.reconciliation.checkedAt).toLocaleString()}`});
 }
 const F=4*3600000,current=scan&&Math.floor(Date.parse(scan.startedAt)/F)===Math.floor(now/F);
 chips.push({label:'Confirmed 4h setups',value:!scan?'NO SCAN':current?String(scan.rows.filter(r=>r.stage==='MOMENTUM_VOLUME').length):'STALE SCAN',tone:!scan||!current?'warn':'info',detail:scan?`Momentum scan started ${new Date(scan.startedAt).toLocaleString()}${scan.rows.some(r=>r.stage==='PENDING')?' · still scanning':''}`:'No saved 4h scan'});
 const st=ops?.operations?.state;
 chips.push({label:'Ops health',value:!st?'NOT CHECKED':now-Date.parse(st.checkedAt)>25*60000?'OVERDUE':st.healthy?'HEALTHY':'ATTENTION',tone:!st?'warn':now-Date.parse(st.checkedAt)>25*60000||!st.healthy?'bad':'ok',detail:st?`${st.issues.join('; ')||'No issues'} · ${new Date(st.checkedAt).toLocaleString()}`:'Scheduled cycle health not recorded'});
 return chips;
}
const tones={ok:'border-emerald-700 text-emerald-200',warn:'border-amber-600 text-amber-200',bad:'border-red-600 text-red-200',info:'border-slate-600 text-slate-200'};
export default function CryptoAttentionStrip({now,refreshVersion=0,onOpen}:{now:number;refreshVersion?:number;onOpen?:(tab:string)=>void}){
 const [data,setData]=useState<{paper:Paper|null;scan:Scan;ops:Ops|null}|null>(null);
 useEffect(()=>{const c=new AbortController();const get=(u:string)=>fetch(u,{cache:'no-store',signal:c.signal}).then(async r=>r.ok?r.json():null).catch(()=>null);
  // Saved data only: these GET routes never call providers.
  void Promise.all([get('/api/admin/crypto-markets/paper'),get('/api/admin/crypto-markets/momentum'),get('/api/admin/crypto-markets/setup-email')]).then(([paper,m,ops])=>{if(!c.signal.aborted)setData({paper,scan:m?.scan??null,ops});});
  return()=>c.abort();},[refreshVersion]);
 if(!data)return <p className="text-sm text-slate-400">Loading attention summary…</p>;
 const chips=attentionChips(data.paper,data.scan,data.ops,now);
 return <section aria-label="Needs attention" className="flex flex-wrap gap-2">
  {chips.map(c=><button key={c.label} type="button" title={c.detail} onClick={()=>onOpen?.(c.label==='Confirmed 4h setups'?'setups':c.label==='Ops health'?'alerts':'paper')} className={`rounded border px-3 py-2 text-left text-sm ${tones[c.tone]}`}>
   <span className="block text-xs text-slate-400">{c.label}</span>{c.value}</button>)}
 </section>;
}
