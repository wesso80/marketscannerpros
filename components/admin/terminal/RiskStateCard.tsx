"use client";

import AdminCard from "../shared/AdminCard";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function RiskStateCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="Risk State"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  return (
    <AdminCard title="Risk State">
      <div className="space-y-1.5">
        <div className="text-xs text-white/40 mb-2">Block Reasons</div>
        {data.blockReasons.map((r) => (
          <div key={r} className="rounded-lg border border-red-500/15 bg-red-500/[0.06] px-3 py-1.5 text-xs text-red-300">{r}</div>
        ))}
        <div className="text-xs text-white/40 mt-3 mb-2">Penalties</div>
        {data.penalties.map((p) => (
          <div key={p} className="rounded-lg border border-amber-500/15 bg-amber-500/[0.06] px-3 py-1.5 text-xs text-amber-300">{p}</div>
        ))}
      </div>
    </AdminCard>
  );
}
