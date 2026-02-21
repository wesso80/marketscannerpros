import React from 'react';
import { NarrativeGroup, NewsGateModel } from './types';
import NewsDecisionCard from './NewsDecisionCard';

interface NewsGroupProps {
  group: NarrativeGroup;
  gate: NewsGateModel;
  isAdmin: boolean;
  expandedDecisionIds: Record<string, boolean>;
  onToggleDecision: (id: string) => void;
}

export default function NewsGroup({ group, gate, isAdmin, expandedDecisionIds, onToggleDecision }: NewsGroupProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-white/60">Narrative Group</div>
            <div className="mt-1 text-base font-semibold text-white/90">{group.narrative}</div>
            <div className="mt-2 text-xs text-white/65">
              {group.bullish} bullish / {group.bearish} bearish • volatility risk {gate.volRegime.toLowerCase()}
            </div>
          </div>
          <span className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
            gate.permission === 'YES'
              ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200'
              : gate.permission === 'NO'
                ? 'border-rose-300/30 bg-rose-300/10 text-rose-200'
                : 'border-amber-300/30 bg-amber-300/10 text-amber-200'
          }`}>
            Permission {gate.permission}
          </span>
        </div>
      </div>

      <div className="border-t border-white/10 p-4 space-y-3">
        {group.items.slice(0, 5).map((item) => (
          <NewsDecisionCard
            key={item.id}
            item={item}
            gate={gate}
            isAdmin={isAdmin}
            isOpen={!!expandedDecisionIds[item.id]}
            onToggle={onToggleDecision}
          />
        ))}
      </div>
    </article>
  );
}
