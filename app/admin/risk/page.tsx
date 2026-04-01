"use client";

import SectionTitle from "@/components/admin/shared/SectionTitle";
import AdminCard from "@/components/admin/shared/AdminCard";
import MiniStat from "@/components/admin/shared/MiniStat";

export default function RiskPage() {
  return (
    <div className="p-4 space-y-4">
      <SectionTitle title="Risk Governor" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Open Exposure" value="$0" />
        <MiniStat label="Daily Drawdown" value="0%" />
        <MiniStat label="Correlation Risk" value="Low" />
        <MiniStat label="Max Positions" value="—" />
      </div>
      <AdminCard title="Position Limits">
        <p className="text-white/40 text-sm">Configure risk limits and position sizing rules here.</p>
      </AdminCard>
      <AdminCard title="Kill Switch">
        <p className="text-white/40 text-sm">Emergency position closure controls will appear here.</p>
      </AdminCard>
    </div>
  );
}
