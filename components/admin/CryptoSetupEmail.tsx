 'use client';
import {useEffect,useState} from 'react';
type State={configured:boolean;recipient:string;last?:{status:string;at:string;subject?:string;error?:string};notice?:string};
export default function CryptoSetupEmail({refreshVersion}:{refreshVersion:number}){
 const [data,setData]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(test=false){setBusy(true);setError('');try{const r=await fetch('/api/admin/crypto-markets/setup-email',{method:test?'POST':'GET',cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);setData(b);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{void load();},[refreshVersion]);
 return <section aria-label="Crypto setup email alerts" className="rounded border border-slate-700 p-4 space-y-2"><h2 className="text-xl">Setup email alerts</h2>
 <p>{data?data.configured?'Configured':'Not configured':'Loading email status…'}{data?.recipient?` · ${data.recipient}`:''}</p>
 <p className="text-sm">Confirmed 4h momentum breakouts and continuations from manual or scheduled scans. One email per coin, exchange and signal candle; no volume-watch or extended alerts. These are research setups, not paper fills. Saved-dashboard refresh sends no emails.</p>
 <button disabled={busy||!data?.configured} onClick={()=>void load(true)} className="rounded border px-3 py-2">Send test setup email</button>
 {data?.last&&<p>Last email: {data.last.status} · {new Date(data.last.at).toLocaleString()} · {data.last.subject??data.last.error}. Accepted means the provider accepted it, not confirmed inbox delivery.</p>}
 {data?.notice&&<p>{data.notice}</p>}{error&&<p role="alert">{error}</p>}</section>;
}
