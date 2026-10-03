'use client';
import {useEffect,useState} from 'react';
type Level='PASS'|'WARN'|'REJECT';
type Check={id:string;status:Level;reason:string};
type Row={id:string;symbol:string;verdict:Level;checks:Check[];signalAt:string|null};
type Payload={
 advisory?:boolean;simulated?:boolean;stale?:boolean;error?:string;
 snapshot:{asOf:string;stale:boolean;note:string|null;rows:Row[]}|null;
}|null;
const tone:Record<Level,string>={PASS:'text-emerald-300',WARN:'text-amber-300',REJECT:'text-red-300'};
/**
 * Advisory base-breakout verdicts saved by the 15-minute cycle. Separate from the market-data panel
 * so a compression-flag edit there does not collide with this list. Read only. Does not place or size a trade.
 */
export default function CryptoBreakoutVerdicts({now,refreshVersion=0}:{now:number;refreshVersion?:number}){
 const [data,setData]=useState<Payload>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  void fetch('/api/admin/crypto-markets/breakout-verdicts',{cache:'no-store',signal:controller.signal}).then(async r=>{
   const body=await r.json();
   if(!r.ok)throw Error(body.error||'Breakout verdicts unavailable');
   if(!controller.signal.aborted){setData(body);setError('');}
  }).catch(e=>{if(!controller.signal.aborted&&e.name!=='AbortError')setError('Saved breakout verdicts unavailable');});
  return ()=>controller.abort();
 },[refreshVersion]);
 const snap=data?.snapshot??null;
 const stale=!!snap&&(snap.stale||now-Date.parse(snap.asOf)>2*15*60*1000);
 return <section aria-label="Breakout advisory verdicts" className="space-y-3 rounded border border-slate-600 p-4">
  <h2 className="text-xl">Base-breakout advisory verdicts</h2>
  <p className="text-sm text-slate-300">Plain-math read of each saved base-breakout candidate. Advisory only. It does not block, size, rank, or change a paper entry or exit.</p>
  {error&&<p role="alert" className="text-amber-300">{error}</p>}
  {!data&&!error&&<p className="text-sm text-slate-400">Loading saved verdicts…</p>}
  {data&&!snap&&<p className="text-sm">No advisory stamp saved yet. The 15-minute cycle writes one from the saved scans.</p>}
  {snap&&<>
   <p className="text-sm">{stale?<span className="text-amber-300">STALE · </span>:null}Saved {new Date(snap.asOf).toLocaleString()}{snap.note?` · ${snap.note}`:''}</p>
   {!snap.rows.length&&<p className="text-sm">No base-breakout candidate in this stamp.</p>}
   {!!snap.rows.length&&<div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Candidate','Verdict','Checks'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead>
    <tbody>{snap.rows.map(row=><tr className="border-t border-slate-700 align-top" key={row.id}>
     <td className="p-2">{row.symbol}<div className="text-xs text-slate-400">{row.id}</div></td>
     <td className={`p-2 font-semibold ${tone[row.verdict]??''}`}>{row.verdict}</td>
     <td className="p-2 text-xs">{(row.checks??[]).map(c=><div key={c.id} className={tone[c.status]??''}><span className="font-medium">{c.status}</span> · {c.reason}</div>)}</td>
    </tr>)}</tbody></table></div>}
  </>}
 </section>;
}
