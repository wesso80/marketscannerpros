'use client';
import {useEffect,useState} from 'react';
import type {ForwardBook,ForwardMark,JevForwardSummary} from '@/lib/admin/cryptoForwardScore';
import {catalystDetail,catalystText,chartDetail,chartText,jevDetail} from '@/lib/admin/cryptoJevEvidence';
function jevCell(jev:ForwardBook['rows'][number]['jev']){
 if(!jev)return '—';
 if(jev.status!=='scored'||jev.chase==null||jev.flowAgrees==null||jev.btcHeadwind==null)return `unavailable${jev.reason?` · ${jev.reason}`:''}`;
 return `chase ${jev.chase.toFixed(2)} · flow ${jev.flowAgrees.toFixed(2)} · btc ${jev.btcHeadwind.toFixed(2)}`;
}
const pct=(n:number|null)=>n==null?'—':`${n>0?'+':''}${n.toFixed(2)}%`;
const shareText=(n:number|null)=>n==null?'—':`${(n*100).toFixed(0)}% up`;
function JevSplit({jev}:{jev:JevForwardSummary}){
 const c=jev.coverage,reasons=Object.entries(c.reasons).map(([k,v])=>`${k} ${v}`).join(', ');
 return <div className="space-y-1 rounded border border-sky-800 p-3">
  <h3 className="text-sm font-semibold">Jev shadow against the saved marks · evidence only</h3>
  <p className="text-xs text-slate-400">Coverage: {c.scored} scored · {c.unavailable} unavailable{reasons?` (${reasons})`:''} · {c.unscored} without a stamp. Each answer is split at 0.50 and read against the 4h and 24h marks already on these rows. Average move and share of rows that closed up, per side. Not a win rate and not a filter; nothing here changes a setup or a trade.</p>
  <p className={jev.sides.some(s=>!s.thin)?'text-xs':'text-xs text-amber-300'}>{jev.note}{jev.sides.some(s=>s.thin)?' Sides under 30 filled marks are shown in amber.':''}</p>
  {!!jev.sides.length&&<div className="overflow-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr>{['Side','Rows','4h filled','Avg 4h','4h up','24h filled','Avg 24h','24h up'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>
   {jev.sides.map(s=><tr key={s.label} className={`border-t border-slate-700 ${s.thin?'text-amber-200/80':''}`}><td className="p-2">{s.label}</td><td className="p-2">{s.rows}</td><td className="p-2">{s.filled4h}</td><td className="p-2">{pct(s.avg4hPct)}</td><td className="p-2">{shareText(s.up4hShare)}</td><td className="p-2">{s.filled24h}</td><td className="p-2">{pct(s.avg24hPct)}</td><td className="p-2">{shareText(s.up24hShare)}</td></tr>)}
  </tbody></table></div>}
 </div>;
}
function cell(mark:ForwardMark){
 if(mark.status==='waiting')return 'Waiting';
 if(mark.status==='missed')return 'Unavailable';
 const sign=mark.changePct>0?'+':'';
 return `${mark.price.toPrecision(6)} · ${sign}${mark.changePct.toFixed(2)}%`;
}
export default function CryptoForwardScore({refreshVersion=0}:{refreshVersion?:number}){
 const [book,setBook]=useState<ForwardBook|null>(null),[headline,setHeadline]=useState(''),[jev,setJev]=useState<JevForwardSummary|null>(null),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();
  void fetch('/api/admin/crypto-markets/forward-score',{cache:'no-store',signal:c.signal}).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error);if(!c.signal.aborted){setBook(b.book);setHeadline(b.headline);setJev(b.jev??null);setError('');}}).catch(e=>{if(!c.signal.aborted&&e.name!=='AbortError')setError(e.message||'Saved forward score unavailable');});
  return ()=>c.abort();
 },[refreshVersion]);
 return <section aria-label="Forward score" className="space-y-3 rounded border border-slate-600 p-4">
  <h2 className="text-xl">Forward score <span className="text-sm font-normal text-slate-400">· outcome evidence for buckets that never trade</span></h2>
  <p className="text-sm text-slate-300">Saved results for VOLUME_WATCH, EXTENDED, and 1-hour EARLY_WATCH. These buckets do not open paper trades. Each row keeps the signal time and price, then the next completed 4-hour close and the 24-hour mark from later saved scans. The Jev column is the three probabilities stored with that signal; hover it for the scoring time, Bitcoin read, and model. It is not a win rate.</p>
  {error&&<p role="alert" className="text-amber-300">{error}</p>}
  {!book&&!error&&<p>Loading saved forward scores…</p>}
  {book&&<>
   <p>{headline}</p>
   {!book.rows.length&&<p role="status" className="text-slate-400">None saved yet.</p>}
   {!!book.rows.length&&<div className="max-h-96 overflow-auto"><table className="w-full min-w-[1300px] text-left text-sm"><thead><tr>{['Coin','Bucket','Signal time','Signal price','Next 4h close','24 hours','Jev','Chart','Catalyst'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{book.rows.map(row=><tr className="border-t border-slate-700" key={`${row.bucket}|${row.id}|${row.signalAt}`}><td className="p-2">{row.symbol}<br/><span className="text-slate-400">{row.id}</span></td><td>{row.bucket}</td><td>{row.signalAt}</td><td>{row.signalPrice.toPrecision(6)}</td><td>{cell(row.next4h)}</td><td>{cell(row.day)}</td><td className="p-2" title={jevDetail(row.jev)}>{jevCell(row.jev)}</td><td className="p-2 text-xs" title={chartDetail(row.chart)}>{chartText(row.chart,true)}</td><td className="p-2" title={catalystDetail(row.catalyst)}>{catalystText(row.catalyst,true)}</td></tr>)}</tbody></table></div>}
   {jev&&<JevSplit jev={jev}/>}
  </>}
 </section>;
}
