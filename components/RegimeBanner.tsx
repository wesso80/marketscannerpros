'use client';

import { useRegime, regimeBadgeColor, regimeLabel } from '@/lib/useRegime';

/**
 * Compact regime awareness banner for any tool page.
 * Shows current regime, risk level, review status, and risk context.
 * Drop this into any page that needs regime context.
 */
export default function RegimeBanner() {
  const { data, loading } = useRegime();

  if (loading || !data) return null;

  const badgeColor = regimeBadgeColor(data.regime);
  const label = regimeLabel(data.regime);

  const riskColors: Record<string, string> = {
    low: 'text-emerald-400',
    moderate: 'text-yellow-400',
    elevated: 'text-amber-400',
    extreme: 'text-red-400',
  };

  const reviewColors: Record<string, string> = {
    YES: 'text-emerald-400',
    CONDITIONAL: 'text-amber-400',
    NO: 'text-red-400',
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-800/50 px-3 py-2 text-xs">
      <span className="text-slate-500 font-medium uppercase tracking-wider">Regime</span>
      <span className={`rounded border px-2 py-0.5 font-mono font-semibold ${badgeColor}`}>
        {label}
      </span>
      <span className="text-slate-600">|</span>
      <span className="text-slate-500">Risk:</span>
      <span className={`font-semibold ${riskColors[data.riskLevel] || 'text-slate-400'}`}>
        {data.riskLevel.toUpperCase()}
      </span>
      <span className="text-slate-600">|</span>
      <span className="text-slate-500">Review:</span>
      <span className={`font-semibold ${reviewColors[data.permission] || 'text-slate-400'}`}>
        {data.permission === 'YES' ? 'CLEAR' : data.permission === 'CONDITIONAL' ? 'CAUTION' : 'BLOCKED'}
      </span>
      <span className="text-slate-600">|</span>
      <span className="text-slate-500">Risk Context:</span>
      <span className="text-slate-300 font-medium">{data.sizing}</span>
      {data.signals.some(s => s.stale) && (
        <>
          <span className="text-slate-600">|</span>
          <span className="text-amber-500 font-medium">Stale signals</span>
        </>
      )}
    </div>
  );
}
