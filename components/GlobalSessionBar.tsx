'use client';
/**
 * GlobalSessionBar
 * ────────────────
 * Compact, always-visible strip showing live market-session state.
 * Designed to sit in the tools layout (ToolsLayoutClient) so every
 * tools page inherits it automatically.
 *
 * Desktop:  ● MARKET OPEN  2:35 PM ET  |  EQ Power Hour  CR US Session  |  ✅ Breakout · Momentum
 * Mobile:   ● MARKET OPEN  2:35 PM ET  |  Power Hour
 */

import React from 'react';
import { useSessionPhase, type PhaseInfo, type MarketStatus } from '@/lib/useSessionPhase';

/* ── Colour mapping ───────────────────────────────── */

const PHASE_COLOR: Record<string, { chip: string; text: string }> = {
  emerald: { chip: 'border-emerald-500/25 bg-emerald-500/10', text: 'text-emerald-400' },
  amber:   { chip: 'border-amber-500/25 bg-amber-500/10',     text: 'text-amber-400' },
  red:     { chip: 'border-red-500/25 bg-red-500/10',         text: 'text-red-400' },
  slate:   { chip: 'border-slate-600/25 bg-slate-600/10',     text: 'text-slate-400' },
  sky:     { chip: 'border-sky-500/25 bg-sky-500/10',         text: 'text-sky-400' },
  purple:  { chip: 'border-purple-500/25 bg-purple-500/10',   text: 'text-purple-400' },
};

const STATUS_STYLE: Record<MarketStatus, { label: string; dot: string; text: string }> = {
  open:        { label: 'MARKET OPEN',   dot: 'bg-emerald-400 shadow-emerald-400/50 shadow-[0_0_6px]', text: 'text-emerald-400' },
  pre_market:  { label: 'PRE-MARKET',    dot: 'bg-amber-400 animate-pulse',                            text: 'text-amber-400' },
  after_hours: { label: 'AFTER HOURS',   dot: 'bg-amber-400/80',                                       text: 'text-amber-400' },
  closed:      { label: 'MARKET CLOSED', dot: 'bg-slate-500',                                          text: 'text-slate-500' },
};

/* ── Sub-components ───────────────────────────────── */

function PhaseChip({ prefix, phase }: { prefix: string; phase: PhaseInfo }) {
  const c = PHASE_COLOR[phase.color] ?? PHASE_COLOR.slate;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-px text-[11px] leading-tight ${c.chip} ${c.text}`}
      title={`Breakout ×${phase.breakoutMult.toFixed(2)} · MeanRev ×${phase.meanRevMult.toFixed(2)}${phase.favorable.length ? '\n✅ ' + phase.favorable.join(', ') : ''}${phase.unfavorable.length ? '\n⛔ ' + phase.unfavorable.join(', ') : ''}`}
    >
      <span className="font-bold uppercase tracking-wider opacity-50">{prefix}</span>
      <span className="font-semibold">{phase.label}</span>
    </span>
  );
}

/* ── Main Component ───────────────────────────────── */

export default function GlobalSessionBar() {
  const session = useSessionPhase(15_000);
  const status = STATUS_STYLE[session.marketStatus];

  // Merge favorable strategies (equity-priority) for desktop hint
  const favSet = new Set([...session.equity.favorable, ...session.crypto.favorable]);
  const unfavSet = new Set([...session.equity.unfavorable, ...session.crypto.unfavorable]);
  // Remove items that appear in both
  for (const f of favSet) unfavSet.delete(f);
  const favArr = Array.from(favSet);
  const unfavArr = Array.from(unfavSet);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-white/[0.06] bg-[#0B1120]/80 px-3 py-1.5 text-xs backdrop-blur-sm">
      {/* ── Left: status + clock ── */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="flex items-center gap-1.5 shrink-0">
          <span className={`inline-block h-2 w-2 rounded-full ${status.dot}`} />
          <span className={`font-extrabold tracking-wider ${status.text}`}>
            {status.label}
          </span>
        </span>
        <span className="text-slate-600 hidden xs:inline">|</span>
        <span className="tabular-nums text-slate-300 shrink-0">
          {session.etTimeStr} <span className="text-slate-500">ET</span>
        </span>
      </div>

      {/* ── Center: phase chips ── */}
      <div className="flex items-center gap-1.5">
        <PhaseChip prefix="EQ" phase={session.equity} />
        <span className="hidden sm:inline">
          <PhaseChip prefix="CR" phase={session.crypto} />
        </span>
      </div>

      {/* ── Right: strategy hints (md+ only) ── */}
      {(favArr.length > 0 || unfavArr.length > 0) && (
        <div className="hidden lg:flex items-center gap-2 text-[11px]">
          {favArr.length > 0 && (
            <span className="text-emerald-400/80">✅ {favArr.join(' · ')}</span>
          )}
          {unfavArr.length > 0 && (
            <span className="text-red-400/60">⛔ {unfavArr.join(' · ')}</span>
          )}
        </div>
      )}
    </div>
  );
}
