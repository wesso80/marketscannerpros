'use client';

import type { DirectionalPressure } from '@/src/features/volatilityEngine/types';

const COMPONENT_MAX: Record<string, number> = {
  stochasticMomentum: 15,
  trendStructure: 20,
  optionsFlow: 20,
  volumeExpansion: 10,
  dealerGamma: 15,
  fundingRate: 10,
  marketBreadth: 10,
};

const LABELS: Record<string, string> = {
  stochasticMomentum: 'Stoch Momentum',
  trendStructure: 'Trend Structure',
  optionsFlow: 'Options Flow',
  volumeExpansion: 'Volume',
  dealerGamma: 'Dealer Gamma',
  fundingRate: 'Funding Rate',
  marketBreadth: 'Market Breadth',
};

function biasColor(bias: string): string {
  if (bias === 'bullish') return '#10B981';
  if (bias === 'bearish') return '#EF4444';
  return '#64748B';
}

// Map missing data sources to which component keys become N/A
const MISSING_MAP: Record<string, string[]> = {
  options: ['optionsFlow', 'dealerGamma'],
  liquidity: ['fundingRate'],
};

// Total possible score range is -100 to +100
const MAX_DIR_SCORE = 100;

export default function VEDirectionalCompass({ dir, missingInputs = [] }: { dir: DirectionalPressure; missingInputs?: string[] }) {
  // Build set of component keys that are N/A due to missing inputs
  const naKeys = new Set<string>();
  for (const m of missingInputs) {
    for (const key of (MISSING_MAP[m] ?? [])) naKeys.add(key);
  }

  // Compass needle position: map score from [-100, +100] → [0, 100]
  const needlePct = Math.max(0, Math.min(100, ((dir.score / MAX_DIR_SCORE) + 1) * 50));
  const color = biasColor(dir.bias);
  const confLabel = dir.confidence >= 70 ? 'High' : dir.confidence >= 40 ? 'Moderate' : 'Low';

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            Directional Bias
          </h3>
        </div>
        <span className="text-[11px] text-white/40">{dir.confidence.toFixed(0)}% confluence</span>
      </div>

      {/* ── Compass Pressure Bar ── */}
      <div className="mb-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-2 flex items-center justify-between text-[11px] text-white/50">
          <span className="text-red-400 font-semibold">← Bearish</span>
          <span className="text-slate-400">Neutral</span>
          <span className="text-emerald-400 font-semibold">Bullish →</span>
        </div>
        {/* Track */}
        <div className="relative h-3 rounded-full bg-slate-800/80">
          {/* Center tick */}
          <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
          {/* Needle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 shadow-lg transition-all duration-500"
            style={{
              left: `calc(${needlePct}% - 10px)`,
              background: color,
              borderColor: color,
              boxShadow: `0 0 8px ${color}66`,
            }}
          />
        </div>
        {/* Big score + conclusion */}
        <div className="mt-3 flex items-center justify-center gap-3">
          <span className="text-3xl font-black" style={{ color }}>
            {dir.score > 0 ? '+' : ''}{dir.score.toFixed(0)}
          </span>
          <div className="text-left">
            <span className="text-sm font-bold uppercase" style={{ color }}>
              {dir.bias}
            </span>
            <div className="text-[11px] text-white/40">
              Confluence: {confLabel}
            </div>
          </div>
        </div>
      </div>

      {/* ── Component Bars ── */}
      <div className="space-y-2">
        {Object.entries(dir.components).map(([key, value]) => {
          const isNA = naKeys.has(key) && value === 0;
          const max = COMPONENT_MAX[key] || 20;
          const absVal = Math.abs(value);
          const pct = isNA ? 0 : Math.min(100, (absVal / max) * 100);
          const barColor = isNA ? '#334155' : value > 0 ? '#10B981' : value < 0 ? '#EF4444' : '#475569';
          return (
            <div key={key} className="space-y-0.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className={isNA ? 'text-white/25' : 'text-white/60'}>{LABELS[key] || key}</span>
                {isNA ? (
                  <span className="text-[11px] text-white/20">N/A</span>
                ) : (
                  <span className="font-semibold" style={{ color: barColor }}>
                    {value > 0 ? '+' : ''}{value.toFixed(0)}/{max}
                  </span>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                {!isNA && (
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: barColor }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {dir.componentDetails.length > 0 && (
        <div className="mt-3 space-y-0.5 border-t border-white/10 pt-2">
          {dir.componentDetails.slice(0, 3).map((d, i) => (
            <p key={i} className="text-[11px] text-white/40">{d}</p>
          ))}
        </div>
      )}
    </div>
  );
}
