"use client";

import AdminCard from "../shared/AdminCard";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function FlowCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="Flow"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  const flowScore = data.evidence?.participationFlow;
  const rvol = data.indicators.rvol;
  const flowLabel = flowScore == null ? "—" : flowScore >= 0.7 ? "Strong" : flowScore >= 0.4 ? "Moderate" : "Weak";
  const flowColor = flowScore == null ? "text-white/50" : flowScore >= 0.7 ? "text-emerald-400" : flowScore >= 0.4 ? "text-amber-300" : "text-red-400";
  return (
    <AdminCard title="Flow">
      <div className="space-y-1 text-xs text-white/50">
        <div className="flex justify-between"><span>Participation</span><span className={flowColor}>{flowScore != null ? `${(flowScore * 100).toFixed(0)}%` : "—"}</span></div>
        <div className="flex justify-between"><span>Flow Status</span><span className={flowColor}>{flowLabel}</span></div>
        <div className="flex justify-between"><span>RVOL</span><span className={rvol >= 1.5 ? "text-emerald-400" : rvol >= 1.0 ? "text-white/70" : "text-red-400"}>{rvol.toFixed(2)}x</span></div>
      </div>
    </AdminCard>
  );
}
