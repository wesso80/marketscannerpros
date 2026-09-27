'use client';
import { useEffect, useState } from 'react';
import type { DecisionRecord, reviewCheckpoints } from '@/lib/admin/decisionRecords';
type Row = DecisionRecord & { checkpoints: ReturnType<typeof reviewCheckpoints> };
export default function DecisionJournal({ version }: { version: number }) {
  const [records, setRecords] = useState<Row[]>([]);
  const [message, setMessage] = useState('Loading saved decisions…');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/decision-records', { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || 'History unavailable'); return data; })
      .then(data => { if (!controller.signal.aborted) { setRecords(data.records); setMessage(data.message || (data.records.length ? '' : 'No research decisions saved yet.')); } })
      .catch(e => { if (!controller.signal.aborted) { setRecords([]); setMessage(e.message); } });
    return () => controller.abort();
  }, [version]);
  return <section aria-label="Research decision history" className="space-y-3 rounded border border-slate-700 p-4">
    <h2 className="text-lg font-bold">Research decision history</h2>
    <p className="text-sm text-slate-400">Latest 100 decisions for your workspace. Original evidence stays fixed; 42-/84-day dates are review checkpoints, not assumed entries or realized returns.</p>
    {message && <p role="status" className="text-sm text-amber-200">{message}</p>}
    {records.map(row => <details key={row.id} className="rounded border border-slate-800 p-3"><summary className="cursor-pointer">{row.symbol} · {row.market} · {row.action} · {new Date(row.created_at).toLocaleString()}</summary>
      <p className="my-2 text-sm">{row.note}</p><p className="text-xs text-slate-400">{row.strategy_id} · original assessment {row.evidence.assessment.status} · evidence {row.evidence.assessment.evidenceId.slice(0,12)}</p>
      {row.checkpoints.map(c => <p key={c.horizonDays} className="mt-1 text-sm">{c.horizonDays}-day review: {new Date(c.dueAt).toLocaleString()} · {c.status}</p>)}
      <details className="mt-2"><summary className="cursor-pointer text-sm text-cyan-300">Original evidence snapshot</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs text-slate-400">{JSON.stringify(row.evidence, null, 2)}</pre></details>
    </details>)}
  </section>;
}
