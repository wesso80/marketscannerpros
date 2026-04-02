"use client";

import AdminCard from "../shared/AdminCard";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function VerdictHeaderCard({ data }: { data: AdminSymbolIntelligence | null }) {
  const s = data;
  if (!s) return <AdminCard title="Verdict"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  return (
    <AdminCard title="Verdict" actions={<span className="text-white/30 text-xs cursor-pointer">⊡ ⚙ ≡</span>}>
      <div className="mb-3">
        <div className="text-3xl font-bold text-white">{s.price.toFixed(3)}</div>
        <div className="text-xs text-white/40 mt-0.5">Confidence: {(s.confidence * 100).toFixed(1)}%</div>
      </div>
      <div className="space-y-0.5 text-sm">
        <div className="flex justify-between py-1">
          <span className="text-white/50">Permission State</span>
          <div className="flex gap-1.5">
            <span className="rounded bg-amber-500/15 border border-amber-500/20 px-2 py-0.5 text-xs text-amber-300">WAIT_ZONE</span>
            <span className="rounded bg-red-500/15 border border-red-500/20 px-2 py-0.5 text-xs text-red-300">LOW_LIQUIDITY</span>
          </div>
        </div>
        <div className="pl-4 space-y-1 text-xs text-white/40 border-l border-white/[0.06] ml-1">
          <div>WAIT_ZONE</div>
          <div>LOW_LIQUIDITY</div>
        </div>
      </div>
    </AdminCard>
  );
}
