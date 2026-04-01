"use client";

import AdminCard from "../shared/AdminCard";
import { mockSymbol } from "@/lib/admin/mock-data";

export default function RiskStateCard() {
  return (
    <AdminCard title="Risk State">
      <div className="space-y-1.5">
        <div className="text-xs text-white/40 mb-2">Block Reasons</div>
        {mockSymbol.blockReasons.map((r) => (
          <div key={r} className="rounded-lg border border-red-500/15 bg-red-500/[0.06] px-3 py-1.5 text-xs text-red-300">{r}</div>
        ))}
        <div className="text-xs text-white/40 mt-3 mb-2">Penalties</div>
        {mockSymbol.penalties.map((p) => (
          <div key={p} className="rounded-lg border border-amber-500/15 bg-amber-500/[0.06] px-3 py-1.5 text-xs text-amber-300">{p}</div>
        ))}
      </div>
    </AdminCard>
  );
}
