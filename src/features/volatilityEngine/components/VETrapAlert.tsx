'use client';

import type { PublicPinnedCompression } from '@/src/features/volatilityEngine/types';
import { pinnedConditionLabel } from '@/lib/research/volatilityDescriptions';

/**
 * Compression next to a large open-interest strike, shown as its conditions (W3 DVE v2). The engine's trap score and
 * its "detected / candidate" verdicts are not published; a condition whose input was not collected says so.
 */
export default function VETrapAlert({ pinned }: { pinned: PublicPinnedCompression }) {
  const keys = Object.keys(pinned.conditions) as Array<keyof PublicPinnedCompression['conditions']>;
  return (
    <div data-pinned-compression className="rounded-xl border border-white/10 bg-white/5 px-5 py-4">
      <p className="text-sm font-bold text-white/80">Compression near a large open-interest strike</p>
      <ul className="mt-2 space-y-1 text-[0.72rem]">
        {keys.map((k) => (
          <li key={k} className="flex min-w-0 flex-wrap justify-between gap-x-3">
            <span className="text-white/60">{pinnedConditionLabel(k)}</span>
            <span className={pinned.conditions[k] === null ? 'text-white/30' : pinned.conditions[k] ? 'font-semibold text-amber-300' : 'text-white/50'}>
              {pinned.conditions[k] === null ? 'Not collected' : pinned.conditions[k] ? 'Yes' : 'No'}
            </span>
          </li>
        ))}
      </ul>
      {pinned.observations.length > 0 && <p className="mt-2 break-words text-[0.7rem] text-white/40">{pinned.observations.join(' · ')}</p>}
      <p className="mt-1 text-[0.68rem] text-white/35">Conditions only; they do not predict a failed or false move.</p>
    </div>
  );
}
