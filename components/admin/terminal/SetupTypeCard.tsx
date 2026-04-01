"use client";

import AdminCard from "../shared/AdminCard";

export default function SetupTypeCard() {
  return (
    <AdminCard title="Setup Type">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-violet-500/10 border border-violet-500/20 px-2.5 py-1 text-xs text-violet-300">
          Breakout Continuation
        </span>
      </div>
      <div className="mt-2 text-[10px] text-white/30">
        Detected via regime + structure alignment. Awaiting volume confirmation.
      </div>
    </AdminCard>
  );
}
