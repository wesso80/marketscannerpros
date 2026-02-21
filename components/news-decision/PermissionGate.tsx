import React from 'react';
import { NewsGateModel } from './types';

interface PermissionGateProps {
  gate: NewsGateModel;
}

export default function PermissionGate({ gate }: PermissionGateProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-4 lg:col-span-2">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-white/60">News Deployment Gate</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm font-semibold text-white/90">PERMISSION:</span>
            <span
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
                gate.permission === 'YES'
                  ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200'
                  : gate.permission === 'NO'
                    ? 'border-rose-300/30 bg-rose-300/10 text-rose-200'
                    : 'border-amber-300/30 bg-amber-300/10 text-amber-200'
              }`}
            >
              {gate.permission}
            </span>
          </div>
          <p className="mt-2 text-sm text-white/70">
            {gate.permission === 'NO'
              ? 'High-impact macro catalysts + event shock language elevate downside risk.'
              : gate.permission === 'CONDITIONAL'
                ? 'Risk is tradable with tighter risk controls and leader-only selection.'
                : 'Narratives are stable enough for normal trend deployment.'}
          </p>
        </div>
        <div className="text-right text-xs text-white/60">
          Execution: <span className="font-semibold text-white/85">{gate.executionMode}</span>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {[
          `Risk State: ${gate.riskState}`,
          `Vol Regime: ${gate.volRegime}`,
          `Catalyst Density: ${gate.catalystDensity}`,
          `Narrative Strength: ${gate.narrativeStrength}`,
          `Execution Mode: ${gate.executionMode}`,
        ].map((chip) => (
          <span key={chip} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/75">
            {chip}
          </span>
        ))}
      </div>

      <div className="space-y-1 text-xs text-white/70">
        <div>• No new size within T-15/T+15 of high-impact prints.</div>
        <div>• If Risk-Off + Expansion → reduce leverage and trade leaders only.</div>
        <div>• If narrative is dominant + sentiment improving → trend permission.</div>
      </div>
    </article>
  );
}
