'use client';

import React, { useMemo } from 'react';
import type { OIHeatmapRow, TerminalMode } from '@/types/optionsTerminal';

interface Props {
  heatmap: OIHeatmapRow[];
  spot: number;
  mode: TerminalMode;
}

export default function OIHeatmapCard({ heatmap, spot, mode }: Props) {
  /* ── Compute walls & max for scaling ──────────────────────── */
  const { maxOI, wallStrikes } = useMemo(() => {
    const max = Math.max(...heatmap.map((r) => r.totalOI), 1);
    // "Walls" = strikes with OI > 70% of max
    const walls = heatmap.filter((r) => r.totalOI >= max * 0.7).map((r) => r.strike);
    return { maxOI: max, wallStrikes: new Set(walls) };
  }, [heatmap]);

  // Show limited rows for readability — top strikes by OI
  const displayRows = useMemo(() => {
    if (heatmap.length <= 20) return heatmap;
    // pick top 20 by total OI
    return [...heatmap].sort((a, b) => b.totalOI - a.totalOI).slice(0, 20).sort((a, b) => a.strike - b.strike);
  }, [heatmap]);

  return (
    <div
      className="rounded-xl border p-4 h-full"
      style={{ background: 'var(--msp-card)', borderColor: 'var(--msp-border)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--msp-text-faint)' }}>
          Open Interest Map
        </h3>
        {wallStrikes.size > 0 && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--msp-warn-tint)', color: 'var(--msp-warn)' }}>
            {wallStrikes.size} wall{wallStrikes.size > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {displayRows.length > 0 ? (
        <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto pr-1">
          {displayRows.map((row) => {
            const callPct = (row.callOI / maxOI) * 100;
            const putPct = (row.putOI / maxOI) * 100;
            const isWall = wallStrikes.has(row.strike);
            const isAtm = spot > 0 && Math.abs(row.strike - spot) / spot < 0.015;

            return (
              <div
                key={row.strike}
                className="flex items-center gap-1 py-0.5"
                style={{
                  opacity: isWall ? 1 : 0.75,
                }}
              >
                {/* Call OI bar (right-aligned) */}
                <div className="flex-1 h-4 flex justify-end">
                  <div
                    className="h-full rounded-l-sm transition-all"
                    style={{
                      width: `${callPct}%`,
                      background: isWall ? 'var(--msp-bull)' : 'rgba(47,179,110,0.35)',
                    }}
                  />
                </div>

                {/* Strike label */}
                <div
                  className="text-[9px] font-mono font-bold text-center w-14 shrink-0"
                  style={{
                    color: isAtm ? 'var(--msp-accent)' : isWall ? 'var(--msp-warn)' : 'var(--msp-text-muted)',
                  }}
                >
                  {row.strike.toFixed(0)}
                  {isAtm && <span className="text-[7px]"> ATM</span>}
                </div>

                {/* Put OI bar (left-aligned) */}
                <div className="flex-1 h-4 flex justify-start">
                  <div
                    className="h-full rounded-r-sm transition-all"
                    style={{
                      width: `${putPct}%`,
                      background: isWall ? 'var(--msp-bear)' : 'rgba(228,103,103,0.35)',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs italic text-center py-6" style={{ color: 'var(--msp-text-faint)' }}>
          Load a chain to see OI heatmap
        </p>
      )}

      {/* Legend */}
      {displayRows.length > 0 && (
        <div className="flex items-center justify-center gap-4 mt-3 text-[9px]" style={{ color: 'var(--msp-text-faint)' }}>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--msp-bull)' }} /> Calls
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--msp-bear)' }} /> Puts
          </span>
          {mode === 'institutional' && (
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--msp-warn)' }} /> Wall
            </span>
          )}
        </div>
      )}
    </div>
  );
}
