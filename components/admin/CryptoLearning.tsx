'use client';
import {useEffect,useState} from 'react';
import dynamic from 'next/dynamic';
import type {LearningItem,LearningStatus} from '@/lib/admin/learningStatus';
const CryptoCalibration=dynamic(()=>import('@/components/admin/CryptoCalibration'),{ssr:false});
const STATE:Record<LearningItem['state'],{label:string;cls:string}>={ok:{label:'working',cls:'bg-emerald-900 text-emerald-200'},collecting:{label:'collecting',cls:'bg-slate-700 text-slate-200'},attention:{label:'needs attention',cls:'bg-amber-900 text-amber-200'},paused:{label:'paused',cls:'bg-slate-800 text-slate-400'},off:{label:'off',cls:'bg-red-900 text-red-200'}};
const when=(iso:string|null)=>{if(!iso)return 'never';const m=Math.round((Date.now()-Date.parse(iso))/60000);return m<60?`${m} min ago`:m<2880?`${Math.round(m/60)} h ago`:`${Math.round(m/1440)} d ago`;};
export default function CryptoLearning({refreshVersion=0}:{refreshVersion?:number}){
 const [status,setStatus]=useState<LearningStatus|null>(null),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();
  void fetch('/api/admin/crypto-markets/learning',{cache:'no-store',signal:c.signal}).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error);if(!c.signal.aborted){setStatus(b);setError('');}}).catch(e=>{if(!c.signal.aborted&&e.name!=='AbortError')setError(e.message||'Learning status unavailable');});
  return ()=>c.abort();
 },[refreshVersion]);
 return <div className="space-y-4">
  <section aria-label="Learning loop status" className="space-y-3 rounded border border-slate-600 p-4">
   <h2 className="text-xl">Learning loop · what is recorded, what it is graded against, and whether it is working</h2>
   <p className="text-sm text-slate-300">Every panel below is evidence. Jev (TypeSafe) answers fixed questions and returns probabilities; this code stores them beside the outcome that later arrives, and the ledger reports which answers separated good from bad. Nothing opens, blocks, or edits a rule; a confirmed finding becomes a text recommendation for a person.</p>
   <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
    <li><span className="font-semibold">Record</span> — each named setup gets a Jev shadow (three answers from its candle numbers) and a catalyst stamp (five answers from its CoinGecko headlines).</li>
    <li><span className="font-semibold">Outcome</span> — paper R and forward 4h/24h marks arrive on their own schedule.</li>
    <li><span className="font-semibold">Grade</span> — the calibration ledger splits every answer at 0.50 and requires the same sign of lift in both time halves before calling anything confirmed.</li>
    <li><span className="font-semibold">Propose</span> — confirmed sides file a recommendation (max 3 a week). You accept, you change code, you bump the rule id, the sample restarts.</li>
   </ol>
   {error&&<p role="alert" className="text-amber-300">{error}</p>}
   {!status&&!error&&<p>Checking…</p>}
   {status&&<>
    <p className="text-xs text-slate-400">Checked {new Date(status.checkedAt).toLocaleString()} · Jev gateway key {status.mode.jevKey?'set':<span className="text-red-300">missing</span>} · market data: CoinGecko and exchange candles only · ADMIN_DISCOVERY_ONLY {status.mode.discoveryOnly?'on (crypto admin only)':'off'}</p>
    <ul className="space-y-3">
     {status.items.map(i=><li key={i.id} className="rounded border border-slate-700 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
       <h3 className="text-sm font-semibold">{i.label}</h3>
       <span className={`rounded px-2 py-0.5 text-xs ${STATE[i.state].cls}`}>{STATE[i.state].label}</span>
      </div>
      <p className="mt-2 text-sm">{i.summary}</p>
      {i.next&&<p className="mt-1 text-sm text-amber-300">→ {i.next}</p>}
      <p className="mt-2 text-xs text-slate-400">Last written {when(i.lastAt)} · Graded against {i.gradedAgainst} · {i.where}</p>
     </li>)}
    </ul>
    <div className="rounded border border-sky-800 p-3">
     <h3 className="text-sm font-semibold">Composite shadow score · weights in force</h3>
     {!status.shadowWeights&&<p className="text-xs text-slate-400">No weights derived yet. The daily calibration pass writes them.</p>}
     {status.shadowWeights&&!status.shadowWeights.available&&<p className="text-xs text-slate-400">Not available: {status.shadowWeights.reason} Derived {new Date(status.shadowWeights.computedAt).toLocaleString()} from the ledger computed {status.shadowWeights.ledgerCheckedAt?new Date(status.shadowWeights.ledgerCheckedAt).toLocaleString():'—'}.</p>}
     {status.shadowWeights?.available&&<>
      <p className="text-xs text-slate-400">Version {status.shadowWeights.version} · derived {new Date(status.shadowWeights.computedAt).toLocaleString()}. A setup&apos;s score is the sum of the weights of the confirmed sides it sits on. Weight = lift ÷ confirmation floor (0.25R or 1%), clipped at ±2. Printed here so nothing is hidden; the ledger grades the sign of stamped scores out of sample.</p>
      <div className="overflow-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr>{['Field','Side','Outcome','Rows','Lift','Weight'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>
       {status.shadowWeights.weights.map(w=><tr key={`${w.field}|${w.side}`} className="border-t border-slate-700"><td className="p-2">{w.label}<div className="text-xs text-slate-500">{w.field}</div></td><td className="p-2">{w.side}</td><td className="p-2">{w.outcome}</td><td className="p-2">{w.n}</td><td className={`p-2 ${w.lift>0?'text-emerald-300':'text-red-300'}`}>{w.lift>=0?'+':''}{w.lift.toFixed(2)}{w.unit}</td><td className={`p-2 ${w.weight>0?'text-emerald-300':'text-red-300'}`}>{w.weight>=0?'+':''}{w.weight.toFixed(2)}</td></tr>)}
      </tbody></table></div>
     </>}
    </div>
   </>}
  </section>
  <CryptoCalibration refreshVersion={refreshVersion}/>
 </div>;
}
