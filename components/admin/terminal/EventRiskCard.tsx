"use client";

import AdminCard from "../shared/AdminCard";

export default function EventRiskCard() {
  return (
    <AdminCard title="Event Risk">
      <div className="flex items-center gap-2 mb-2">
        <span className="rounded-full bg-emerald-500/15 border border-emerald-500/20 px-2.5 py-0.5 text-xs text-emerald-300">Clear</span>
      </div>
      <div className="text-xs text-white/40">No major event blocker currently active. Next scheduled event: FOMC minutes in 3d.</div>
    </AdminCard>
  );
}
