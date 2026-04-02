"use client";

import StatusPill from "../shared/StatusPill";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function SymbolContextHeader({ data }: { data: AdminSymbolIntelligence | null }) {
  const s = data;
  if (!s) return <div className="rounded-xl border border-white/[0.08] bg-[#101826] px-4 py-3 text-white/30 text-sm">No symbol data loaded</div>;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#101826] px-4 py-3">
      <div className="flex items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">{s.symbol}</span>
            <span className="text-xs text-white/30">{s.timeframe}</span>
          </div>
          <div className="text-xs text-white/40 mt-0.5">
            Confidence: {(s.confidence * 100).toFixed(1)}% · Permission: {s.permission}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-6 text-xs text-white/50">
        <div className="flex items-center gap-1.5">
          <span className="text-white/30">Regime:</span>
          <span className="text-white/70">{s.regime}</span>
        </div>
        <div>Playbook: {s.playbook || '—'}</div>
        <div>Bias: {s.bias || '—'}</div>
      </div>
    </div>
  );
}
