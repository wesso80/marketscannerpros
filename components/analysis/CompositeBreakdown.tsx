'use client';

/**
 * CompositeBreakdown — makes the MSP Composite v2 score legible.
 *
 * Surfaces WHY a row scored what it did: its cross-sectional percentile within
 * the scanned universe, the active regime whose weight mix was applied, and the
 * per-factor contributions (direction × weight) behind the composite. This is
 * the "score legend" the review asked for — educational context only, never a
 * probability and never a trade instruction.
 */

import { useState } from 'react';
import type { ScanResult } from '@/app/v2/_lib/api';

type CompositeV2 = NonNullable<ScanResult['compositeV2']>;

const FACTOR_LABEL: Record<string, string> = {
  TREND: 'Trend',
  MOMENTUM: 'Momentum',
  VOLUME: 'Volume',
  RELATIVE_STRENGTH: 'Rel. strength',
  VOLATILITY: 'Volatility',
  POSITIONING: 'Positioning',
  QUALITY: 'Quality',
  CATALYST: 'Catalyst',
};

const REGIME_LABEL: Record<string, string> = {
  trending: 'Trending',
  ranging: 'Ranging',
  compression: 'Compression',
  expansion: 'Expansion',
  high_volatility: 'High volatility',
  neutral: 'Neutral',
};

function pctSuffix(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

export default function CompositeBreakdown({ v2, compact = false }: { v2: CompositeV2; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const topPct = Math.max(1, 100 - v2.percentileRank);
  const contributions = [...(v2.factorContributions ?? [])].sort((a, b) => b.weight - a.weight);

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300"
          title="Cross-sectional rank within the symbols scanned this run"
        >
          Top {topPct}% of scan
        </span>
        <span
          className="rounded border border-slate-600/40 bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300"
          title="Market regime whose factor-weight mix was applied to this score"
        >
          {REGIME_LABEL[v2.regime] ?? v2.regime}
        </span>
        <span
          className="rounded border border-slate-600/40 bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400"
          title="Percentile of the composite score across the scanned universe"
        >
          {pctSuffix(v2.percentileRank)} pct
        </span>
        {v2.liquidityMultiplier < 1 ? (
          <span
            className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300"
            title="Quality / liquidity discount applied (small-cap, thin volume, warrant, or imminent earnings)"
          >
            Liquidity ×{v2.liquidityMultiplier.toFixed(2)}
          </span>
        ) : null}
        {v2.catalyst && v2.catalyst.earningsInDays != null && v2.catalyst.earningsInDays <= 5 ? (
          <span
            className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-300"
            title="Scheduled earnings within days — elevated event risk; outcome is not predicted"
          >
            {v2.catalyst.earningsInDays === 0 ? 'Earnings today' : v2.catalyst.earningsInDays === 1 ? 'Earnings tomorrow' : `Earnings in ${v2.catalyst.earningsInDays}d`}
          </span>
        ) : null}
        {!compact && contributions.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 hover:text-slate-200"
          >
            {open ? 'Hide factors' : 'Score factors'}
          </button>
        ) : null}
      </div>

      {open && contributions.length > 0 ? (
        <div className="mt-2 space-y-1">
          {contributions.map((c) => {
            const magnitude = Math.min(1, Math.abs(c.signed));
            const bullish = c.signed > 0;
            const neutral = c.signed === 0;
            const color = neutral ? 'var(--msp-flat, #94a3b8)' : bullish ? 'var(--msp-bull, #10b981)' : 'var(--msp-bear, #f43f5e)';
            return (
              <div key={c.factor} className="flex items-center gap-2 text-[11px]">
                <span className="w-24 shrink-0 text-slate-400">{FACTOR_LABEL[c.factor] ?? c.factor}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded bg-slate-800/60">
                  <div
                    className="absolute top-0 h-2 rounded"
                    style={{
                      left: '50%',
                      width: `${magnitude * 50}%`,
                      transform: bullish ? 'none' : 'translateX(-100%)',
                      backgroundColor: color,
                    }}
                  />
                  <div className="absolute left-1/2 top-0 h-2 w-px bg-slate-600" />
                </div>
                <span className="w-10 shrink-0 text-right text-slate-500">{Math.round(c.weight * 100)}%</span>
              </div>
            );
          })}
          <p className="pt-1 text-[10px] italic text-slate-500">
            Direction × regime weight per independent factor. Evidence, freshness and liquidity gate the headline. Educational — not a probability.
          </p>
        </div>
      ) : null}
    </div>
  );
}
