'use client';

import { useState, type FormEvent } from 'react';
import { TradeModel } from '@/types/journal';
import { markTimeLabel, optionContractLabel } from '@/lib/journal/display';

export type TradeLevelsPatch = { stopLoss: number | null; target: number | null };

function fmt(n: number | undefined | null): string {
  return n == null || !Number.isFinite(n) ? '—' : n.toFixed(n >= 1 ? 2 : 4);
}

export default function TradeOverviewTab({ trade, onUpdateLevels }: { trade?: TradeModel; onUpdateLevels?: (patch: TradeLevelsPatch) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [stop, setStop] = useState('');
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!trade) return <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">Create a new trade from this drawer.</div>;
  const contract = optionContractLabel(trade);
  const currentTarget = trade.targets && trade.targets.length ? trade.targets[0] : undefined;
  const isOption = trade.tradeType === 'Options';
  const canEdit = trade.status === 'open' && Boolean(onUpdateLevels);

  const startEdit = () => {
    setStop(trade.stop != null ? String(trade.stop) : '');
    setTarget(currentTarget != null ? String(currentTarget) : '');
    setError(null);
    setEditing(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!onUpdateLevels) return;
    const s = stop.trim() === '' ? null : Number(stop);
    const t = target.trim() === '' ? null : Number(target);
    if (s != null && !(Number.isFinite(s) && s > 0)) { setError('Stop must be a positive number, or blank.'); return; }
    if (t != null && !(Number.isFinite(t) && t > 0)) { setError('Target must be a positive number, or blank.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onUpdateLevels({ stopLoss: s, target: t });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 text-sm text-slate-200">
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-slate-400">Lifecycle</div>
        {contract && <div>Contract: {contract}</div>}
        <div>Entry: {trade.entry.price.toFixed(2)}{isOption ? ' (premium per share)' : ''} · {new Date(trade.entry.ts).toLocaleString()}</div>
        <div>Exit: {trade.exit ? `${trade.exit.price.toFixed(2)} · ${new Date(trade.exit.ts).toLocaleString()}` : 'Open'}</div>
        <div>{isOption ? 'Contracts' : 'Qty'}: {trade.qty}</div>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-slate-400">Plan</div>
          {canEdit && !editing && (
            <button type="button" onClick={startEdit} className="rounded bg-white/10 px-2 py-1 text-xs text-slate-100" data-testid="edit-levels">Edit stop / target</button>
          )}
        </div>
        {!editing ? (
          <>
            <div>Stop: {fmt(trade.stop)}</div>
            <div>Target: {fmt(currentTarget)}</div>
            {trade.status !== 'open' && <div className="mt-1 text-xs text-slate-500">Closed trades keep the levels their R was worked out from.</div>}
          </>
        ) : (
          <form onSubmit={save} className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-400">Stop{isOption ? ' (premium)' : ''}
                <input type="number" step="any" min="0" value={stop} onChange={(e) => setStop(e.target.value)} placeholder="No stop" className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-sm text-slate-100" />
              </label>
              <label className="text-xs text-slate-400">Target{isOption ? ' (premium)' : ''}
                <input type="number" step="any" min="0" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="No target" className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-sm text-slate-100" />
              </label>
            </div>
            <p className="text-[11px] text-slate-500">Leave a field blank to remove it. Open R and the auto-close check use these levels.</p>
            {error && <div className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-300">{error}</div>}
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" onClick={() => setEditing(false)} className="rounded bg-white/10 px-3 py-1 text-xs text-slate-100">Cancel</button>
            </div>
          </form>
        )}
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-slate-400">Forensics</div>
        <div>P&L: {trade.pnlUsd == null || !Number.isFinite(trade.pnlUsd) ? 'Unavailable (no usable quote)' : `${trade.pnlUsd.toFixed(2)} (${Number(trade.pnlPct || 0).toFixed(2)}%)`}</div>
        {trade.mark && <div>Mark: {trade.mark.price.toFixed(2)} · <span className="text-slate-400">{markTimeLabel(trade.mark)}</span></div>}
        <div>R Multiple: {trade.rMultiple != null ? trade.rMultiple.toFixed(2) : 'N/A'}</div>
      </div>
    </div>
  );
}
