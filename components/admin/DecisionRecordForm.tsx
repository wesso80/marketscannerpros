'use client';
import { useRef, useState } from 'react';
import type { DecisionAssessment } from '@/lib/admin/decisionDesk';
export default function DecisionRecordForm({ row, onSaved }: { row: DecisionAssessment; onSaved: () => void }) {
  const [action, setAction] = useState('WATCH');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  const requestId = useRef<string | null>(null);
  async function save() {
    if (saving || saved) return;
    setSaving(true); setMessage(''); requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch('/api/admin/decision-records', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: row.symbol, market: row.market, action, note, evidenceId: row.evidenceId, requestId: requestId.current }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Save failed');
      setSaved(true); setMessage('Research decision saved with its evidence and 42-/84-day review dates.'); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Save failed'); }
    finally { setSaving(false); }
  }
  return <section className="my-3 space-y-2 rounded border border-slate-600 p-3" aria-label={`Record research decision for ${row.symbol}`}>
    <h3 className="font-semibold">Your research decision</h3>
    <p className="text-xs text-slate-400">Save a note and the evidence you reviewed. This does not approve exposure, create a trade or send a notification.</p>
    <label className="block text-sm">Decision <select disabled={saving || saved} value={action} onChange={e => { setAction(e.target.value); requestId.current = null; }} className="ml-2 rounded bg-slate-800 p-2"><option value="WATCH">Watch</option><option value="DECLINED">Declined</option><option value="FOLLOW_UP">Follow up</option></select></label>
    <label className="block text-sm">Reason <textarea disabled={saving || saved} value={note} minLength={10} maxLength={2000} onChange={e => { setNote(e.target.value); requestId.current = null; }} placeholder="Your thesis, concerns and what to check next (at least 10 characters)" className="mt-1 block w-full rounded bg-slate-800 p-2" /></label>
    <button type="button" disabled={saving || saved || note.trim().length < 10} onClick={save} className="rounded bg-emerald-700 px-3 py-2 text-sm disabled:opacity-40">{saving ? 'Saving…' : saved ? 'Saved' : 'Save research decision'}</button>
    {message && <p role="status" className="text-sm text-amber-200">{message}</p>}
  </section>;
}
