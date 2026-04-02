"use client";

import AdminCard from "../shared/AdminCard";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function CrossMarketCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="Cross-Market"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  const score = data.evidence?.crossMarketConfirmation;
  const label = score == null ? "—" : score >= 0.7 ? "Aligned" : score >= 0.4 ? "Mixed" : "Divergent";
  const color = score == null ? "text-white/50" : score >= 0.7 ? "text-emerald-400" : score >= 0.4 ? "text-amber-300" : "text-red-400";
  return (
    <AdminCard title="Cross-Market">
      <div className="space-y-1 text-xs text-white/50">
        <div className="flex justify-between"><span>Confirmation Score</span><span className={color}>{score != null ? `${(score * 100).toFixed(0)}%` : "—"}</span></div>
        <div className="flex justify-between"><span>Status</span><span className={color}>{label}</span></div>
      </div>
    </AdminCard>
  );
}
