"use client";

import AdminCard from "../shared/AdminCard";
import DataRow from "../shared/DataRow";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function PositionSizingCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="Position Sizing"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  return (
    <AdminCard title="Position Sizing">
      <DataRow label="Size Multiplier" value={`${data.sizeMultiplier}x`} />
      <DataRow label="Permission" value={data.permission} valueColor="text-red-300" />
      <div className="mt-2 text-[10px] text-white/30">{data.permission === "BLOCK" ? "Size locked at 0x due to BLOCK permission." : `Sizing at ${data.sizeMultiplier}x`}</div>
    </AdminCard>
  );
}
