'use client';
import { volatilityText } from '../displayText';
import type { BreakoutReadiness } from '@/src/features/volatilityEngine/types';
import { breakoutConditions } from '@/lib/research/volatilityDescriptions';

/**
 * Breakout setting conditions (Phase 4). The engine's readiness points are not shown as a score: a 100/100 read like
 * a confirmed breakout while no signal was active (AAPL review). Each condition is present, absent or not collected.
 */
export default function VEBreakoutPanel({ breakout, missingInputs = [] }: { breakout: BreakoutReadiness; missingInputs?: string[] }) {
  const b = breakoutConditions(breakout, missingInputs);
  return (
    <div data-breakout-conditions className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h3 className="mb-1 text-xs font-semibold tracking-widest text-amber-400">Breakout setting conditions</h3>
      <p className="mb-3 text-[11px] text-white/60">{b.headline}</p>
      <ul className="space-y-2">
        {b.conditions.map((c) => (
          <li key={c.id} data-condition={c.id} className="min-w-0">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-white/70">{c.label}</span>
              <span className={c.present === null ? 'text-white/30' : c.present ? 'font-semibold text-amber-300' : 'text-white/50'}>{c.present === null ? 'Not collected' : c.present ? 'Present' : 'Not present'}</span>
            </div>
            <p className="break-words text-[10px] text-white/35">{c.definition}</p>
          </li>
        ))}
      </ul>
      {b.details.length > 0 && (
        <div className="mt-3 space-y-0.5 border-t border-white/10 pt-2">
          {b.details.slice(0, 4).map((d, i) => <p key={i} className="text-[11px] text-white/40">{volatilityText(d)}</p>)}
        </div>
      )}
    </div>
  );
}
