import React from 'react';
import { NarrativeGroup } from './types';

interface NarrativeStackProps {
  groups: NarrativeGroup[];
}

export default function NarrativeStack({ groups }: NarrativeStackProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-white/60">Narrative Stack</div>
      <div className="mt-1 text-sm font-semibold text-white/90">Top 3 Drivers</div>
      <div className="mt-3 space-y-2">
        {groups.slice(0, 3).map((group) => (
          <div key={group.narrative} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white/90">{group.narrative}</span>
              <span className="text-xs text-white/60">{group.avgImpact}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white/10">
              <div className="h-2 rounded-full bg-white/35" style={{ width: `${group.avgImpact}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {group.items
                .slice(0, 4)
                .flatMap((item) => item.raw.tickerSentiments?.slice(0, 1).map((ticker) => ticker.ticker) || [])
                .map((ticker) => (
                  <span key={`${group.narrative}-${ticker}`} className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] text-white/70">
                    {ticker}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
