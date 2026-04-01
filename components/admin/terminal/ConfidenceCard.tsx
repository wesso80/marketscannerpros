"use client";

import AdminCard from "../shared/AdminCard";
import DataRow from "../shared/DataRow";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function ConfidenceCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="Confidence"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  return (
    <AdminCard title="Confidence">
      <DataRow label="Confidence" value={`${data.confidence}%`} valueColor="text-sky-300" />
      <DataRow label="Symbol Trust" value={`${data.symbolTrust}%`} />
      <DataRow label="Size Multiplier" value={`${data.sizeMultiplier}x`} />
    </AdminCard>
  );
}
