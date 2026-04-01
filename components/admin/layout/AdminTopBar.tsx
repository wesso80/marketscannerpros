"use client";

import StatusPill from "../shared/StatusPill";
import type { SystemHealth } from "@/lib/admin/types";

export default function AdminTopBar({ health }: { health?: SystemHealth | null }) {
  const h = health;
  return (
    <header className="flex h-11 items-center justify-between border-b border-white/10 bg-[#0b1220] px-4">
      <div className="flex items-center gap-3">
        <div className="text-sm font-bold text-white tracking-wide">
          MSP Operator <span className="font-light text-white/50">Terminal</span>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <StatusPill label={`Feed ${h?.feed ?? "—"}`} tone={h?.feed === "HEALTHY" ? "green" : "yellow"} />
          <StatusPill label={`WS ${h?.websocket ?? "—"}`} tone={h?.websocket === "CONNECTED" ? "blue" : "neutral"} />
          <StatusPill label={`Scanner ${h?.scanner ?? "—"}`} tone={h?.scanner === "RUNNING" ? "purple" : "neutral"} />
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-white/50">
        {h?.symbolsScanned != null && <span className="hidden md:inline">Universe: {h.symbolsScanned} symbols</span>}
        {h?.lastScanAt && <span className="hidden lg:inline">Last scan: {new Date(h.lastScanAt).toLocaleTimeString()}</span>}
        <StatusPill label="Admin" tone="red" />
      </div>
    </header>
  );
}
