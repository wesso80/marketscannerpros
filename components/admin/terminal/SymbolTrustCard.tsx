"use client";

import AdminCard from "../shared/AdminCard";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function SymbolTrustCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="Symbol Trust"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  const trust = data.symbolTrust;
  const quality = trust >= 70 ? "Good" : trust >= 40 ? "Fair" : "Low";
  const qualityColor = trust >= 70 ? "text-emerald-400" : trust >= 40 ? "text-amber-300" : "text-red-400";
  const barColor = trust >= 70 ? "bg-emerald-400" : trust >= 40 ? "bg-amber-400" : "bg-red-400";
  return (
    <AdminCard title="Symbol Trust">
      <div className="space-y-2 text-xs text-white/50">
        <div className="flex justify-between"><span>Data Quality</span><span className={qualityColor}>{quality}</span></div>
        <div className="flex justify-between"><span>Composite Trust</span><span className="text-sky-300 font-medium">{trust}%</span></div>
        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${trust}%` }} />
          </div>
        </div>
      </div>
    </AdminCard>
  );
}
