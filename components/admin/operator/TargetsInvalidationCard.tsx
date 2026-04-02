"use client";

import AdminCard from "../shared/AdminCard";
import DataRow from "../shared/DataRow";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function TargetsInvalidationCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="Targets / Invalidation"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  const t = data.targets;
  return (
    <AdminCard title="Targets / Invalidation" actions={<span className="text-white/30 text-xs cursor-pointer">≡</span>}>
      <div className="space-y-0.5">
        <DataRow label="Entry" value={t.entry.toFixed(3)} valueColor="text-emerald-300" />
        <DataRow label="Invalidation" value={t.invalidation.toFixed(3)} valueColor="text-red-300" />
        <DataRow label="Target 1" value={t.target1.toFixed(3)} />
        <DataRow label="Target 2" value={t.target2.toFixed(3)} />
        <DataRow label="Target 3" value={t.target3.toFixed(3)} />
      </div>
      <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-xs text-white/40 leading-relaxed">
        Entry and invalidation levels derived from playbook structure analysis. Targets are generated based on key level proximity and risk-reward ratio.
      </div>
    </AdminCard>
  );
}
