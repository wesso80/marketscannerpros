'use client';

import type { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type Props = {
  scoreBreakdown: GoldenEggPayload['layer1']['scoreBreakdown'];
  confidence: number;
};

function barSegments(value: number): number {
  return Math.round(value / 10); // 0-10 segments out of 10
}

function segmentColor(value: number): string {
  if (value >= 65) return 'bg-emerald-500';
  if (value >= 45) return 'bg-amber-500';
  return 'bg-rose-500';
}

function segmentGlow(value: number): string {
  if (value >= 65) return 'shadow-emerald-500/30';
  if (value >= 45) return 'shadow-amber-500/30';
  return 'shadow-rose-500/30';
}

function toneLabel(value: number): string {
  if (value >= 75) return 'Strong';
  if (value >= 60) return 'Good';
  if (value >= 45) return 'Mixed';
  if (value >= 30) return 'Weak';
  return 'Poor';
}

function toneLabelColor(value: number): string {
  if (value >= 65) return 'text-emerald-400';
  if (value >= 45) return 'text-amber-400';
  return 'text-rose-400';
}

export default function GEConfluenceHeatmap({ scoreBreakdown, confidence }: Props) {
  const totalSegments = 10;

  return (
    <div className="rounded-lg border border-white/5 bg-slate-900/40 p-5">
      <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400">Confluence Score</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${toneLabelColor(confidence)}`}>{confidence}%</span>
          <span className="text-xs text-slate-500">overall</span>
        </div>
      </div>

      <div className="space-y-3">
        {scoreBreakdown.map((row) => {
          const filled = barSegments(row.value);
          return (
            <div key={row.key} className="group">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">{row.key}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${toneLabelColor(row.value)}`}>
                    {toneLabel(row.value)}
                  </span>
                  <span className="text-xs tabular-nums text-slate-500">{row.value}%</span>
                </div>
              </div>
              <div className="flex gap-[3px]">
                {Array.from({ length: totalSegments }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-3 flex-1 rounded-sm transition-all ${
                      i < filled
                        ? `${segmentColor(row.value)} ${i === filled - 1 ? `shadow-sm ${segmentGlow(row.value)}` : ''}`
                        : 'bg-slate-800'
                    }`}
                    style={{
                      opacity: i < filled ? 0.6 + (i / filled) * 0.4 : 0.3,
                    }}
                  />
                ))}
              </div>
              {row.note && (
                <p className="mt-1 text-[11px] text-slate-500">{row.note}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-center gap-4 border-t border-white/5 pt-3">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-sm bg-emerald-500" />
          <span className="text-[11px] text-slate-500">Bullish (65+)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-sm bg-amber-500" />
          <span className="text-[11px] text-slate-500">Neutral (45-64)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-sm bg-rose-500" />
          <span className="text-[11px] text-slate-500">Bearish (&lt;45)</span>
        </div>
      </div>
    </div>
  );
}
