import React from 'react';
import { DecisionNewsItem, NewsGateModel } from './types';

interface NewsDecisionCardProps {
  item: DecisionNewsItem;
  gate: NewsGateModel;
  isOpen: boolean;
  isAdmin: boolean;
  onToggle: (id: string) => void;
}

export default function NewsDecisionCard({ item, gate, isOpen, isAdmin, onToggle }: NewsDecisionCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/[0.07]">
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 sm:col-span-1">
          <span className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${item.impact === 'HIGH' ? 'border-rose-300/30 bg-rose-300/10 text-rose-200' : item.impact === 'MEDIUM' ? 'border-amber-300/30 bg-amber-300/10 text-amber-200' : 'border-white/10 bg-white/5 text-white/70'}`}>
            {item.impact}
          </span>
        </div>
        <div className="col-span-12 sm:col-span-7">
          <div className="text-sm font-semibold text-white/90">{item.raw.title}</div>
          <div className="mt-1 text-xs text-white/70">{item.raw.summary}</div>
        </div>
        <div className="col-span-12 sm:col-span-2">
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((tag) => (
              <span key={`${item.id}-${tag}`} className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] text-white/70">
                {tag}
              </span>
            ))}
            <span className={`rounded border px-1.5 py-0.5 text-[10px] ${item.sentiment === 'BULLISH' ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200' : item.sentiment === 'BEARISH' ? 'border-rose-300/30 bg-rose-300/10 text-rose-200' : 'border-white/10 bg-white/5 text-white/70'}`}>
              {item.sentiment}
            </span>
          </div>
        </div>
        <div className="col-span-12 sm:col-span-2 flex flex-wrap justify-end gap-2">
          <a href={item.raw.url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10">
            Open
          </a>
          <button onClick={() => onToggle(item.id)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10">
            {isOpen ? 'Hide' : 'Extract Signal'}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
              <div className="mb-2 text-white/60">Why it matters</div>
              <div>• {item.raw.aiWhyMatters || item.raw.summary.slice(0, 140)}</div>
              <div>• Narrative pressure: {item.narrative}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(item.raw.tickerSentiments || []).slice(0, 5).map((ticker) => (
                  <span key={`${item.id}-${ticker.ticker}`} className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] text-white/70">
                    {ticker.ticker}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
              <div className="mb-2 text-white/60">Trade Permission</div>
              <div className="mb-2">{gate.permission} • {gate.executionMode}</div>
              <div className="grid grid-cols-2 gap-2">
                <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/40 text-center" title="Coming soon">Create Alert</span>
                <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/40 text-center" title="Coming soon">Draft Trade Plan</span>
                <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/40 text-center" title="Coming soon">Extract Signal</span>
                {isAdmin ? <span className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-200/40 text-center" title="Coming soon">Log to Journal</span> : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
