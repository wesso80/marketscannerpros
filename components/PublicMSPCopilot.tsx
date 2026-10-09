'use client';
import studio from '@/components/public-design/PublicOverlays.module.css';
import { useEffect, useRef, useState } from 'react';
import { loadCopilotSections, type CopilotSectionLoad } from '@/lib/ai/loadCopilotSections';

export type CopilotUsage = { enabled?: boolean; bypass?: boolean; plan?: string; resetsAt?: string; quotas?: Array<{ kind: string; remaining: number | null }> };
type Answer = { content?: string; error?: string; capturedAt?: string; missing?: string[]; evidence?: Array<{id:string;field:string;value:unknown}>; quota?: { limit:number;used:number;resetsAt:string } };
export default function PublicMSPCopilot({ usage, pagePath, symbol, evidenceToken, sectionTokens = [], sectionTokensByName = {}, assetType, timeframe, expiry }: { usage: CopilotUsage; pagePath: string; symbol?: string; evidenceToken?: string | null; sectionTokens?: string[]; sectionTokensByName?:Record<string,string>; assetType?:'equity'|'crypto';timeframe?:string;expiry?:string|null }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(usage.quotas?.find(q => q.kind === 'ai')?.remaining ?? 0);
  const [reset, setReset] = useState(usage.resetsAt);
  const retry = useRef<{id:string;message:string} | null>(null);
  const generation = useRef(0);
  const [preloaded,setPreloaded]=useState<{key:string;data:CopilotSectionLoad}|null>(null);
  const loadKey=JSON.stringify([evidenceToken,symbol,assetType,timeframe,expiry]);
  const shouldLoad=usage.plan==='pro' && pagePath==='/tools/golden-egg' && Boolean(evidenceToken && symbol && assetType);
  const loadingSections=open && shouldLoad && preloaded?.key!==loadKey;
  useEffect(()=>{
    if(!open || !shouldLoad || preloaded?.key===loadKey)return;
    const abort=new AbortController();
    void loadCopilotSections(symbol!,assetType!,abort.signal,fetch,{timeframe,expiry}).then(data=>{if(!abort.signal.aborted)setPreloaded({key:loadKey,data});});
    return ()=>abort.abort();
  },[open,shouldLoad,loadKey,symbol,assetType,timeframe,expiry,preloaded?.key]);
  const combinedTokens=Object.values({...(preloaded?.key===loadKey?preloaded.data.tokens:{}),...sectionTokensByName});
  const activeTokens=combinedTokens.length?combinedTokens:sectionTokens;
  const sectionKey=activeTokens.join('|');
  useEffect(() => { generation.current++; setAnswers([]); setQuestion(''); setBusy(false); retry.current=null; }, [pagePath, symbol, evidenceToken, sectionKey]);
  useEffect(() => { setRemaining(usage.quotas?.find(q => q.kind === 'ai')?.remaining ?? 0); setReset(usage.resetsAt); }, [usage]);
  async function send() {
    if (busy || loadingSections || !question.trim() || !evidenceToken || remaining <= 0) return;
    const run = generation.current;
    const pending = retry.current?.message === question.trim() ? retry.current : {id:crypto.randomUUID(),message:question.trim()};
    retry.current = pending; setBusy(true);
    try {
      const response = await fetch('/api/ai/copilot', { method:'POST', headers:{'Content-Type':'application/json','Idempotency-Key':pending.id},
        body:JSON.stringify({message:pending.message,pagePath,symbol,evidenceToken,sectionTokens:activeTokens}) });
      const answer: Answer = await response.json();
      window.dispatchEvent(new Event('public-usage-changed'));
      if (generation.current !== run) return;
      if (answer.quota) { setRemaining(Math.max(0,answer.quota.limit-answer.quota.used)); setReset(answer.quota.resetsAt); }
      setAnswers(old => [...old,{...answer,error:answer.error || (!response.ok ? 'Copilot unavailable.' : undefined)}]);
      if (response.ok) { retry.current=null;setQuestion(''); }
    } catch { if(generation.current===run)setAnswers(old=>[...old,{error:'Connection interrupted. Retry the same question to check its status.'}]); }
    finally { if(generation.current===run)setBusy(false); }
  }
  return <aside style={{width:"min(420px, calc(100vw - 24px))"}} className={studio.copilot}>
    <button type="button" aria-expanded={open} aria-controls="public-copilot-panel" onClick={()=>setOpen(!open)} className={studio.launcher}>MSP Copilot · Pro</button>
    {open && <section style={{width:"100%"}} id="public-copilot-panel" aria-label="MSP Copilot" className={studio.panel}>
      <h2 className="font-semibold">Understand this page</h2>
      <p className="mt-1 text-xs text-slate-300">AI-selected page evidence with reviewed educational explanations.</p>
      {usage.plan !== 'pro' ? <p className="mt-4">Pro includes 20 questions daily. <a className="text-teal-300 underline" href="/pricing">View Pro</a></p> : <>
        <p className="my-3 text-xs">{remaining} of 20 questions remaining{reset ? ` · Resets ${new Date(reset).toLocaleString()}` : ''}</p>
        {!evidenceToken && <p role="status">Verified evidence is not available here yet. Open or reload a Symbol report.</p>}
        {loadingSections && <p role="status">Loading connected page evidence…</p>}
        {!loadingSections && preloaded?.key===loadKey && <p className="mb-2 text-xs text-slate-400">Chart context defaults to 90 days unless a loaded chart supplies another selection. {preloaded.data.unavailable.length?`Unavailable: ${preloaded.data.unavailable.join(', ')}.`:''} Sources that fail remain unavailable.</p>}
        <div aria-live="polite" className="max-h-[45vh] space-y-3 overflow-y-auto">
          {answers.map((answer,index)=><article key={index} className="rounded-lg bg-slate-900 p-3">
            {answer.error ? <p role="alert">{answer.error}</p> : <>
              <p className="whitespace-pre-wrap break-words">{answer.content}</p>
              {answer.capturedAt && <p className="mt-2 text-xs text-slate-400">Snapshot captured {new Date(answer.capturedAt).toLocaleString()}; observation dates are in the evidence.</p>}
              {answer.missing?.map(note=><p key={note} className="mt-2 text-xs text-amber-200">{note}</p>)}
              <details className="mt-2 text-xs"><summary>Source evidence</summary>{answer.evidence?.map(e=><p key={e.id} className="break-words">[{e.id}] {e.field}: {String(e.value ?? 'Unavailable')}</p>)}</details>
            </>}
          </article>)}
        </div>
        <form onSubmit={event=>{event.preventDefault();void send();}} className="mt-3 space-y-2">
          <label htmlFor="public-copilot-question" className="block text-xs">Ask about this evidence</label>
          <textarea id="public-copilot-question" value={question} onChange={event=>setQuestion(event.target.value)} maxLength={2000} disabled={busy || loadingSections || !evidenceToken || remaining<=0} className="w-full rounded border border-slate-600 bg-slate-900 p-2" />
          <button disabled={busy || loadingSections || !evidenceToken || remaining<=0 || !question.trim()} className={studio.send}>{busy?'Reading evidence…':'Ask Copilot'}</button>
        </form>
      </>}
    </section>}
  </aside>;
}
