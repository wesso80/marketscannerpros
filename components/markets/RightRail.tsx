'use client';

import dynamic from 'next/dynamic';
import type { TickerContext } from './types';

const WatchlistWidget = dynamic(() => import('@/components/WatchlistWidget'), {
  ssr: false,
  loading: () => <div className="h-[200px] animate-pulse rounded-md bg-[var(--msp-panel-2)]" />,
});

const SectorHeatmap = dynamic(() => import('@/components/SectorHeatmap'), {
  ssr: false,
  loading: () => <div className="h-[200px] animate-pulse rounded-md bg-[var(--msp-panel-2)]" />,
});

/**
 * RightRail — Contextual sidebar for the Markets page.
 * Contains:
 *   1. QuickStats (selected ticker vitals)
 *   2. Sector Heatmap (always visible)
 *   3. Watchlist (cross-device synced)
 *   4. Trade Preview (when a ticker is selected)
 */
export default function RightRail({ ctx }: { ctx: TickerContext }) {
  return (
    <div className="grid gap-2">
      {/* Quick stats for selected ticker */}
      {ctx.symbol && ctx.quote && (
        <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-card)] p-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Quick Stats</p>
          <div className="grid grid-cols-2 gap-1.5">
            <QuickStat label="Price" value={`$${(ctx.quote.price ?? 0).toFixed(2)}`} />
            <QuickStat
              label="Change"
              value={`${(ctx.quote.changePercent ?? 0) >= 0 ? '+' : ''}${(ctx.quote.changePercent ?? 0).toFixed(2)}%`}
              color={(ctx.quote.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}
            />
            {ctx.quote.volume !== undefined && (
              <QuickStat label="Volume" value={formatVolume(ctx.quote.volume)} />
            )}
            {ctx.scanner && (
              <QuickStat
                label="Score"
                value={`${ctx.scanner.score}/100`}
                color={ctx.scanner.score >= 70 ? 'text-emerald-400' : ctx.scanner.score >= 40 ? 'text-amber-400' : 'text-slate-400'}
              />
            )}
            {ctx.options && (
              <>
                <QuickStat label="IV Rank" value={`${(ctx.options.ivRank ?? 0).toFixed(0)}%`} />
                <QuickStat label="Exp Move" value={`±${(ctx.options.expectedMove ?? 0).toFixed(1)}%`} />
              </>
            )}
          </div>
        </div>
      )}

      {/* Trade Preview — compact entry/stop/target */}
      {ctx.scanner && (
        <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-card)] p-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Trade Preview</p>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-[var(--msp-text-faint)]">Direction</span>
              <span className={ctx.scanner.direction === 'LONG' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {ctx.scanner.direction}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--msp-text-faint)]">Entry</span>
              <span className="text-[var(--msp-text)]">${(ctx.scanner.entry ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--msp-text-faint)]">Stop</span>
              <span className="text-rose-400">${(ctx.scanner.stop ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--msp-text-faint)]">Target</span>
              <span className="text-emerald-400">${(ctx.scanner.target ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-[var(--msp-divider)] pt-1">
              <span className="text-[var(--msp-text-faint)]">R-Multiple</span>
              <span className={`font-black ${(ctx.scanner.rMultiple ?? 0) >= 2 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {(ctx.scanner.rMultiple ?? 0).toFixed(1)}R
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Sector Heatmap — always visible */}
      <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-card)] p-2">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Sector Rotation</p>
        <SectorHeatmap />
      </div>

      {/* Watchlist */}
      <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-card)] p-2">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Watchlist</p>
        <WatchlistWidget />
      </div>
    </div>
  );
}

function QuickStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2 py-1">
      <p className="text-[9px] font-semibold uppercase text-[var(--msp-text-faint)]">{label}</p>
      <p className={`text-[11px] font-bold ${color ?? 'text-[var(--msp-text)]'}`}>{value}</p>
    </div>
  );
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
  return vol.toString();
}
