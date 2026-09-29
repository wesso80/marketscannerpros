'use client';
import {useEffect,useState} from 'react';
type Chip={label:string;value:string;tone:'ok'|'warn'|'bad'|'info';detail:string;reasons?:string[]};
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
  let healthy:boolean|null=null,reasons:string[]=[];
  try{const r=last?.evidence?.[0]?JSON.parse(last.evidence[0]):null;healthy=r?r.monitorHealthy!==false:null;
   // The cycle's own notes name each position that could not be verified; nothing is inferred when they are absent.
   reasons=Array.isArray(r?.notes)?r.notes.filter((n:unknown):n is string=>typeof n==='string'&&/entries blocked/i.test(n)):[];}catch{healthy=null;}
  const overdue=!last||now-Date.parse(last.createdAt)>25*60000;
  chips.push({label:'Last cycle',value:last?(overdue?'OVERDUE':ago(last.createdAt,now)):'NONE YET',tone:overdue?'bad':'ok',detail:last?`Paper cycle journal · ${new Date(last.createdAt).toLocaleString()}`:'No completed cycle recorded'});
  chips.push({label:'Exit monitoring',value:healthy==null?'UNKNOWN':healthy?'HEALTHY':'UNHEALTHY — entries blocked',tone:healthy==null?'warn':healthy?'ok':'bad',detail:healthy===false?(reasons.length?reasons.join('\n'):'No reason recorded in the cycle report; see ARCA Journal')+` · cycle ${last?new Date(last.createdAt).toLocaleString():''}`:'From the latest cycle report',...(healthy===false?{reasons}:{})});
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
 const [data,setData]=useState<{paper:Paper|null;scan:Scan;ops:Ops|null;loadedAt:number}|null>(null);
 // Saved data only: these GET routes never call providers. Reloaded every minute while visible, so the chips are
 // never a page-load snapshot judged against a live clock (that produced false OVERDUE states).
 useEffect(()=>{let c=new AbortController();
  const load=()=>{if(document.hidden)return;c.abort();c=new AbortController();const signal=c.signal;
   const get=(u:string)=>fetch(u,{cache:'no-store',signal}).then(async r=>r.ok?r.json():null).catch(()=>null);
   void Promise.all([get('/api/admin/crypto-markets/paper'),get('/api/admin/crypto-markets/momentum'),get('/api/admin/crypto-markets/setup-email')]).then(([paper,m,ops])=>{if(!signal.aborted)setData({paper,scan:m?.scan??null,ops,loadedAt:Date.now()});});};
  load();const id=setInterval(load,60000);document.addEventListener('visibilitychange',load);
  return()=>{clearInterval(id);document.removeEventListener('visibilitychange',load);c.abort();};},[refreshVersion]);
 if(!data)return <p className="text-sm text-slate-400">Loading attention summary…</p>;
 // Judge freshness at load time; a snapshot older than 3 minutes (e.g. hidden tab) is labelled rather than trusted.
 const snapshotAge=Date.now()-data.loadedAt,chips=attentionChips(data.paper,data.scan,data.ops,snapshotAge>180000?now:data.loadedAt);
 return <section aria-label="Needs attention" className="flex flex-wrap gap-2">
  {chips.map(c=><button key={c.label} type="button" title={c.detail} onClick={()=>onOpen?.(c.label==='Confirmed 4h setups'?'setups':c.label==='Ops health'?'alerts':'paper')} className={`rounded border px-3 py-2 text-left text-sm ${tones[c.tone]}`}>
   <span className="block text-xs text-slate-400">{c.label}</span>{c.value}</button>)}
  {chips.filter(c=>c.reasons?.length).map(c=><p key={c.label} role="status" className="w-full text-xs text-red-200">{c.label}: {c.reasons![0]}{c.reasons!.length>1?` (+${c.reasons!.length-1} more; hover the chip)`:''}</p>)}
  <p className="w-full text-xs text-slate-400">Saved data loaded {new Date(data.loadedAt).toLocaleTimeString()}{snapshotAge>180000?' · STALE SNAPSHOT — reloading when visible':''} · refreshes every minute while this page is visible.</p>
 </section>;
}
