'use client';

import { useEffect, useMemo, useState } from 'react';
import { TradeModel } from '@/types/journal';

type CloseTradeModalProps = {
  open: boolean;
  trade?: TradeModel;
  onClose: () => void;
  onSubmit: (req: {
    exitPrice: number;
    exitTs: string;
    closeReason: 'tp' | 'sl' | 'time' | 'manual' | 'invalid' | 'signal_flip' | 'risk_off';
    outcome: 'win' | 'loss' | 'scratch' | 'breakeven';
    setupQuality: 'A' | 'B' | 'C' | 'D';
    followedPlan: boolean;
    errorType:
      | 'none'
      | 'entry_early'
      | 'entry_late'
      | 'no_stop'
      | 'oversize'
      | 'ignored_signal'
      | 'bad_liquidity'
      | 'chop'
      | 'news_spike'
      | 'emotion'
      | 'unknown';
    reviewText?: string;
  }) => Promise<void>;
};

export default function CloseTradeModal({ open, trade, onClose, onSubmit }: CloseTradeModalProps) {
  const [exitPrice, setExitPrice] = useState('');
  const [exitTs, setExitTs] = useState(new Date().toISOString().slice(0, 16));
  const [closeReason, setCloseReason] = useState<'tp' | 'sl' | 'time' | 'manual' | 'invalid' | 'signal_flip' | 'risk_off'>('manual');
  const [outcome, setOutcome] = useState<'win' | 'loss' | 'scratch' | 'breakeven'>('breakeven');
  const [setupQuality, setSetupQuality] = useState<'A' | 'B' | 'C' | 'D'>('B');
  const [followedPlan, setFollowedPlan] = useState(true);
  const [errorType, setErrorType] = useState<
    | 'none'
    | 'entry_early'
    | 'entry_late'
    | 'no_stop'
    | 'oversize'
    | 'ignored_signal'
    | 'bad_liquidity'
    | 'chop'
    | 'news_spike'
    | 'emotion'
    | 'unknown'
  >('none');
  const [reviewText, setReviewText] = useState('');

  // Reset form state when modal opens or trade changes
  useEffect(() => {
    if (open) {
      setExitPrice('');
      setExitTs(new Date().toISOString().slice(0, 16));
      setCloseReason('manual');
      setOutcome('breakeven');
      setSetupQuality('B');
      setFollowedPlan(true);
      setErrorType('none');
      setReviewText('');
    }
  }, [open, trade?.id]);

  const canSubmit = useMemo(() => {
    return Number(exitPrice) > 0 && Boolean(exitTs) && Boolean(closeReason) && Boolean(outcome) && Boolean(setupQuality);
  }, [closeReason, exitPrice, exitTs, outcome, setupQuality]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40">
      <div className="absolute left-1/2 top-1/2 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-slate-950 p-4">
        <div className="mb-3 text-lg font-semibold text-slate-100">Close Trade {trade ? `• ${trade.symbol}` : ''}</div>

        {trade?.stop == null && (
          <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            Stop was missing at entry. Defaulting error type to no_stop.
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <input value={exitPrice} onChange={(event) => setExitPrice(event.target.value)} placeholder="Exit price" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100" />
          <input type="datetime-local" value={exitTs} onChange={(event) => setExitTs(event.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100" />

          <select value={closeReason} onChange={(event) => setCloseReason(event.target.value as typeof closeReason)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
            <option value="tp">tp</option>
            <option value="sl">sl</option>
            <option value="time">time</option>
            <option value="manual">manual</option>
            <option value="invalid">invalid</option>
            <option value="signal_flip">signal_flip</option>
            <option value="risk_off">risk_off</option>
          </select>

          <select value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
            <option value="win">win</option>
            <option value="loss">loss</option>
            <option value="scratch">scratch</option>
            <option value="breakeven">breakeven</option>
          </select>

          <select value={setupQuality} onChange={(event) => setSetupQuality(event.target.value as typeof setupQuality)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
          </select>

          <select value={errorType} onChange={(event) => setErrorType(event.target.value as typeof errorType)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
            {['none', 'entry_early', 'entry_late', 'no_stop', 'oversize', 'ignored_signal', 'bad_liquidity', 'chop', 'news_spike', 'emotion', 'unknown'].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={followedPlan} onChange={(event) => setFollowedPlan(event.target.checked)} />
          Followed plan
        </label>

        <textarea value={reviewText} onChange={(event) => setReviewText(event.target.value)} placeholder="Review text (optional)" className="mt-3 min-h-20 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100" />

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded bg-white/10 px-3 py-2 text-sm text-slate-100">Cancel</button>
          <button
            disabled={!canSubmit}
            onClick={() => onSubmit({
              exitPrice: Number(exitPrice),
              exitTs: new Date(exitTs).toISOString(),
              closeReason,
              outcome,
              setupQuality,
              followedPlan,
              errorType: trade?.stop == null ? 'no_stop' : errorType,
              reviewText,
            })}
            className="rounded bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-200 disabled:opacity-40"
          >
            Submit Close
          </button>
        </div>
      </div>
    </div>
  );
}
