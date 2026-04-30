"use client";

import AdminCard from "../shared/AdminCard";
import DataRow from "../shared/DataRow";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function RiskGovernorCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="Research Guard"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  return (
    <AdminCard title="Research Guard" actions={<span className="text-white/30 text-xs cursor-pointer">⊑ ⚙ ≡</span>}>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between py-1.5 text-sm">
          <span className="text-white/55">Research Gate</span>
          <span className="rounded bg-red-500/15 border border-red-500/20 px-2 py-0.5 text-xs font-medium text-red-300">
            {data.permission}
          </span>
        </div>
        <DataRow label="Size Multiplier" value={`${data.sizeMultiplier}x`} />
        <DataRow label="Confidence" value={`${data.confidence}%`} />
        <DataRow label="Symbol Trust" value={`${data.symbolTrust}%`} />
      </div>
    </AdminCard>
  );
}
