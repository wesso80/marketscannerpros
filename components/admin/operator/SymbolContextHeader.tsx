"use client";

import type { AdminSymbolIntelligence } from "@/lib/admin/types";

function verdictBg(v: string | undefined) {
  switch (v) {
    case "ALLOW": return "rgba(16,185,129,0.15)";
    case "ALLOW_REDUCED": return "rgba(251,191,36,0.15)";
    case "WAIT": return "rgba(107,114,128,0.15)";
    case "BLOCK": return "rgba(239,68,68,0.15)";
    default: return "rgba(107,114,128,0.1)";
  }
}

function verdictColor(v: string | undefined) {
  switch (v) {
    case "ALLOW": return "#10B981";
    case "ALLOW_REDUCED": return "#FBBF24";
    case "WAIT": return "#6B7280";
    case "BLOCK": return "#EF4444";
    default: return "#6B7280";
  }
}

export default function SymbolContextHeader({ data }: { data: AdminSymbolIntelligence | null }) {
  const s = data;
  if (!s) return <div className="rounded-xl border border-white/[0.08] bg-[#101826] px-4 py-3 text-white/30 text-sm">No symbol data loaded</div>;

  const t = s.truth;
  const verdict = t?.finalVerdict ?? s.permission;
  const action = t?.operatorAction;
  const primary = t?.primaryReason?.label;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#101826] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: symbol + verdict badge */}
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-white">{s.symbol}</span>
          <span style={{
            fontSize: "0.7rem", fontWeight: 700, padding: "3px 10px", borderRadius: 8,
            background: verdictBg(verdict), color: verdictColor(verdict),
          }}>
            {verdict}
          </span>
          {action && (
            <span className="text-xs text-white/40">{action.replace(/_/g, " ").toLowerCase()}</span>
          )}
          <span className="text-[10px] text-white/20">{s.timeframe}</span>
        </div>

        {/* Right: price + change */}
        <div className="flex items-center gap-4 text-xs text-white/50">
          {s.price > 0 && (
            <span className="font-mono text-white/70">${s.price.toFixed(s.price < 1 ? 6 : 2)}</span>
          )}
          {s.changePercent !== 0 && (
            <span style={{ color: s.changePercent > 0 ? "#10B981" : "#EF4444" }}>
              {s.changePercent > 0 ? "+" : ""}{s.changePercent.toFixed(2)}%
            </span>
          )}
          <span>{s.regime}</span>
          <span>{s.playbook || "—"}</span>
        </div>
      </div>

      {/* Primary reason line — judgment first */}
      {primary && (
        <div className="mt-1.5 text-xs text-white/40" style={{ lineHeight: 1.3 }}>
          {primary}
        </div>
      )}
    </div>
  );
}
