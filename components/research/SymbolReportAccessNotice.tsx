'use client';
import type { ReportAccessIssue } from '@/lib/publicReportAccessError';
export default function SymbolReportAccessNotice({issue, returnTo, onRetry}: {
  issue: ReportAccessIssue; returnTo: string; onRetry: () => void;
}) {
  const pending = issue.kind === 'pending';
  return <section role="status" aria-label="Symbol report access" className="rounded-xl border border-teal-300/20 bg-teal-300/5 p-5 text-sm text-slate-200">
    <h2 className="text-lg font-semibold text-white">{pending ? 'Your report is being prepared' : 'Daily Symbol report allowance reached'}</h2>
    <p className="mt-2">{pending ? 'Another request for this ticker is still pending. Checking again will not use another report.' : 'You can reopen tickers already unlocked today without using another report.'}</p>
    {!pending && (issue.resetsAt ? <p className="mt-2">New reports reset <time dateTime={issue.resetsAt}>{new Date(issue.resetsAt).toLocaleString(undefined, {month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})}</time> in your local time · midnight US Eastern.</p> : <p className="mt-2">The reset time is temporarily unavailable. Check your allowance again shortly.</p>)}
    <div className="mt-4 flex flex-wrap gap-3">
      {!pending && issue.plan === 'visitor' && <a href={`/auth?next=${encodeURIComponent(returnTo)}`} className="inline-flex min-h-11 items-center rounded-lg bg-teal-200 px-4 font-semibold text-slate-950">Sign up or sign in · 3 reports daily</a>}
      {!pending && issue.plan === 'free' && <a href="/pricing" className="inline-flex min-h-11 items-center rounded-lg bg-teal-200 px-4 font-semibold text-slate-950">Explore Pro · unlimited reports</a>}
      <button type="button" onClick={onRetry} className="min-h-11 rounded-lg border border-white/20 px-4">{pending ? 'Check report status' : 'Check allowance again'}</button>
    </div>
  </section>;
}
