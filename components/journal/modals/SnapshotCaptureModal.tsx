'use client';

import { useState } from 'react';

type SnapshotCaptureModalProps = {
  open: boolean;
  tradeId?: string;
  onClose: () => void;
  onSubmit: (payload: { source: 'scanner' | 'options' | 'time'; phase: 'entry' | 'mid' | 'exit' }) => Promise<void>;
};

export default function SnapshotCaptureModal({ open, tradeId, onClose, onSubmit }: SnapshotCaptureModalProps) {
  const [source, setSource] = useState<'scanner' | 'options' | 'time'>('scanner');
  const [phase, setPhase] = useState<'entry' | 'mid' | 'exit'>('mid');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40">
      <div className="absolute left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-slate-950 p-4">
        <div className="text-lg font-semibold text-slate-100">Capture Snapshot {tradeId ? `• ${tradeId}` : ''}</div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <select value={source} onChange={(event) => setSource(event.target.value as typeof source)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
            <option value="scanner">scanner</option>
            <option value="options">options</option>
            <option value="time">time</option>
          </select>
          <select value={phase} onChange={(event) => setPhase(event.target.value as typeof phase)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
            <option value="entry">entry</option>
            <option value="mid">mid</option>
            <option value="exit">exit</option>
          </select>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded bg-white/10 px-3 py-2 text-sm text-slate-100">Cancel</button>
          <button onClick={() => onSubmit({ source, phase })} className="rounded bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-200">Capture</button>
        </div>
      </div>
    </div>
  );
}
