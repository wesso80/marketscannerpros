'use client';
import {useState} from 'react';
export default function PositionHistoryRepair({onComplete}:{onComplete:()=>void}){
 const [running,setRunning]=useState(false),[message,setMessage]=useState('');
 async function repair(){setRunning(true);let offset:number|null=0;let unavailable=0;
  try{do{const r:Response=await fetch('/api/admin/position-history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({offset})});const j:{error?:string;results:{status:string}[];processed:number;total:number;next:number|null}=await r.json();if(!r.ok)throw Error(j.error||'Repair failed');unavailable+=j.results.filter((x:{status:string})=>x.status==='unavailable').length;setMessage(`Checked ${j.processed}/${j.total}; ${unavailable} still need usable history.`);offset=j.next;}while(offset!==null);onComplete();}
  catch(e){setMessage(e instanceof Error?e.message:'History repair stopped');}finally{setRunning(false);}
 }
 return <div className="space-y-2 rounded border border-slate-700 p-3"><button disabled={running} onClick={repair} className="rounded bg-slate-700 px-4 py-2 disabled:opacity-50">{running?'Repairing history…':'Repair position history'}</button><p className="text-xs text-slate-400">Manual only. Fetches missing daily history in batches of five using provider requests; cached history is reused for six hours. Does not run a scanner or create trades.</p><p role="status" className="text-sm">{message}</p></div>;
}
