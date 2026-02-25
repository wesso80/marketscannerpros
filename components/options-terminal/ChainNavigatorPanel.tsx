'use client';

import React from 'react';
import type { ExpirationMeta, BestStrike, QuickFilter } from '@/types/optionsTerminal';

interface Props {
  expirations: ExpirationMeta[];
  selectedExpiry: string;
  onExpiryChange: (d: string) => void;
  bestStrikes: BestStrike[];
  activeFilter: QuickFilter | null;
  onFilterChange: (f: QuickFilter | null) => void;
  onStrikeClick: (strike: number, type: 'call' | 'put') => void;
}

const FILTERS: { key: QuickFilter; label: string; icon: string }[] = [
  { key: 'atm', label: 'ATM Focus', icon: '🎯' },
  { key: 'delta25', label: '25Δ Focus', icon: 'Δ' },
  { key: 'high_oi', label: 'High OI', icon: '📊' },
  { key: 'high_vol', label: 'High Volume', icon: '🔥' },
];

export default function ChainNavigatorPanel({
  expirations,
  selectedExpiry,
  onExpiryChange,
  bestStrikes,
  activeFilter,
  onFilterChange,
  onStrikeClick,
}: Props) {
  return (
    <div
      className="flex flex-col gap-4 h-full overflow-y-auto rounded-xl border p-4"
      style={{ background: 'var(--msp-card)', borderColor: 'var(--msp-border)' }}
    >
      {/* ── Expirations ─────────────────────────────────── */}
      <section>
        <h3 className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'var(--msp-text-faint)' }}>
          Expirations
        </h3>
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
          {expirations.map((exp) => {
            const active = exp.date === selectedExpiry;
            const isWeekly = new Date(exp.date).getDay() !== 5; // non-Friday = weekly
            return (
              <button
                key={exp.date}
                onClick={() => onExpiryChange(active ? '' : exp.date)}
                className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-all text-left"
                style={{
                  background: active ? 'var(--msp-accent-glow)' : 'transparent',
                  color: active ? 'var(--msp-accent)' : 'var(--msp-text-muted)',
                  border: active ? '1px solid var(--msp-accent)' : '1px solid transparent',
                }}
              >
                <span className="font-mono font-semibold">{exp.label}</span>
                <span className="flex items-center gap-1">
                  {isWeekly && (
                    <span className="text-[9px] px-1 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--msp-text-faint)' }}>W</span>
                  )}
                  <span className="text-[9px] tabular-nums" style={{ color: 'var(--msp-text-faint)' }}>
                    {exp.totalOI > 1000 ? `${(exp.totalOI / 1000).toFixed(0)}K` : exp.totalOI} OI
                  </span>
                </span>
              </button>
            );
          })}
          {expirations.length === 0 && (
            <p className="text-xs italic" style={{ color: 'var(--msp-text-faint)' }}>
              Enter a ticker to load expirations
            </p>
          )}
        </div>
      </section>

      {/* ── Quick Filters ───────────────────────────────── */}
      <section>
        <h3 className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'var(--msp-text-faint)' }}>
          Quick Filters
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          {FILTERS.map((f) => {
            const on = activeFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => onFilterChange(on ? null : f.key)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-all"
                style={{
                  background: on ? 'var(--msp-accent-glow)' : 'rgba(255,255,255,0.04)',
                  color: on ? 'var(--msp-accent)' : 'var(--msp-text-muted)',
                  border: on ? '1px solid var(--msp-accent)' : '1px solid var(--msp-border)',
                }}
              >
                <span>{f.icon}</span>
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Best Strikes ────────────────────────────────── */}
      <section>
        <h3 className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'var(--msp-text-faint)' }}>
          Best Strikes
        </h3>
        <div className="flex flex-col gap-1.5">
          {bestStrikes.map((bs, i) => (
            <button
              key={`${bs.label}-${i}`}
              onClick={() => onStrikeClick(bs.strike, bs.type)}
              className="flex items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-all hover:opacity-80"
              style={{
                background: bs.type === 'call' ? 'var(--msp-bull-tint)' : 'var(--msp-bear-tint)',
                border: '1px solid var(--msp-border)',
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: bs.type === 'call' ? 'var(--msp-bull)' : 'var(--msp-bear)' }}
                />
                <span className="font-semibold" style={{ color: 'var(--msp-text)' }}>
                  {bs.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums" style={{ color: 'var(--msp-text)' }}>
                  ${bs.strike.toFixed(2)}
                </span>
                <span className="text-[9px]" style={{ color: 'var(--msp-text-faint)' }}>
                  {bs.reason}
                </span>
              </div>
            </button>
          ))}
          {bestStrikes.length === 0 && (
            <p className="text-xs italic" style={{ color: 'var(--msp-text-faint)' }}>
              Load a chain to see best strikes
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
