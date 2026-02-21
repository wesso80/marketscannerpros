import React from 'react';
import { NarrativeGroup, NewsGateModel } from './types';

interface RotationBoardProps {
  gate: NewsGateModel;
  groups: NarrativeGroup[];
}

export default function RotationBoard({ gate, groups }: RotationBoardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-white/60">Rotation Board</div>
      <div className="mt-1 text-sm font-semibold text-white/90">Flow Map</div>
      <div className="mt-3 space-y-2 text-xs">
        <div className="rounded-xl border border-white/10 bg-white/5 p-2">
          <div className="text-white/60">Leading Themes</div>
          <div className="mt-1 text-white/85">{gate.rotationLeaders.slice(0, 2).join(' • ') || 'No leader'}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-2">
          <div className="text-white/60">Lagging Themes</div>
          <div className="mt-1 text-white/85">{groups.slice(-2).map((group) => group.narrative).join(' • ') || 'No laggards'}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-2">
          <div className="text-white/60">Newly Emerging</div>
          <div className="mt-1 text-white/85">{groups[1]?.narrative || 'Monitor incoming shifts'}</div>
        </div>
      </div>
    </article>
  );
}
