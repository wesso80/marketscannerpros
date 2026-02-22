'use client';

import type { TickerContext } from '../types';

/**
 * Structure Tab — Key levels, support/resistance, compression zones.
 * Absorbs break-level analysis that was scattered across scanner and time pages.
 */
export default function StructureTab({ ctx }: { ctx: TickerContext }) {
  const { symbol, scanner, quote, loading } = ctx;

  if (loading) {
    return <div className="h-[300px] animate-pulse rounded-md bg-[var(--msp-panel-2)]" />;
  }

  const levels = scanner?.levels;
  const price = quote?.price ?? 0;

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Structure Analysis</p>
          <h3 className="text-xs font-bold text-[var(--msp-text)]">{symbol} — Key Levels & Compression</h3>
        </div>
        {price > 0 && (
          <span className="text-xs font-bold text-[var(--msp-text)]">Current: ${price.toFixed(2)}</span>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {/* Support levels */}
        <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-500">Support Levels</p>
          {levels?.support && levels.support.length > 0 ? (
            <div className="space-y-1">
              {levels.support.sort((a, b) => b - a).map((level, i) => {
                const dist = price > 0 ? ((price - level) / price * 100).toFixed(1) : '—';
                return (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-emerald-400">${level.toFixed(2)}</span>
                    <span className="text-[var(--msp-text-faint)]">{dist}% below</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-[var(--msp-text-faint)]">No support levels detected from scan</p>
          )}
        </div>

        {/* Resistance levels */}
        <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-rose-500">Resistance Levels</p>
          {levels?.resistance && levels.resistance.length > 0 ? (
            <div className="space-y-1">
              {levels.resistance.sort((a, b) => a - b).map((level, i) => {
                const dist = price > 0 ? ((level - price) / price * 100).toFixed(1) : '—';
                return (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-rose-400">${level.toFixed(2)}</span>
                    <span className="text-[var(--msp-text-faint)]">{dist}% above</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-[var(--msp-text-faint)]">No resistance levels detected from scan</p>
          )}
        </div>
      </div>

      {/* Entry / Stop / Target levels from scanner */}
      {scanner && (
        <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">Trade Structure</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] text-[var(--msp-text-faint)]">Entry</p>
              <p className="text-sm font-bold text-cyan-400">${scanner.entry.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--msp-text-faint)]">Stop</p>
              <p className="text-sm font-bold text-rose-400">${scanner.stop.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--msp-text-faint)]">Target</p>
              <p className="text-sm font-bold text-emerald-400">${scanner.target.toFixed(2)}</p>
            </div>
          </div>

          {/* Visual level strip */}
          {price > 0 && scanner.stop > 0 && scanner.target > 0 && (
            <div className="mt-2 relative h-6 rounded-md bg-slate-800/50">
              {(() => {
                const min = Math.min(scanner.stop, price) * 0.995;
                const max = Math.max(scanner.target, price) * 1.005;
                const range = max - min;
                const pricePct = ((price - min) / range) * 100;
                const stopPct = ((scanner.stop - min) / range) * 100;
                const targetPct = ((scanner.target - min) / range) * 100;
                return (
                  <>
                    <div className="absolute top-0 h-full w-px bg-rose-500/60" style={{ left: `${stopPct}%` }} title="Stop" />
                    <div className="absolute top-0 h-full w-px bg-emerald-500/60" style={{ left: `${targetPct}%` }} title="Target" />
                    <div className="absolute top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-cyan-400 border border-cyan-200" style={{ left: `${pricePct}%` }} title="Price" />
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Compression detection placeholder */}
      <div className="rounded-md border border-dashed border-[var(--msp-border)] bg-[var(--msp-panel)] p-3 text-center text-[11px] text-[var(--msp-text-faint)]">
        Compression zone detection uses ATR contraction + Bollinger squeeze. Active when scanner includes volatility contraction signals.
        {scanner?.indicators?.bollingerSqueeze && (
          <p className="mt-1 text-amber-400 font-semibold">⚡ Bollinger Squeeze detected — breakout imminent</p>
        )}
      </div>
    </div>
  );
}
