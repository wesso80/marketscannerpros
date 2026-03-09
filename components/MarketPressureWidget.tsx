"use client";

import { useEffect, useState, useCallback } from 'react';
import type { MarketPressureReading, PressureComponent } from '@/lib/marketPressureEngine';

interface Props {
  symbol: string;
  scanMode?: string;
  sessionMode?: string;
}

const LABEL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  HIGH_PRESSURE: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  BUILDING:      { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/30' },
  LOW_PRESSURE:  { bg: 'bg-slate-700/40',   text: 'text-slate-400',   border: 'border-slate-700' },
  NO_PRESSURE:   { bg: 'bg-slate-800/30',   text: 'text-slate-500',   border: 'border-slate-800' },
};

const DIR_COLORS: Record<string, string> = {
  LONG: 'text-emerald-400',
  SHORT: 'text-rose-400',
  NEUTRAL: 'text-slate-400',
};

const PRESSURE_NAMES: Record<string, { icon: string; label: string }> = {
  time:       { icon: '⏱', label: 'Time' },
  volatility: { icon: '📊', label: 'Volatility' },
  liquidity:  { icon: '💧', label: 'Liquidity' },
  options:    { icon: '⚙️', label: 'Options' },
};

function PressureBar({ name, pressure }: { name: string; pressure: PressureComponent }) {
  const meta = PRESSURE_NAMES[name] || { icon: '•', label: name };
  const pct = Math.min(100, Math.max(0, pressure.score));
  const barColor = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : pct >= 25 ? 'bg-slate-500' : 'bg-slate-700';
  const dirLabel = pressure.direction !== 'neutral' ? ` (${pressure.direction})` : '';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-slate-300">{meta.icon} {meta.label}{dirLabel}</span>
        <span className="font-mono text-slate-400">{Math.round(pct)} <span className="text-[9px] text-slate-600">× {pressure.weight.toFixed(2)}w</span></span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {pressure.components.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {pressure.components.map((c, i) => (
            <span key={i} className="rounded bg-slate-800/60 px-1.5 py-0.5 text-[9px] text-slate-500">{c}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MarketPressureWidget({ symbol, scanMode = 'intraday_1h', sessionMode = 'extended' }: Props) {
  const [reading, setReading] = useState<MarketPressureReading | null>(null);
  const [dataSources, setDataSources] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMPE = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/market-pressure?symbol=${encodeURIComponent(symbol)}&scanMode=${encodeURIComponent(scanMode)}&sessionMode=${encodeURIComponent(sessionMode)}`);
      const json = await res.json();
      if (json.success && json.reading) {
        setReading(json.reading);
        setDataSources(json.dataSources || {});
      } else {
        setError(json.error || 'Failed to compute pressure');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [symbol, scanMode, sessionMode]);

  useEffect(() => {
    fetchMPE();
  }, [fetchMPE]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-slate-500">
        <div className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400" />
        Computing market pressure…
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-center text-xs text-slate-500">{error}</div>
    );
  }

  if (!reading) return null;

  const lbl = LABEL_COLORS[reading.label] || LABEL_COLORS.NO_PRESSURE;
  const activeSourceCount = Object.values(dataSources).filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* ── Header: Composite score + direction ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Score badge */}
        <div className={`rounded-xl border px-4 py-2 ${lbl.bg} ${lbl.border}`}>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Pressure</div>
          <div className={`text-2xl font-bold tabular-nums ${lbl.text}`}>{Math.round(reading.composite)}</div>
        </div>

        {/* Label + direction */}
        <div className="space-y-1">
          <div className={`text-sm font-bold ${lbl.text}`}>
            {reading.label.replace(/_/g, ' ')}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className={`font-semibold ${DIR_COLORS[reading.direction] || 'text-slate-400'}`}>
              {reading.direction === 'LONG' ? '↑ LONG' : reading.direction === 'SHORT' ? '↓ SHORT' : '↔ NEUTRAL'}
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400">
              Alignment: <span className="font-semibold text-slate-200">{Math.round(reading.alignment * 100)}%</span>
            </span>
          </div>
          {reading.regime && reading.regime !== 'UNKNOWN' && (
            <div className="text-[10px] text-slate-500">Regime: {reading.regime.replace(/_/g, ' ')}</div>
          )}
        </div>

        {/* Data source indicators */}
        <div className="ml-auto flex items-center gap-1">
          {(['time', 'volatility', 'liquidity', 'options'] as const).map((key) => (
            <div
              key={key}
              className={`h-2 w-2 rounded-full ${dataSources[key] ? 'bg-emerald-500/60' : 'bg-slate-700'}`}
              title={`${PRESSURE_NAMES[key]?.label || key}: ${dataSources[key] ? 'active' : 'no data'}`}
            />
          ))}
          <span className="ml-1 text-[9px] text-slate-600">{activeSourceCount}/4</span>
        </div>
      </div>

      {/* ── Pressure dimension bars ── */}
      <div className="space-y-3">
        {(['time', 'volatility', 'liquidity', 'options'] as const).map((key) => (
          <PressureBar key={key} name={key} pressure={reading.pressures[key]} />
        ))}
      </div>

      {/* ── Summary line ── */}
      {reading.summary && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/25 px-3 py-2 text-[11px] text-slate-400">
          {reading.summary}
        </div>
      )}
    </div>
  );
}
