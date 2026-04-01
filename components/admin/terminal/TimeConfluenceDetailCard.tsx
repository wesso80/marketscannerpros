"use client";

import AdminCard from "../shared/AdminCard";
import DataRow from "../shared/DataRow";
import { mockSymbol } from "@/lib/admin/mock-data";

export default function TimeConfluenceDetailCard() {
  const t = mockSymbol.timeConfluence;
  return (
    <AdminCard title="Time Confluence Detail">
      <div className="space-y-0.5">
        <DataRow label="Score" value={t.score} />
        <DataRow label="Hot Window" value={t.hotWindow ? "🔥 Active" : "Inactive"} valueColor={t.hotWindow ? "text-amber-300" : "text-white/50"} />
        <DataRow label="Alignment Count" value={t.alignmentCount} />
        <DataRow label="Next Cluster" value={t.nextClusterAt} />
      </div>
    </AdminCard>
  );
}
