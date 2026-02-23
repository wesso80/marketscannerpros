'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { DistributionStats } from '@/lib/catalyst/types';

/* ────────────────────────────────────────────────────────────────
   DistributionChart — Box-whisker + dot-strip for a single horizon.
   Renders on <canvas> via Chart.js (dynamic import).
   ──────────────────────────────────────────────────────────────── */

interface Props {
  label: string;           // e.g. "Close → Open"
  stats: DistributionStats;
  height?: number;         // default 80
}

export default function DistributionChart({ label, stats, height = 80 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);

    // Destroy previous chart
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { p10, p25, median, p75, p90, mean, sampleN } = stats;

    // Clear
    canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    const w = canvas.clientWidth;
    const h = height;
    const pad = { left: 12, right: 12, top: 6, bottom: 18 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Range for x-axis
    const dataMin = Math.min(p10, -1);
    const dataMax = Math.max(p90, 1);
    const margin = (dataMax - dataMin) * 0.15 || 1;
    const xMin = dataMin - margin;
    const xMax = dataMax + margin;

    const toX = (val: number) => pad.left + ((val - xMin) / (xMax - xMin)) * plotW;

    // ── Background
    ctx.clearRect(0, 0, w, h);

    // Zero line
    const zeroX = toX(0);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(zeroX, pad.top);
    ctx.lineTo(zeroX, pad.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    const cy = pad.top + plotH / 2;
    const boxH = plotH * 0.5;

    // ── Whiskers (p10–p25, p75–p90)
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    // Left whisker
    ctx.beginPath();
    ctx.moveTo(toX(p10), cy);
    ctx.lineTo(toX(p25), cy);
    ctx.stroke();
    // Right whisker
    ctx.beginPath();
    ctx.moveTo(toX(p75), cy);
    ctx.lineTo(toX(p90), cy);
    ctx.stroke();
    // Whisker caps
    [p10, p90].forEach(val => {
      const x = toX(val);
      ctx.beginPath();
      ctx.moveTo(x, cy - boxH * 0.3);
      ctx.lineTo(x, cy + boxH * 0.3);
      ctx.stroke();
    });

    // ── IQR box (p25–p75)
    const boxLeft = toX(p25);
    const boxRight = toX(p75);
    ctx.fillStyle = median >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)';
    ctx.strokeStyle = median >= 0 ? 'rgba(16,185,129,0.6)' : 'rgba(244,63,94,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(boxLeft, cy - boxH / 2, boxRight - boxLeft, boxH, 3);
    ctx.fill();
    ctx.stroke();

    // ── Median line
    const medX = toX(median);
    ctx.strokeStyle = median >= 0 ? '#10B981' : '#F43F5E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(medX, cy - boxH / 2);
    ctx.lineTo(medX, cy + boxH / 2);
    ctx.stroke();

    // ── Mean dot
    const meanX = toX(mean);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(meanX, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    // ── X-axis labels
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    const ticks = [p10, p25, median, p75, p90].filter((v, i, arr) =>
      // Skip ticks too close together
      i === 0 || Math.abs(toX(v) - toX(arr[i - 1])) > 28
    );
    ticks.forEach(val => {
      ctx.fillText(`${val >= 0 ? '+' : ''}${val.toFixed(1)}%`, toX(val), h - 3);
    });

    // ── Zero label
    if (Math.abs(toX(0) - toX(median)) > 20) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillText('0', zeroX, h - 3);
    }
  }, [stats, height]);

  useEffect(() => {
    draw();
    return () => {
      if (chartRef.current) chartRef.current.destroy();
    };
  }, [draw]);

  if (stats.sampleN === 0) {
    return (
      <div className="flex items-center justify-center rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2" style={{ height }}>
        <p className="text-[10px] text-[var(--msp-text-faint)]">No data for {label}</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2 pt-1 pb-0">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">
        {label}
        <span className="ml-1.5 font-normal text-[var(--msp-text-faint)]">n={stats.sampleN}</span>
      </p>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height }}
        className="block"
      />
    </div>
  );
}
