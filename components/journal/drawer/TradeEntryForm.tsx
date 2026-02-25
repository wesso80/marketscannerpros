'use client';

import { useState, type FormEvent } from 'react';

export interface TradeEntryPayload {
  symbol: string;
  side: 'LONG' | 'SHORT';
  assetClass: 'equity' | 'crypto' | 'forex' | 'commodity';
  tradeType: 'Spot' | 'Options' | 'Futures' | 'Margin';
  entryPrice: number;
  quantity: number;
  stopLoss?: number;
  target?: number;
  strategy?: string;
  setup?: string;
  notes?: string;
  tradeDate: string;
  // Options fields
  optionType?: 'CALL' | 'PUT';
  strikePrice?: number;
  expirationDate?: string;
  premium?: number;
  // Leverage fields (Futures / Margin)
  leverage?: number;
}

export interface TradeEntryInitialValues {
  symbol?: string;
  side?: 'LONG' | 'SHORT';
  assetClass?: 'equity' | 'crypto' | 'forex' | 'commodity';
  tradeType?: 'Spot' | 'Options' | 'Futures' | 'Margin';
  entryPrice?: string;
  quantity?: string;
  strategy?: string;
  setup?: string;
  notes?: string;
}

interface TradeEntryFormProps {
  onSubmit: (payload: TradeEntryPayload) => Promise<void>;
  onCancel: () => void;
  initialValues?: TradeEntryInitialValues;
}

const INPUT =
  'w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30';
const LABEL = 'block text-xs font-medium text-slate-400 mb-1';
const SELECT =
  'w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30';

export default function TradeEntryForm({ onSubmit, onCancel, initialValues }: TradeEntryFormProps) {
  const iv = initialValues;
  const [symbol, setSymbol] = useState(iv?.symbol || '');
  const [side, setSide] = useState<'LONG' | 'SHORT'>(iv?.side || 'LONG');
  const [assetClass, setAssetClass] = useState<'equity' | 'crypto' | 'forex' | 'commodity'>(iv?.assetClass || 'equity');
  const [tradeType, setTradeType] = useState<'Spot' | 'Options' | 'Futures' | 'Margin'>(iv?.tradeType || 'Spot');
  const [entryPrice, setEntryPrice] = useState(iv?.entryPrice || '');
  const [quantity, setQuantity] = useState(iv?.quantity || '');
  const [stopLoss, setStopLoss] = useState('');
  const [target, setTarget] = useState('');
  const [strategy, setStrategy] = useState(iv?.strategy || '');
  const [setup, setSetup] = useState(iv?.setup || '');
  const [notes, setNotes] = useState(iv?.notes || '');
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Options-specific state
  const [optionType, setOptionType] = useState<'CALL' | 'PUT'>('CALL');
  const [strikePrice, setStrikePrice] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [premium, setPremium] = useState('');

  // Leverage state (Futures / Margin)
  const [leverage, setLeverage] = useState('');

  // Computed risk metrics
  const ep = parseFloat(entryPrice);
  const sl = parseFloat(stopLoss);
  const tp = parseFloat(target);
  const qty = parseFloat(quantity);
  const riskPerUnit = Number.isFinite(ep) && Number.isFinite(sl) ? Math.abs(ep - sl) : undefined;
  const riskUsd = riskPerUnit && Number.isFinite(qty) ? riskPerUnit * qty : undefined;
  const rewardPerUnit = Number.isFinite(ep) && Number.isFinite(tp) ? Math.abs(tp - ep) : undefined;
  const rrRatio = riskPerUnit && rewardPerUnit && riskPerUnit > 0 ? (rewardPerUnit / riskPerUnit) : undefined;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!symbol.trim()) { setError('Symbol is required'); return; }
    if (!Number.isFinite(ep) || ep <= 0) { setError('Entry price must be a positive number'); return; }
    if (!Number.isFinite(qty) || qty <= 0) { setError('Quantity must be a positive number'); return; }

    setSubmitting(true);
    try {
      const sp = parseFloat(strikePrice);
      const prem = parseFloat(premium);
      const lev = parseFloat(leverage);

      await onSubmit({
        symbol: symbol.trim().toUpperCase(),
        side,
        assetClass,
        tradeType,
        entryPrice: ep,
        quantity: qty,
        stopLoss: Number.isFinite(sl) && sl > 0 ? sl : undefined,
        target: Number.isFinite(tp) && tp > 0 ? tp : undefined,
        strategy: strategy.trim() || undefined,
        setup: setup.trim() || undefined,
        notes: notes.trim() || undefined,
        tradeDate,
        // Options extras
        ...(tradeType === 'Options' && {
          optionType,
          strikePrice: Number.isFinite(sp) && sp > 0 ? sp : undefined,
          expirationDate: expirationDate || undefined,
          premium: Number.isFinite(prem) && prem > 0 ? prem : undefined,
        }),
        // Leverage extras
        ...((tradeType === 'Futures' || tradeType === 'Margin') && {
          leverage: Number.isFinite(lev) && lev > 0 ? lev : undefined,
        }),
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to create trade');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
        <h3 className="mb-3 text-sm font-semibold text-emerald-300">New Manual Trade</h3>

        {/* Row 1: Symbol + Side */}
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Symbol *</label>
            <input
              id="trade-symbol"
              name="symbol"
              type="text"
              className={INPUT}
              placeholder="AAPL, BTC-USD…"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className={LABEL}>Side *</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSide('LONG')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  side === 'LONG'
                    ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                    : 'border-white/15 bg-black/20 text-slate-400 hover:border-white/25'
                }`}
              >
                Long
              </button>
              <button
                type="button"
                onClick={() => setSide('SHORT')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  side === 'SHORT'
                    ? 'border-red-500/40 bg-red-500/20 text-red-300'
                    : 'border-white/15 bg-black/20 text-slate-400 hover:border-white/25'
                }`}
              >
                Short
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Asset Class + Trade Type */}
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Asset Class</label>
            <select className={SELECT} value={assetClass} onChange={(e) => setAssetClass(e.target.value as any)}>
              <option value="equity">Equity</option>
              <option value="crypto">Crypto</option>
              <option value="forex">Forex</option>
              <option value="commodity">Commodity</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Trade Type</label>
            <select className={SELECT} value={tradeType} onChange={(e) => setTradeType(e.target.value as any)}>
              <option value="Spot">Spot</option>
              <option value="Options">Options</option>
              <option value="Futures">Futures</option>
              <option value="Margin">Margin</option>
            </select>
          </div>
        </div>

        {/* Options Fields */}
        {tradeType === 'Options' && (
          <div className="mb-3 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
            <div className="mb-2 text-xs font-semibold text-purple-300">Options Details</div>
            <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Option Type *</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOptionType('CALL')}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      optionType === 'CALL'
                        ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                        : 'border-white/15 bg-black/20 text-slate-400 hover:border-white/25'
                    }`}
                  >
                    Call
                  </button>
                  <button
                    type="button"
                    onClick={() => setOptionType('PUT')}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      optionType === 'PUT'
                        ? 'border-red-500/40 bg-red-500/20 text-red-300'
                        : 'border-white/15 bg-black/20 text-slate-400 hover:border-white/25'
                    }`}
                  >
                    Put
                  </button>
                </div>
              </div>
              <div>
                <label className={LABEL}>Strike Price</label>
                <input
                  id="trade-strike-price"
                  name="strikePrice"
                  type="number"
                  step="any"
                  min="0"
                  className={INPUT}
                  placeholder="0.00"
                  value={strikePrice}
                  onChange={(e) => setStrikePrice(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Expiration Date</label>
                <input
                  id="trade-expiration"
                  name="expirationDate"
                  type="date"
                  className={INPUT}
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL}>Premium (per contract)</label>
                <input
                  id="trade-premium"
                  name="premium"
                  type="number"
                  step="any"
                  min="0"
                  className={INPUT}
                  placeholder="0.00"
                  value={premium}
                  onChange={(e) => setPremium(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Leverage Fields (Futures / Margin) */}
        {(tradeType === 'Futures' || tradeType === 'Margin') && (
          <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="mb-2 text-xs font-semibold text-amber-300">
              {tradeType} Details
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Leverage</label>
                <div className="relative">
                  <input
                    id="trade-leverage"
                    name="leverage"
                    type="number"
                    step="any"
                    min="1"
                    className={INPUT}
                    placeholder="e.g. 10"
                    value={leverage}
                    onChange={(e) => setLeverage(e.target.value)}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">x</span>
                </div>
              </div>
              <div className="flex items-end">
                {Number.isFinite(parseFloat(leverage)) && parseFloat(leverage) > 0 && Number.isFinite(ep) && Number.isFinite(qty) && (
                  <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
                    Notional: <span className="font-semibold text-amber-300">${(ep * qty * parseFloat(leverage)).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Row 3: Entry Price + Quantity */}
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Entry Price *</label>
            <input
              id="trade-entry-price"
              name="entryPrice"
              type="number"
              step="any"
              min="0"
              className={INPUT}
              placeholder="0.00"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Quantity *</label>
            <input
              id="trade-quantity"
              name="quantity"
              type="number"
              step="any"
              min="0"
              className={INPUT}
              placeholder="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
        </div>

        {/* Row 4: Stop Loss + Target */}
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Stop Loss</label>
            <input
              id="trade-stop-loss"
              name="stopLoss"
              type="number"
              step="any"
              min="0"
              className={INPUT}
              placeholder="Optional"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Target</label>
            <input
              id="trade-target"
              name="target"
              type="number"
              step="any"
              min="0"
              className={INPUT}
              placeholder="Optional"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
        </div>

        {/* Risk Metrics Preview */}
        {(riskUsd || rrRatio) && (
          <div className="mb-3 flex items-center gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs">
            {riskUsd !== undefined && (
              <span className="text-amber-400">
                Risk: ${riskUsd.toFixed(2)}
              </span>
            )}
            {rrRatio !== undefined && (
              <span className={rrRatio >= 2 ? 'text-emerald-400' : rrRatio >= 1 ? 'text-amber-400' : 'text-red-400'}>
                R:R {rrRatio.toFixed(2)}
              </span>
            )}
          </div>
        )}

        {/* Row 5: Date */}
        <div className="mb-3">
          <label className={LABEL}>Trade Date</label>
          <input
            id="trade-date"
            name="tradeDate"
            type="date"
            className={INPUT}
            value={tradeDate}
            onChange={(e) => setTradeDate(e.target.value)}
          />
        </div>

        {/* Row 6: Strategy + Setup */}
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Strategy</label>
            <input
              id="trade-strategy"
              name="strategy"
              type="text"
              className={INPUT}
              placeholder="e.g. Breakout, Mean Reversion"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Setup</label>
            <input
              id="trade-setup"
              name="setup"
              type="text"
              className={INPUT}
              placeholder="e.g. Bull Flag, Gap Fill"
              value={setup}
              onChange={(e) => setSetup(e.target.value)}
            />
          </div>
        </div>

        {/* Row 7: Notes */}
        <div className="mb-3">
          <label className={LABEL}>Notes</label>
          <textarea
            className={`${INPUT} min-h-[60px] resize-y`}
            placeholder="Entry thesis, observations…"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create Trade'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
