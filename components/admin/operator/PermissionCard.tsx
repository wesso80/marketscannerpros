"use client";

import AdminCard from "../shared/AdminCard";
import { mockSymbol } from "@/lib/admin/mock-data";

export default function PermissionCard() {
  return (
    <AdminCard title="Permission State">
      <div className="space-y-1.5">
        {mockSymbol.blockReasons.map((reason) => (
          <div key={reason} className="rounded-lg border border-red-500/15 bg-red-500/[0.06] px-3 py-1.5 text-xs text-red-300">
            {reason}
          </div>
        ))}
        {mockSymbol.penalties.map((p) => (
          <div key={p} className="rounded-lg border border-amber-500/15 bg-amber-500/[0.06] px-3 py-1.5 text-xs text-amber-300">
            {p}
          </div>
        ))}
      </div>
    </AdminCard>
  );
}
