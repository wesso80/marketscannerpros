"use client";

import AdminCard from "../shared/AdminCard";
import DataRow from "../shared/DataRow";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function DVEDetailCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="DVE Detail"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  const d = data.dve;
  return (
    <AdminCard title="DVE Detail">
      <div className="space-y-0.5">
        <DataRow label="State" value={d.state} valueColor="text-emerald-300" />
        <DataRow label="Direction" value={d.direction} valueColor="text-emerald-300" />
        <DataRow label="Persistence" value={`${Math.round(d.persistence * 100)}%`} />
        <DataRow label="Breakout Readiness" value={d.breakoutReadiness} />
        <DataRow label="Trap" value={d.trap ? "⚠ Yes" : "No"} valueColor={d.trap ? "text-red-300" : "text-white/90"} />
        <DataRow label="Exhaustion" value={d.exhaustion ? "⚠ Yes" : "No"} valueColor={d.exhaustion ? "text-amber-300" : "text-white/90"} />
      </div>
    </AdminCard>
  );
}
