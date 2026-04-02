"use client";

import AdminCard from "../shared/AdminCard";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function EventRiskCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="Event Risk"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  const score = data.evidence?.eventSafety;
  const label = score == null ? "Unknown" : score >= 0.7 ? "Clear" : score >= 0.4 ? "Caution" : "High Risk";
  const pillColor = score == null ? "bg-white/10 border-white/20 text-white/50" : score >= 0.7 ? "bg-emerald-500/15 border-emerald-500/20 text-emerald-300" : score >= 0.4 ? "bg-amber-500/15 border-amber-500/20 text-amber-300" : "bg-red-500/15 border-red-500/20 text-red-300";
  return (
    <AdminCard title="Event Risk">
      <div className="flex items-center gap-2 mb-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs border ${pillColor}`}>{label}</span>
      </div>
      <div className="text-xs text-white/40">Event safety: {score != null ? `${(score * 100).toFixed(0)}%` : "—"}</div>
    </AdminCard>
  );
}
