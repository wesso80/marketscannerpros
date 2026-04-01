"use client";

import StatusPill from "../shared/StatusPill";

export default function OperatorTopToolbar() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#101826] px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill label="Auto-Scan Live" tone="green" />
        <StatusPill label="15m" tone="blue" />
        <StatusPill label="Every 5m" tone="purple" />
        <StatusPill label="Session FULL" tone="neutral" />
      </div>
      <div className="flex items-center gap-2">
        <button className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06] transition">
          Pass Criteria
        </button>
        <button className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 transition">
          Kill Switch
        </button>
      </div>
    </div>
  );
}
