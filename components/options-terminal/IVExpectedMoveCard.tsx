'use client';

import React from 'react';
import type { IVMetrics } from '@/types/optionsTerminal';

interface Props {
  metrics: IVMetrics;
  spot: number;
  selectedExpiry: string;
}

const LEVEL_COLORS: Record<IVMetrics['ivLevel'], string> = {
  low: 'var(--msp-bull)',
  normal: 'var(--msp-accent)',
  high: 'var(--msp-warn)',
  extreme: 'var(--msp-bear)',
};

const LEVEL_LABELS: Record<IVMetrics['ivLevel'], string> = {
  low: 'LOW',
  normal: 'NORMAL',
  high: 'HIGH',
  extreme: 'EXTREME',
};

export default function IVExpectedMoveCard({ metrics, spot, selectedExpiry }: Props) {
  const { avgIV, ivLevel, expectedMoveAbs, expectedMovePct } = metrics;
  const color = LEVEL_COLORS[ivLevel];
  const upper = spot + expectedMoveAbs;
  const lower = spot - expectedMoveAbs;

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: 'var(--msp-card)', borderColor: 'var(--msp-border)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--msp-text-faint)' }}>
          IV & Expected Move
        </h3>
        <span
          className="text-[10px] font-black px-2 py-0.5 rounded"
          style={{ background: `${color}22`, color }}
        >
          {LEVEL_LABELS[ivLevel]}
        </span>
      </div>

      {spot > 0 ? (
        <>
          {/* IV gauge */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1">
              <div className="flex justify-between text-[9px] mb-1" style={{ color: 'var(--msp-text-faint)' }}>
                <span>0%</span>
                <span>ATM IV</span>
                <span>100%</span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(avgIV * 100, 100)}%`,
                    background: `linear-gradient(90deg, var(--msp-bull), ${color})`,
                  }}
                />
              </div>
            </div>
            <span className="text-lg font-bold font-mono tabular-nums" style={{ color }}>
              {(avgIV * 100).toFixed(1)}%
            </span>
          </div>

          {/* Expected move */}
          <div className="rounded-lg p-3" style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border)' }}>
            <div className="text-[9px] uppercase font-bold mb-2" style={{ color: 'var(--msp-text-faint)' }}>
              Expected Move {selectedExpiry ? `(${selectedExpiry})` : ''}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-center">
                <div className="text-[9px]" style={{ color: 'var(--msp-bear)' }}>Lower</div>
                <div className="font-mono font-bold text-sm" style={{ color: 'var(--msp-bear)' }}>
                  ${lower.toFixed(2)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[9px]" style={{ color: 'var(--msp-text-faint)' }}>Range</div>
                <div className="font-mono font-bold text-sm" style={{ color: 'var(--msp-text)' }}>
                  ±{expectedMovePct.toFixed(1)}%
                </div>
                <div className="text-[10px] font-mono" style={{ color: 'var(--msp-text-muted)' }}>
                  ±${expectedMoveAbs.toFixed(2)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[9px]" style={{ color: 'var(--msp-bull)' }}>Upper</div>
                <div className="font-mono font-bold text-sm" style={{ color: 'var(--msp-bull)' }}>
                  ${upper.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs italic text-center py-6" style={{ color: 'var(--msp-text-faint)' }}>
          Load a chain to see IV metrics
        </p>
      )}
    </div>
  );
}
