"use client";

import AdminCard from "../shared/AdminCard";
import DataRow from "../shared/DataRow";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function KeyLevelsCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="Key Levels"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  const l = data.levels;
  return (
    <AdminCard title="Key Levels">
      <DataRow label="PDH" value={l.pdh.toFixed(3)} />
      <DataRow label="PDL" value={l.pdl.toFixed(3)} />
      <DataRow label="VWAP" value={l.vwap.toFixed(3)} />
      <DataRow label="Midpoint" value={l.midpoint.toFixed(3)} />
      <DataRow label="Weekly High" value={l.weeklyHigh.toFixed(3)} />
      <DataRow label="Weekly Low" value={l.weeklyLow.toFixed(3)} />
      <DataRow label="Monthly High" value={l.monthlyHigh.toFixed(3)} />
      <DataRow label="Monthly Low" value={l.monthlyLow.toFixed(3)} />
    </AdminCard>
  );
}
