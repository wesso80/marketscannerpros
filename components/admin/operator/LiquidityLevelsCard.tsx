"use client";

import AdminCard from "../shared/AdminCard";
import DataRow from "../shared/DataRow";
import { mockSymbol } from "@/lib/admin/mock-data";

export default function LiquidityLevelsCard() {
  const l = mockSymbol.levels;
  return (
    <AdminCard title="Liquidity / Levels">
      <div className="space-y-0.5">
        <DataRow label="PDH" value={l.pdh.toFixed(3)} />
        <DataRow label="PDL" value={l.pdl.toFixed(3)} />
        <DataRow label="Viously Migh." value={`${l.weeklyHigh.toFixed(2)}`} />
        <DataRow label="Montlly Low" value={`-${l.monthlyLow.toFixed(2)}`} />
        <DataRow label="Moudy Low" value={`-${l.monthlyLow.toFixed(2)}`} />
        <DataRow label="Midpiont" value={l.midpoint.toFixed(3)} />
      </div>
    </AdminCard>
  );
}
