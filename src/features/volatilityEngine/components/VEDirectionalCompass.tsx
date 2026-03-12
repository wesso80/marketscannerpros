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

export default function VEDirectionalCompass({ dir, missingInputs = [] }: { dir: DirectionalPressure; missingInputs?: string[] }) {
  const arrow = dir.bias === 'bullish' ? '↑' : dir.bias === 'bearish' ? '↓' : '↔';

  // Build set of component keys that are N/A due to missing inputs
  const naKeys = new Set<string>();
  for (const m of missingInputs) {
    for (const key of (MISSING_MAP[m] ?? [])) naKeys.add(key);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🧭</span>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            Directional Bias
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl" style={{ color: biasColor(dir.bias) }}>
            {arrow}
          </span>
          <div className="text-right">
            <span className="text-lg font-black" style={{ color: biasColor(dir.bias) }}>
              {dir.score > 0 ? '+' : ''}{dir.score.toFixed(0)}
            </span>
            <span className="ml-1 text-[0.6rem] font-bold uppercase" style={{ color: biasColor(dir.bias) }}>
              {dir.bias}
            </span>
            <div className="text-[0.6rem] text-white/40">{dir.confidence.toFixed(0)}% conf</div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {Object.entries(dir.components).map(([key, value]) => {
          const isNA = naKeys.has(key) && value === 0;
          const max = COMPONENT_MAX[key] || 20;
          const absVal = Math.abs(value);
          const pct = isNA ? 0 : Math.min(100, (absVal / max) * 100);
          const color = isNA ? '#334155' : value > 0 ? '#10B981' : value < 0 ? '#EF4444' : '#475569';
          return (
            <div key={key} className="space-y-0.5">
              <div className="flex items-center justify-between text-[0.65rem]">
                <span className={isNA ? 'text-white/25' : 'text-white/60'}>{LABELS[key] || key}</span>
                {isNA ? (
                  <span className="text-[0.6rem] text-white/20">N/A</span>
                ) : (
                  <span className="font-semibold" style={{ color }}>
                    {value > 0 ? '+' : ''}{value.toFixed(0)}/{max}
                  </span>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                {!isNA && (
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: color }}
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
            <p key={i} className="text-[0.6rem] text-white/40">{d}</p>
          ))}
        </div>
      )}
    </div>
  );
}
