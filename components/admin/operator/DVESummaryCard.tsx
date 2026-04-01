"use client";

import AdminCard from "../shared/AdminCard";
import DataRow from "../shared/DataRow";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function DVESummaryCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="DVE"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  const d = data.dve;
  return (
    <AdminCard title="DVE" actions={<span className="text-white/30 text-xs cursor-pointer">⊞ ≡</span>}>
      <div className="space-y-0.5">
        <DataRow label="State:" value={d.state} valueColor="text-emerald-300" />
        <DataRow label="Direction" value={d.direction} valueColor="text-emerald-300" />
        <DataRow label="Permanisce: Siro" value={`Alignments: ${data.timeConfluence.alignmentCount}`} />
        <DataRow label="Next suatter: Eevotes" value={`Next Cluster: 22:45 PM`} />
      </div>
    </AdminCard>
  );
}
