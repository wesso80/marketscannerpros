'use client';
import {useEffect,useState} from 'react';
import type {ForwardBook,ForwardMark} from '@/lib/admin/cryptoForwardScore';
function cell(mark:ForwardMark){
 if(mark.status==='waiting')return 'Waiting';
 if(mark.status==='missed')return 'Unavailable';
 const sign=mark.changePct>0?'+':'';
 return `${mark.price.toPrecision(6)} · ${sign}${mark.changePct.toFixed(2)}%`;
}
export default function CryptoForwardScore({refreshVersion=0}:{refreshVersion?:number}){
 const [book,setBook]=useState<ForwardBook|null>(null),[headline,setHeadline]=useState(''),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();
  void fetch('/api/admin/crypto-markets/forward-score',{cache:'no-store',signal:c.signal}).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error);if(!c.signal.aborted){setBook(b.book);setHeadline(b.headline);setError('');}}).catch(e=>{if(!c.signal.aborted&&e.name!=='AbortError')setError(e.message||'Saved forward score unavailable');});
  return ()=>c.abort();
 },[refreshVersion]);
 return <section aria-label="Forward score" className="space-y-3 rounded border border-slate-600 p-4">
  <h2 className="text-xl">Forward score</h2>
  <p className="text-sm text-slate-300">Saved results for VOLUME_WATCH, EXTENDED, and 1-hour EARLY_WATCH. These buckets do not open paper trades. Each row keeps the signal time and price, then the next completed 4-hour close and the 24-hour mark from later saved scans.</p>
  {error&&<p role="alert" className="text-amber-300">{error}</p>}
  {!book&&!error&&<p>Loading saved forward scores…</p>}
  {book&&<>
   <p>{headline}</p>
   {!book.rows.length&&<p role="status" className="text-slate-400">None saved yet.</p>}
   {!!book.rows.length&&<div className="max-h-96 overflow-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr>{['Coin','Bucket','Signal time','Signal price','Next 4h close','24 hours'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{book.rows.map(row=><tr className="border-t border-slate-700" key={`${row.bucket}|${row.id}|${row.signalAt}`}><td className="p-2">{row.symbol}<br/><span className="text-slate-400">{row.id}</span></td><td>{row.bucket}</td><td>{row.signalAt}</td><td>{row.signalPrice.toPrecision(6)}</td><td>{cell(row.next4h)}</td><td>{cell(row.day)}</td></tr>)}</tbody></table></div>}
  </>}
 </section>;
}
