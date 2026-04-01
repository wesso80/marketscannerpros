"use client";

import AdminCard from "../shared/AdminCard";
import DataRow from "../shared/DataRow";
import { mockSymbol } from "@/lib/admin/mock-data";

export default function TimeConfluenceCard() {
  const t = mockSymbol.timeConfluence;
  return (
    <AdminCard title="Time Confluence Detail">
      <div className="space-y-0.5">
        <DataRow label="Score" value={t.score} />
        <DataRow label="Hot Window" value={t.hotWindow ? "Yes" : "No"} valueColor={t.hotWindow ? "text-amber-300" : "text-white/90"} />
        <DataRow label="Alignments" value={t.alignmentCount} />
        <DataRow label="Next Cluster" value={t.nextClusterAt} />
      </div>
    </AdminCard>
  );
}
