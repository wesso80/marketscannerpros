'use client';
import { useEffect, useState } from 'react';
type Usage = { enabled: boolean; bypass?: boolean; resetsAt?: string; quotas?: Array<{kind: string;limit: number | null;completed: number;pending: number;remaining: number | null}> };
export default function PublicUsageSummary({ refreshKey }: { refreshKey: string }) {
  const [data,setData] = useState<Usage | null>(null), [error,setError] = useState(false);
  useEffect(()=>{
    const abort = new AbortController();let timer: ReturnType<typeof setTimeout> | undefined;
    setData(null);setError(false);
    const load = async () => {
      try {
        const response = await fetch('/api/public-usage',{signal:abort.signal,cache:'no-store'});
        if (!response.ok) throw Error('Unavailable');
        const body: Usage = await response.json();if(abort.signal.aborted)return;
        setData(body);setError(false);
        if(body.resetsAt){const delay=Date.parse(body.resetsAt)-Date.now()+1000;if(Number.isFinite(delay)&&delay>0)timer=setTimeout(load,Math.min(delay,2147483647));}
      } catch {if(!abort.signal.aborted)setError(true);}
    };void load();return()=>{abort.abort();if(timer)clearTimeout(timer);};
  },[refreshKey]);
  if(error)return <p className="text-xs text-slate-400">Usage count temporarily unavailable.</p>;
  if(!data?.enabled || data.bypass || !data.quotas)return null;
  return <aside aria-label="Daily research allowance" className="rounded-xl border border-white/10 p-3 text-xs leading-6 text-slate-300">
    <div className="flex flex-wrap gap-x-5">{data.quotas.map(q=><span key={q.kind}>{q.kind==='symbol'?'Symbol reports':'AI questions'}: {q.limit===null?'Unlimited':`${q.remaining} of ${q.limit} remaining`}{q.pending>0?` (${q.pending} in progress)`:''}</span>)}</div>
    {data.resetsAt&&<p className="text-slate-400">Resets {new Date(data.resetsAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})} · midnight US Eastern. Reopening a ticker uses no extra report.</p>}
  </aside>;
}
