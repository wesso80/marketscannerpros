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
    <div className="overflow-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead><tr>{['Stamp','State','What is happening','Last written','Graded against','Where to look'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>
     {status.items.map(i=><tr key={i.id} className="border-t border-slate-700 align-top">
      <td className="p-2 font-semibold">{i.label}</td>
      <td className="p-2"><span className={`rounded px-2 py-0.5 text-xs ${STATE[i.state].cls}`}>{STATE[i.state].label}</span></td>
      <td className="p-2">{i.summary}{i.next&&<div className="mt-1 text-amber-300">→ {i.next}</div>}</td>
      <td className="p-2 whitespace-nowrap">{when(i.lastAt)}</td>
      <td className="p-2">{i.gradedAgainst}</td>
      <td className="p-2 text-slate-400">{i.where}</td>
     </tr>)}
    </tbody></table></div>
   </>}
  </section>
  <CryptoCalibration refreshVersion={refreshVersion}/>
 </div>;
}
