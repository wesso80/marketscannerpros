"use client";

import StatusPill from "../shared/StatusPill";
import { mockSymbol } from "@/lib/admin/mock-data";

export default function SymbolHeader({ symbol }: { symbol: string }) {
  const s = mockSymbol;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#101826] px-4 py-3">
      <div>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-white">{symbol}</span>
          <span className="text-lg font-semibold text-white/70">${s.price.toFixed(3)}</span>
          <span className={`text-sm ${s.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {s.changePercent >= 0 ? "+" : ""}{s.changePercent}%
          </span>
        </div>
        <div className="text-xs text-white/40 mt-0.5">
          {s.timeframe} · Session {s.session} · Last scan {s.lastScanAt}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusPill label={s.bias} tone="green" />
        <StatusPill label={s.regime} tone="purple" />
        <StatusPill
          label={s.permission}
          tone={s.permission === "GO" ? "green" : s.permission === "WAIT" ? "yellow" : "red"}
        />
        <StatusPill label={`${s.confidence}%`} tone="blue" />
        <StatusPill label={`Trust ${s.symbolTrust}%`} tone="neutral" />
      </div>
    </div>
  );
}
