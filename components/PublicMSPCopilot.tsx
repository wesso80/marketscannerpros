'use client';
import { useEffect, useRef, useState } from 'react';

export type CopilotUsage = { enabled?: boolean; bypass?: boolean; plan?: string; resetsAt?: string; quotas?: Array<{ kind: string; remaining: number | null }> };
type Answer = { content?: string; error?: string; capturedAt?: string; missing?: string[]; evidence?: Array<{id:string;field:string;value:unknown}>; quota?: { limit:number;used:number;resetsAt:string } };
export default function PublicMSPCopilot({ usage, pagePath, symbol, evidenceToken, sectionTokens = [] }: { usage: CopilotUsage; pagePath: string; symbol?: string; evidenceToken?: string | null; sectionTokens?: string[] }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(usage.quotas?.find(q => q.kind === 'ai')?.remaining ?? 0);
  const [reset, setReset] = useState(usage.resetsAt);
  const retry = useRef<{id:string;message:string} | null>(null);
  const generation = useRef(0);
  const sectionKey=sectionTokens.join('|');
  useEffect(() => { generation.current++; setAnswers([]); setQuestion(''); setBusy(false); retry.current=null; }, [pagePath, symbol, evidenceToken, sectionKey]);
  useEffect(() => { setRemaining(usage.quotas?.find(q => q.kind === 'ai')?.remaining ?? 0); setReset(usage.resetsAt); }, [usage]);
  async function send() {
    if (busy || !question.trim() || !evidenceToken || remaining <= 0) return;
    const run = generation.current;
    const pending = retry.current?.message === question.trim() ? retry.current : {id:crypto.randomUUID(),message:question.trim()};
    retry.current = pending; setBusy(true);
    try {
      const response = await fetch('/api/ai/copilot', { method:'POST', headers:{'Content-Type':'application/json','Idempotency-Key':pending.id},
        body:JSON.stringify({message:pending.message,pagePath,symbol,evidenceToken,sectionTokens}) });
      const answer: Answer = await response.json();
      window.dispatchEvent(new Event('public-usage-changed'));
      if (generation.current !== run) return;
      if (answer.quota) { setRemaining(Math.max(0,answer.quota.limit-answer.quota.used)); setReset(answer.quota.resetsAt); }
      setAnswers(old => [...old,{...answer,error:answer.error || (!response.ok ? 'Copilot unavailable.' : undefined)}]);
      if (response.ok) { retry.current=null;setQuestion(''); }
    } catch { if(generation.current===run)setAnswers(old=>[...old,{error:'Connection interrupted. Retry the same question to check its status.'}]); }
    finally { if(generation.current===run)setBusy(false); }
  }
  return <aside className="fixed bottom-5 right-3 z-50 max-w-[calc(100vw-24px)] text-sm">
    <button type="button" aria-expanded={open} aria-controls="public-copilot-panel" onClick={()=>setOpen(!open)} className="rounded-xl bg-teal-300 px-4 py-3 font-semibold text-slate-950">MSP Copilot · Pro</button>
    {open && <section id="public-copilot-panel" aria-label="MSP Copilot" className="mt-2 w-[420px] max-w-full rounded-xl border border-slate-600 bg-slate-950 p-4 text-slate-100 shadow-xl">
      <h2 className="font-semibold">Understand this page</h2>
      <p className="mt-1 text-xs text-slate-300">AI-written educational explanations from connected page evidence.</p>
      {usage.plan !== 'pro' ? <p className="mt-4">Pro includes 20 questions daily. <a className="text-teal-300 underline" href="/pricing">View Pro</a></p> : <>
        <p className="my-3 text-xs">{remaining} of 20 questions remaining{reset ? ` · Resets ${new Date(reset).toLocaleString()}` : ''}</p>
        {!evidenceToken && <p role="status">Verified evidence is not available here yet. Open or reload a Symbol report.</p>}
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
          <textarea id="public-copilot-question" value={question} onChange={event=>setQuestion(event.target.value)} maxLength={2000} disabled={busy || !evidenceToken || remaining<=0} className="w-full rounded border border-slate-600 bg-slate-900 p-2" />
          <button disabled={busy || !evidenceToken || remaining<=0 || !question.trim()} className="rounded bg-teal-300 px-4 py-2 text-slate-950 disabled:opacity-40">{busy?'Reading evidence…':'Ask Copilot'}</button>
        </form>
      </>}
    </section>}
  </aside>;
}
