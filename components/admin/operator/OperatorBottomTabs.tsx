"use client";

import { useState } from "react";
import Tabs from "../shared/Tabs";
import StatusPill from "../shared/StatusPill";
import type { BottomTabKey, ScannerHit } from "@/lib/admin/types";

const tabKeys: BottomTabKey[] = ["signals", "logs", "news", "options", "notes", "audit", "ai"];

function permissionTone(perms: string[]) {
  if (perms.some(p => p.includes("LOW") || p.includes("BLOCK"))) return "red" as const;
  if (perms.some(p => p.includes("WAIT") || p.includes("OVER"))) return "yellow" as const;
  return "green" as const;
}

export default function OperatorBottomTabs({ hits = [] }: { hits?: ScannerHit[] }) {
  const [active, setActive] = useState<BottomTabKey>("signals");

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#101826]">
      {/* Tab headers */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
        <div className="flex items-center gap-4">
          <span className="text-xs text-white/40">Time Confluence</span>
          <span className="text-xs text-white/40">Detail</span>
          <span className="text-xs text-white/40">Liquidity</span>
          <span className="text-xs text-white/40">News</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[10px] text-white/40">🔍</button>
          <span className="text-[10px] text-white/30">Filter ▾</span>
        </div>
      </div>

      {/* Signal table header */}
      <div className="grid grid-cols-[120px_80px_100px_100px_120px_80px_auto] gap-2 px-4 py-2 text-[10px] text-white/30 border-b border-white/[0.04]">
        <span>Signals ↕</span>
        <span>Bias ↕</span>
        <span>Confidence ↕</span>
        <span>Regime ↕</span>
        <span>Time Confluence ↕</span>
        <span>Score ↕</span>
        <span>Permission</span>
      </div>

      {/* Signal rows */}
      <div className="divide-y divide-white/[0.03]">
        {hits.length === 0 && (
          <div className="px-4 py-4 text-center text-xs text-white/30">No signals yet — run a scan</div>
        )}
        {hits.map((row) => (
          <div key={row.symbol} className="grid grid-cols-[120px_80px_100px_100px_120px_80px_auto] gap-2 px-4 py-2.5 items-center hover:bg-white/[0.02] transition cursor-pointer">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-white">{row.symbol}</span>
              <span className="text-amber-400 text-[10px]">●</span>
            </div>
            <span className="text-xs text-emerald-400">{row.bias}</span>
            <span className="text-xs text-white/60">- {row.confidence}%</span>
            <StatusPill label={String(row.regime)} tone="purple" />
            <span className="text-[10px] text-white/40">{row.timestamp ?? ""}</span>
            <span className="text-xs text-white/50">{(row.confidence / 100).toFixed(2)}</span>
            <div className="flex flex-wrap gap-1">
              {(row.blockReasons ?? [row.permission]).map((p) => (
                <span key={p} className="rounded bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 text-[9px] text-white/40">
                  {p}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom tab bar */}
      <div className="flex items-center border-t border-white/[0.06] px-4 py-1.5 gap-1">
        <Tabs tabs={tabKeys} active={active} onChange={setActive} />
      </div>
    </div>
  );
}
