'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { ExpirationMeta, TerminalMode } from '@/types/optionsTerminal';

/* ─── Props ──────────────────────────────────────────────────────── */
interface Props {
  symbol: string;
  onSymbolChange: (s: string) => void;
  underlyingPrice: number;
  priceChange?: number;
  sessionLabel?: string;
  expirations: ExpirationMeta[];
  selectedExpiry: string;
  onExpiryChange: (d: string) => void;
  mode: TerminalMode;
  onModeToggle: () => void;
  loading: boolean;
  provider: string;
}

/* ─── Component ──────────────────────────────────────────────────── */
export default function OptionsTopStrip({
  symbol,
  onSymbolChange,
  underlyingPrice,
  priceChange = 0,
  sessionLabel,
  expirations,
  selectedExpiry,
  onExpiryChange,
  mode,
  onModeToggle,
  loading,
  provider,
}: Props) {
  const [input, setInput] = useState(symbol);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setInput(symbol); }, [symbol]);

  const submit = () => {
    const trimmed = input.trim().toUpperCase();
    if (trimmed && trimmed !== symbol) onSymbolChange(trimmed);
  };

  const pctChange = underlyingPrice > 0 ? priceChange / underlyingPrice * 100 : 0;
  const changeColor = priceChange >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)';

  return (
    <div
      className="sticky top-0 z-30 flex flex-wrap items-center gap-3 px-4 py-2 border-b"
      style={{
        background: 'var(--msp-panel)',
        borderColor: 'var(--msp-border)',
      }}
    >
      {/* Ticker search */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center rounded-lg border px-2 py-1.5"
          style={{ borderColor: 'var(--msp-border-strong)', background: 'var(--msp-bg)' }}
        >
          <svg className="w-4 h-4 mr-1.5 shrink-0" style={{ color: 'var(--msp-text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            onBlur={submit}
            placeholder="Ticker…"
            className="bg-transparent outline-none w-20 text-sm font-mono font-semibold"
            style={{ color: 'var(--msp-text)' }}
          />
        </div>
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
          style={{ background: 'var(--msp-accent-glow)', color: 'var(--msp-accent)' }}
        >
          OPTIONS
        </span>
      </div>

      {/* Underlying price tape */}
      {underlyingPrice > 0 && (
        <div className="flex items-baseline gap-2 ml-2">
          <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--msp-text)' }}>
            ${underlyingPrice.toFixed(2)}
          </span>
          <span className="text-xs font-medium tabular-nums" style={{ color: changeColor }}>
            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({pctChange.toFixed(2)}%)
          </span>
          {sessionLabel && (
            <span className="text-[10px] font-medium" style={{ color: 'var(--msp-text-faint)' }}>
              {sessionLabel}
            </span>
          )}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Expiry selector */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--msp-text-faint)' }}>
          Expiry
        </label>
        <select
          value={selectedExpiry}
          onChange={(e) => onExpiryChange(e.target.value)}
          className="text-xs rounded-md border px-2 py-1.5 font-mono cursor-pointer"
          style={{
            background: 'var(--msp-bg)',
            borderColor: 'var(--msp-border-strong)',
            color: 'var(--msp-text)',
          }}
        >
          <option value="">All Expirations</option>
          {expirations.map((exp) => (
            <option key={exp.date} value={exp.date}>
              {exp.label}
            </option>
          ))}
        </select>
      </div>

      {/* Mode toggle */}
      <button
        onClick={onModeToggle}
        className="flex items-center gap-1.5 text-xs font-semibold rounded-md border px-3 py-1.5 transition-colors"
        style={{
          borderColor: mode === 'institutional' ? 'var(--msp-accent)' : 'var(--msp-border-strong)',
          color: mode === 'institutional' ? 'var(--msp-accent)' : 'var(--msp-text-muted)',
          background: mode === 'institutional' ? 'var(--msp-accent-glow)' : 'transparent',
        }}
      >
        {mode === 'retail' ? '🏠 Retail' : '🏛️ Institutional'}
      </button>

      {/* Loading / provider info */}
      <div className="flex items-center gap-2">
        {loading && (
          <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--msp-accent)', borderTopColor: 'transparent' }} />
        )}
        {provider && !loading && (
          <span className="text-[9px] font-mono" style={{ color: 'var(--msp-text-faint)' }}>
            {provider === 'REALTIME_OPTIONS_FMV' ? 'LIVE' : 'DELAYED'}
          </span>
        )}
      </div>
    </div>
  );
}
