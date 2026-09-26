'use client';

import { useEffect, useMemo, useState } from 'react';
import { TradeModel } from '@/types/journal';
import { closeExitPrefill, isOptionsTrade } from '@/lib/journal/closePrefill';
import { buildCloseReviewNotes, closeOutcomeFromPrices, followedPlanValue, type CloseErrorType, type SetupQuality } from '@/lib/journal/closeReview';

type CloseTradeModalProps = {
  open: boolean;
  trade?: TradeModel;
  onClose: () => void;
  onSubmit: (req: {
    exitPrice: number;
    exitTs: string;
    closeReason: 'tp' | 'sl' | 'time' | 'manual' | 'invalid' | 'signal_flip' | 'risk_off';
    /** null = not answered (stored as NULL, ignored by rule adherence). */
    followedPlan: boolean | null;
    /** Exit notes built from the answered review fields only. */
    notes: string;
  }) => Promise<void>;
};

export default function CloseTradeModal({ open, trade, onClose, onSubmit }: CloseTradeModalProps) {
  const [exitPrice, setExitPrice] = useState('');
  const [exitTs, setExitTs] = useState(new Date().toISOString().slice(0, 16));
  const [closeReason, setCloseReason] = useState<'tp' | 'sl' | 'time' | 'manual' | 'invalid' | 'signal_flip' | 'risk_off'>('manual');
  // Review answers start unanswered; nothing is saved for them unless the user picks a value.
  const [setupQuality, setSetupQuality] = useState<SetupQuality | ''>('');
  const [followedPlan, setFollowedPlan] = useState<'' | 'yes' | 'no'>('');
  const [errorType, setErrorType] = useState<CloseErrorType | ''>('');
  const [reviewText, setReviewText] = useState('');
  const [optionMarkMissing, setOptionMarkMissing] = useState(false);

  // Reset form state when modal opens or trade changes
  useEffect(() => {
    if (open) {
      // Pre-fill from the trade's current mark (option premium for options trades).
      // Options never fall back to the underlying's share price: no option mark → empty field.
      const prefill = closeExitPrefill(trade);
      setExitPrice(prefill.kind === 'value' ? String(prefill.price) : '');
      setOptionMarkMissing(prefill.kind === 'manual' && prefill.reason === 'option_mark_unavailable');
      setExitTs(new Date().toISOString().slice(0, 16));
      setCloseReason('manual');
      setSetupQuality('');
      setFollowedPlan('');
      // A missing stop is a fact from the trade, not a guess, so it is pre-selected (and can be changed).
      setErrorType(trade?.stop == null ? 'no_stop' : '');
      setReviewText('');

      // Stocks/crypto with no mark yet: fetch a quote as a fallback (never for options).
      if (prefill.kind === 'fetch') {
        let cancelled = false;
        fetch(prefill.url, { cache: 'no-store' })
          .then(r => r.json())
          .then(j => {
            if (!cancelled && j?.ok && typeof j.price === 'number' && j.price > 0) {
              // Don't overwrite a price the user has already typed.
              setExitPrice(prev => (prev === '' ? String(j.price) : prev));
            }
          })
          .catch(() => {});
        return () => { cancelled = true; };
      }
    }
  }, [open, trade?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live marks load asynchronously: if the mark arrives after the modal opened, fill an empty field with it.
  const markPrice = trade?.mark?.price;
  useEffect(() => {
    if (!open || typeof markPrice !== 'number' || !Number.isFinite(markPrice) || markPrice <= 0) return;
    setExitPrice(prev => (prev === '' ? String(markPrice) : prev));
    setOptionMarkMissing(false);
  }, [open, markPrice]);

  const canSubmit = useMemo(() => {
    return Number(exitPrice) > 0 && Boolean(exitTs) && Boolean(closeReason);
  }, [closeReason, exitPrice, exitTs]);

  // Outcome is derived from the realised P&L (the server stores the same), never chosen by hand.
  const derivedOutcome = trade ? closeOutcomeFromPrices(trade.side, trade.entry.price, Number(exitPrice)) : null;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-trade-title"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      onClick={onClose}
    >
      <div className="absolute left-1/2 top-1/2 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-slate-950 p-4" onClick={(e) => e.stopPropagation()}>
        <div id="close-trade-title" className="mb-3 text-lg font-semibold text-slate-100">Close Trade {trade ? `• ${trade.symbol}` : ''}</div>

        {trade?.stop == null && (
          <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            Stop was missing at entry. Error type is pre-set to no_stop.
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div>
            <label htmlFor="close-exit-price" className="block text-xs font-medium text-slate-400 mb-1">{trade && isOptionsTrade(trade) ? 'Exit Premium (per share) *' : 'Exit Price *'}</label>
            <input id="close-exit-price" name="exitPrice" value={exitPrice} onChange={(event) => setExitPrice(event.target.value)} placeholder={trade && isOptionsTrade(trade) ? 'Option premium per share' : 'Exit price'} aria-required="true" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100" />
            {optionMarkMissing && (
              <p className="mt-1 text-[11px] text-amber-300">No current option mark. Enter the option premium you closed at.</p>
            )}
          </div>
          <div>
            <label htmlFor="close-exit-ts" className="block text-xs font-medium text-slate-400 mb-1">Exit Date/Time *</label>
            <input id="close-exit-ts" name="exitTs" type="datetime-local" value={exitTs} onChange={(event) => setExitTs(event.target.value)} aria-required="true" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100" />
          </div>

          <div>
            <label htmlFor="close-reason" className="block text-xs font-medium text-slate-400 mb-1">Close Reason *</label>
            <select id="close-reason" value={closeReason} onChange={(event) => setCloseReason(event.target.value as typeof closeReason)} aria-required="true" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
              <option value="tp">tp</option>
              <option value="sl">sl</option>
              <option value="time">time</option>
              <option value="manual">manual</option>
              <option value="invalid">invalid</option>
              <option value="signal_flip">signal_flip</option>
              <option value="risk_off">risk_off</option>
            </select>
          </div>

          <div>
            <div className="block text-xs font-medium text-slate-400 mb-1">Outcome</div>
            <div id="close-outcome" aria-live="polite" className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-slate-300">
              {derivedOutcome ?? '—'} <span className="text-[11px] text-slate-500">(from realised P&amp;L)</span>
            </div>
          </div>

          <div>
            <label htmlFor="close-setup-quality" className="block text-xs font-medium text-slate-400 mb-1">Setup Quality</label>
            <select id="close-setup-quality" value={setupQuality} onChange={(event) => setSetupQuality(event.target.value as typeof setupQuality)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
              <option value="">Not rated</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
          </div>

          <div>
            <label htmlFor="close-error-type" className="block text-xs font-medium text-slate-400 mb-1">Error Type</label>
            <select id="close-error-type" value={errorType} onChange={(event) => setErrorType(event.target.value as typeof errorType)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
              <option value="">Not answered</option>
              {['none', 'entry_early', 'entry_late', 'no_stop', 'oversize', 'ignored_signal', 'bad_liquidity', 'chop', 'news_spike', 'emotion', 'unknown'].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 max-w-xs">
          <label htmlFor="close-followed-plan" className="block text-xs font-medium text-slate-400 mb-1">Followed plan?</label>
          <select id="close-followed-plan" name="followedPlan" value={followedPlan} onChange={(event) => setFollowedPlan(event.target.value as typeof followedPlan)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
            <option value="">Not answered</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        <div className="mt-3">
          <label htmlFor="close-review-text" className="block text-xs font-medium text-slate-400 mb-1">Review Notes</label>
          <textarea id="close-review-text" value={reviewText} onChange={(event) => setReviewText(event.target.value)} placeholder="Review text (optional)" className="min-h-20 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100" />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded bg-white/10 px-3 py-2 text-sm text-slate-100">Cancel</button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => onSubmit({
              exitPrice: Number(exitPrice),
              exitTs: new Date(exitTs).toISOString(),
              closeReason,
              followedPlan: followedPlanValue(followedPlan),
              notes: buildCloseReviewNotes({ setupQuality, errorType, reviewText }),
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
