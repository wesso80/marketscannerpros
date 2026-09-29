 'use client';
import {useEffect,useState} from 'react';
type State={configured:boolean;recipient:string;last?:{status:string;at:string;subject?:string;error?:string};notice?:string;operations?:{configured:boolean;state?:{checkedAt:string;healthy:boolean;issues:string[]};last?:{status:string;at:string;subject?:string;error?:string}}};
const nowOverdue=(at:string)=>!Number.isFinite(Date.parse(at))||Date.now()-Date.parse(at)>25*60000;
export default function CryptoSetupEmail({refreshVersion}:{refreshVersion:number}){
 const [data,setData]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(test:false|true|'operations'=false){setBusy(true);setError('');try{const r=await fetch('/api/admin/crypto-markets/setup-email',{method:test?'POST':'GET',cache:'no-store',...(test==='operations'?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'test_operations'})}:{})}),b=await r.json();if(!r.ok)throw Error(b.error);setData(b);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{void load();},[refreshVersion]);
 return <section aria-label="Crypto setup email alerts" className="rounded border border-slate-700 p-4 space-y-2"><h2 className="text-xl">Setup email alerts</h2>
 <p>{data?data.configured?'Configured':'Not configured':'Loading email status…'}{data?.recipient?` · ${data.recipient}`:''}</p>
 <p className="text-sm">Confirmed 4h momentum breakouts and continuations from manual or scheduled scans. One email per coin, exchange and signal candle; no volume-watch or extended alerts. These are research setups, not paper fills. Saved-dashboard refresh sends no emails.</p>
 <button disabled={busy||!data?.configured} onClick={()=>void load(true)} className="rounded border px-3 py-2">Send test setup email</button>
 {data?.last&&<p>Last email: {data.last.status} · {new Date(data.last.at).toLocaleString()} · {data.last.subject??data.last.error}. Accepted means the provider accepted it, not confirmed inbox delivery.</p>}
 <section aria-label="Crypto operational email alerts" className="border-t border-slate-700 pt-3 space-y-2"><h3>Operational email alerts</h3>
 <p>{data?.operations?.configured?'Configured for the same recipient':'Not configured'} · Crypto cycle failures, unhealthy exit monitoring, hourly research failures and recovery. Unchanged faults are suppressed within an incident; normal trade rejections do not send fault emails.</p>
 <p>These checks run inside the scheduled cycle. They cannot alert if the service or cron stops running entirely; an independent watchdog is still needed.</p>
 {data?.operations?.state&&<p>Last health check: {new Date(data.operations.state.checkedAt).toLocaleString()} · {nowOverdue(data.operations.state.checkedAt)?'OVERDUE':data.operations.state.healthy?'Healthy':'ATTENTION'} · {data.operations.state.issues.join('; ')}</p>}
 {data?.operations?.last&&<p>Last operational email: {data.operations.last.status} · {new Date(data.operations.last.at).toLocaleString()} · {data.operations.last.subject??data.operations.last.error}</p>}
 <button disabled={busy||!data?.operations?.configured} onClick={()=>void load('operations')} className="rounded border px-3 py-2">Send test operational email</button></section>
 {data?.notice&&<p>{data.notice}</p>}{error&&<p role="alert">{error}</p>}</section>;
}
