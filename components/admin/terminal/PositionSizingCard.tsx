"use client";

import AdminCard from "../shared/AdminCard";
import DataRow from "../shared/DataRow";
import { mockSymbol } from "@/lib/admin/mock-data";

export default function PositionSizingCard() {
  return (
    <AdminCard title="Position Sizing">
      <DataRow label="Size Multiplier" value={`${mockSymbol.sizeMultiplier}x`} />
      <DataRow label="Permission" value={mockSymbol.permission} valueColor="text-red-300" />
      <div className="mt-2 text-[10px] text-white/30">Size locked at 0x due to BLOCK permission.</div>
    </AdminCard>
  );
}
