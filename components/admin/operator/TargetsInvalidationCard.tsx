"use client";

import AdminCard from "../shared/AdminCard";
import DataRow from "../shared/DataRow";
import { mockSymbol } from "@/lib/admin/mock-data";

export default function TargetsInvalidationCard() {
  const t = mockSymbol.targets;
  return (
    <AdminCard title="Targets / Invalidation" actions={<span className="text-white/30 text-xs cursor-pointer">≡</span>}>
      <div className="space-y-0.5">
        <DataRow label="Entry" value={t.entry.toFixed(3)} valueColor="text-emerald-300" />
        <DataRow label="Invalidation" value={t.invalidation.toFixed(3)} valueColor="text-red-300" />
        <DataRow label="Target 1" value={t.target1.toFixed(3)} />
        <DataRow label="Target 2" value={t.target2.toFixed(3)} />
        <DataRow label="Target 3" value={t.target3.toFixed(3)} />
      </div>
      <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-xs text-white/40 leading-relaxed">
        Trend remains constructive, but permission to Moohzen and to majorify mod demopoition. Resouraton conspensitive vs majority Simsugus Ind met grouds, in nie yer umited something.
      </div>
    </AdminCard>
  );
}
