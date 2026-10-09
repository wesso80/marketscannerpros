"use client";
import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { compareExpectancy } from '@/lib/admin/expectancyShadow';
type Result=ReturnType<typeof compareExpectancy>&{symbol:string;playbook:string;definition:string;limitation:string};
export default function ExpectancyShadowPage(){
 const [symbol,setSymbol]=useState('');const [playbook,setPlaybook]=useState('');const [baseScore,setBaseScore]=useState('');
 const [data,setData]=useState<Result|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(false);
 const version=useRef(0);
 function changed(update:()=>void){version.current++;update();setData(null);setError('');setLoading(false);}
 async function compare(event:FormEvent){
  event.preventDefault();const request=++version.current;setData(null);setError('');setLoading(true);
  try{
   const secret=sessionStorage.getItem('admin_secret');
   const response=await fetch(`/api/admin/expectancy-shadow?${new URLSearchParams({symbol,playbook,baseScore})}`,{cache:'no-store',credentials:'include',headers:secret?{Authorization:`Bearer ${secret}`}:{}});
   const json=await response.json();if(request!==version.current)return;
   if(!response.ok||!json.ok)throw new Error(json.error||'Comparison unavailable.');setData(json);
  }catch(e){if(request===version.current)setError(e instanceof Error?e.message:'Comparison unavailable.');}
  finally{if(request===version.current)setLoading(false);}
 }
 return <div className="space-y-5 p-4 text-slate-200">
  <Link href="/admin/edge-check" className="text-emerald-300">Back to Edge Check</Link>
  <h1 className="text-2xl font-semibold">Expectancy comparison</h1>
  <p className="max-w-3xl text-sm text-slate-400">Compare current scanner history with verified-method records. This is a read-only model review; it never changes a live score.</p>
  <form onSubmit={compare} className="flex flex-wrap items-end gap-3">
   <label className="grid gap-1">Symbol<input required maxLength={24} value={symbol} onChange={e=>changed(()=>setSymbol(e.target.value))} className="rounded border border-slate-600 bg-slate-900 p-2"/></label>
   <label className="grid gap-1">Exact playbook key<input required maxLength={120} value={playbook} onChange={e=>changed(()=>setPlaybook(e.target.value))} className="rounded border border-slate-600 bg-slate-900 p-2"/></label>
   <label className="grid gap-1">Pre-expectancy score (optional)<input type="number" min={0} max={100} step="any" value={baseScore} onChange={e=>changed(()=>setBaseScore(e.target.value))} className="rounded border border-slate-600 bg-slate-900 p-2"/></label>
   <button disabled={loading} className="rounded bg-emerald-700 px-4 py-2 disabled:opacity-50">{loading?'Comparing…':'Compare recorded history'}</button>
  </form>
  <p className="text-xs text-slate-400">Use the playbook key from the hit being reviewed, preserving case. The scanner may use its regime as the key when no playbook exists. Use Unknown for the final fallback.</p>
  {error?<p role="alert" className="text-red-300">{error}</p>:null}
  {data?<section aria-label="Comparison results" className="space-y-3 rounded-xl border border-slate-700 p-4">
   <h2 className="text-lg font-semibold">{data.symbol} · {data.playbook}</h2>
   <p>{data.provenance.total} unique eligible records: {data.provenance.verified} verified, {data.provenance.unknown} unknown, {data.provenance.inconsistent} inconsistent.</p>
   {!data.verifiedSampleAvailable?<p>No verified sample is available. The verified scenario cannot support a score adjustment.</p>:null}
   <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th scope="col">Measure</th><th scope="col">Current method</th><th scope="col">Verified-only scenario</th></tr></thead>
    <tbody>{[
     ['Symbol records',data.current.symbol.sample,data.verified.symbol.sample],['Playbook records',data.current.playbook.sample,data.verified.playbook.sample],
     ['Overlap (same records in both)',data.current.overlap,data.verified.overlap],['Eligibility sample (maximum, not sum)',data.current.eligibilitySample,data.verified.eligibilitySample],
     ['Blended mean 24h move (%)',data.current.blendedAvgMovePct,data.verified.blendedAvgMovePct],['Score adjustment (points)',data.current.scoreBoost,data.verified.scoreBoost],
     ['Hypothetical capped score',data.current.hypotheticalEliteScore??'Base score not supplied',data.verified.hypotheticalEliteScore??'Base score not supplied']
    ].map(([label,current,verified])=><tr key={String(label)} className="border-t border-slate-700"><th scope="row" className="py-2 font-normal">{label}</th><td>{current}</td><td>{verified}</td></tr>)}</tbody></table></div>
   <p>Adjustment difference: {data.scoreBoostDelta} points. Capped score difference: {data.hypotheticalScoreDelta??'Base score not supplied'}.</p>
   <p>{data.unrecognizedDirections} baseline records have unrecognized directions.</p>
   <p className="text-xs text-slate-400">{data.definition}</p><p className="text-xs text-slate-400">{data.limitation}</p>
  </section>:null}
 </div>;
}
