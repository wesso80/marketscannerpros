"use client";

import Link from "next/link";
import StatusPill from "../shared/StatusPill";
import type { ScannerHit, PermissionState } from "@/lib/admin/types";

function permissionTone(p: PermissionState) {
  if (p === "GO") return "green" as const;
  if (p === "WAIT") return "yellow" as const;
  return "red" as const;
}

export default function ScannerFeedPanel({ hits }: { hits: ScannerHit[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Live Scanner</span>
        <span className="text-[10px] text-white/30">ADC_0</span>
      </div>
      <div className="space-y-1.5">
        {hits.map((hit) => (
          <Link
            key={hit.symbol}
            href={`/admin/terminal/${encodeURIComponent(hit.symbol)}`}
            className="block rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 transition hover:bg-white/[0.04] hover:border-white/10"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-white">{hit.symbol}</span>
                <span className="text-xs text-emerald-400">{hit.bias}</span>
              </div>
              <StatusPill label={hit.permission} tone={permissionTone(hit.permission)} />
            </div>
            <div className="flex flex-wrap gap-1 mb-1.5">
              <StatusPill label={hit.regime} tone="purple" />
            </div>
            <div className="text-[11px] text-white/40">
              Confidence: {hit.confidence}% · Trust: {hit.symbolTrust}% · Size: {hit.sizeMultiplier}x
            </div>
            {hit.permission === "BLOCK" && hit.blockReasons && hit.blockReasons.length > 0 && (
              <div className="mt-1 text-[10px] text-red-400/70">
                {hit.blockReasons.join(" · ")}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
