'use client';

import { useState } from 'react';
import { TradeModel } from '@/types/journal';

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** TR-28: saved notes plus "Add Note" (appended with today's local date). */
export default function TradeNotesTab({ trade, onAddNote }: { trade?: TradeModel; onAddNote?: (note: string, noteDate: string) => Promise<void> }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!trade) return <div className="text-sm text-slate-400">No trade selected.</div>;
  const saved = trade.notes ?? (trade.notesPreview || []).join('\n');

  const add = async () => {
    if (!onAddNote || !note.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onAddNote(note.trim(), localDate());
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 text-sm text-slate-200">
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="mb-1 text-xs text-slate-400">Saved notes</div>
        {saved ? <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{saved}</p> : <p className="text-xs text-slate-500">No notes yet.</p>}
      </div>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Add a note (saved with today's date)"
        maxLength={2000}
        className="min-h-24 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100"
      />
      {error && <div className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-300">{error}</div>}
      <button
        type="button"
        onClick={add}
        disabled={!onAddNote || saving || !note.trim()}
        className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Add Note'}
      </button>
    </div>
  );
}
