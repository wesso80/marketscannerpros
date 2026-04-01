"use client";

import AdminCard from "../shared/AdminCard";
import DataRow from "../shared/DataRow";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function TimeConfluenceDetailCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="Time Confluence Detail"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  const t = data.timeConfluence;
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
