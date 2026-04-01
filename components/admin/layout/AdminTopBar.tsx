"use client";

import StatusPill from "../shared/StatusPill";
import { mockSystemHealth } from "@/lib/admin/mock-data";

export default function AdminTopBar() {
  return (
    <header className="flex h-11 items-center justify-between border-b border-white/10 bg-[#0b1220] px-4">
      <div className="flex items-center gap-3">
        <div className="text-sm font-bold text-white tracking-wide">
          MSP Operator <span className="font-light text-white/50">Terminal</span>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <StatusPill label={`Feed ${mockSystemHealth.feed}`} tone="green" />
          <StatusPill label={`WS ${mockSystemHealth.websocket}`} tone="blue" />
          <StatusPill label={`Scanner ${mockSystemHealth.scanner}`} tone="purple" />
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-white/50">
        <span className="hidden md:inline">WORK4fea: 24.3s</span>
        <span className="hidden md:inline">Universe: 16 symbols</span>
        <span className="hidden lg:inline">Latency: 118ms</span>
        <StatusPill label="Admin" tone="red" />
      </div>
    </header>
  );
}
