"use client";

import AdminCard from "../shared/AdminCard";
import DataRow from "../shared/DataRow";
import { mockSymbol } from "@/lib/admin/mock-data";

export default function DVESummaryCard() {
  const d = mockSymbol.dve;
  return (
    <AdminCard title="DVE" actions={<span className="text-white/30 text-xs cursor-pointer">⊞ ≡</span>}>
      <div className="space-y-0.5">
        <DataRow label="State:" value={d.state} valueColor="text-emerald-300" />
        <DataRow label="Direction" value={d.direction} valueColor="text-emerald-300" />
        <DataRow label="Permanisce: Siro" value={`Alignments: ${mockSymbol.timeConfluence.alignmentCount}`} />
        <DataRow label="Next suatter: Eevotes" value={`Next Cluster: 22:45 PM`} />
      </div>
    </AdminCard>
  );
}
