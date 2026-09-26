"use client";

import StatusPill from "../shared/StatusPill";
import type { ScannerHit, PermissionState } from "@/lib/admin/types";
import { formatHitPrice, hitPermissionTitle, hitRowKey, otherPlaybooksLabel } from "@/lib/admin/hitIntegrity";

function permissionTone(p: PermissionState) {
  if (p === "GO") return "green" as const;
  if (p === "WAIT") return "yellow" as const;
  return "red" as const;
}

export default function ScannerFeedPanel({ hits, activeSymbol, onSelect }: {
  hits: ScannerHit[];
  activeSymbol?: string;
  onSelect?: (symbol: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Live Scanner</span>
        <span className="text-[10px] text-white/30">{hits.length} hits</span>
      </div>
      <div className="space-y-1.5">
        {hits.map((hit, i) => (
          <button
            key={hitRowKey(hit, i)}
            onClick={() => onSelect?.(hit.symbol)}
            className={`block w-full text-left rounded-lg border p-2.5 transition hover:bg-white/[0.04] hover:border-white/10 ${
              activeSymbol === hit.symbol
                ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                : "border-white/[0.06] bg-white/[0.02]"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-white">{hit.symbol}</span>
                <span className={`text-xs ${hit.bias === "LONG" ? "text-emerald-400" : hit.bias === "SHORT" ? "text-red-400" : "text-white/40"}`}>{hit.bias === "LONG" ? "Bullish" : hit.bias === "SHORT" ? "Bearish" : hit.bias}</span>
                {hit.twoSided && <span className="text-[10px] text-amber-300" title="Both a LONG and a SHORT setup exist for this symbol (different playbooks)">2-sided</span>}
              </div>
              <span title={hitPermissionTitle(hit)}><StatusPill label={hit.marketPermission} tone={permissionTone(hit.marketPermission)} /></span>
            </div>
            <div className="flex flex-wrap gap-1 mb-1.5">
              <StatusPill label={hit.regime} tone="purple" />
              {hit.playbook && <span className="text-[10px] text-white/40" title={hit.otherPlaybooks?.length ? `Also: ${hit.otherPlaybooks.join(", ")}` : undefined}>{hit.playbook}{otherPlaybooksLabel(hit) ? ` ${otherPlaybooksLabel(hit)}` : ""}</span>}
            </div>
            <div className="text-[11px] text-white/40">
              Price: {formatHitPrice(hit.price)} · Confidence: {hit.confidence}% · Trust: {hit.symbolTrust}% · Size: {hit.sizeMultiplier}x
            </div>
            {(hit.permission === "BLOCK" || hit.marketPermission === "BLOCK") && hit.blockReasons && hit.blockReasons.length > 0 && (
              <div className="mt-1 text-[10px] text-red-400/70">
                {hit.blockReasons.join(" · ")}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
