"use client";

import AdminCard from "../shared/AdminCard";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function SetupTypeCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="Setup Type"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  const label = data.playbook ? String(data.playbook).replace(/_/g, " ") : "None detected";
  return (
    <AdminCard title="Setup Type">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-violet-500/10 border border-violet-500/20 px-2.5 py-1 text-xs text-violet-300">
          {label}
        </span>
      </div>
      <div className="mt-2 text-[10px] text-white/30">
        Regime: {data.regime} · Bias: {data.bias}
      </div>
    </AdminCard>
  );
}
