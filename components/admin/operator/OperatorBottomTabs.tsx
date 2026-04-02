"use client";

import { useState } from "react";
import StatusPill from "../shared/StatusPill";
import type { ScannerHit, AdminSymbolIntelligence } from "@/lib/admin/types";

type TabKey = "signals" | "audit" | "notes";
const TABS: { key: TabKey; label: string }[] = [
  { key: "signals", label: "Signals" },
  { key: "audit", label: "Decision Audit" },
  { key: "notes", label: "Notes" },
];

export default function OperatorBottomTabs({
  hits = [],
  activeData,
}: {
  hits?: ScannerHit[];
  activeData?: AdminSymbolIntelligence | null;
}) {
  const [active, setActive] = useState<TabKey>("signals");

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#101826]">
      {/* Tab bar */}
      <div className="flex items-center border-b border-white/[0.06] px-4 py-1.5 gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`rounded px-3 py-1 text-[11px] transition ${
              active === tab.key
                ? "bg-white/[0.06] text-white/80 font-medium"
                : "text-white/30 hover:text-white/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div className="ml-auto text-[10px] text-white/20">{hits.length} signals</div>
      </div>

      {/* Tab content */}
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {active === "signals" && <SignalsTable hits={hits} />}
        {active === "audit" && <AuditTab data={activeData} />}
        {active === "notes" && <NotesTab />}
      </div>
    </div>
  );
}

/* ── Signals table ── */
function SignalsTable({ hits }: { hits: ScannerHit[] }) {
  return (
    <>
      <div className="grid grid-cols-[120px_60px_80px_120px_80px_auto] gap-2 px-4 py-2 text-[10px] text-white/30 border-b border-white/[0.04]">
        <span>Symbol</span>
        <span>Bias</span>
        <span>Confidence</span>
        <span>Regime</span>
        <span>Size</span>
        <span>Permission</span>
      </div>
      <div className="divide-y divide-white/[0.03]">
        {hits.length === 0 && (
          <div className="px-4 py-4 text-center text-xs text-white/30">No signals — run a scan</div>
        )}
        {hits.map((row) => (
          <div key={`${row.symbol}-${row.bias}`} className="grid grid-cols-[120px_60px_80px_120px_80px_auto] gap-2 px-4 py-2 items-center hover:bg-white/[0.02] transition text-[11px]">
            <span className="font-medium text-white">{row.symbol}</span>
            <span className={row.bias === "LONG" ? "text-emerald-400" : row.bias === "SHORT" ? "text-red-400" : "text-white/40"}>
              {row.bias}
            </span>
            <span className="text-white/60">{row.confidence}%</span>
            <StatusPill label={String(row.regime)} tone="purple" />
            <span className="text-white/50">{row.sizeMultiplier}x</span>
            <StatusPill
              label={row.permission}
              tone={row.permission === "GO" ? "green" : row.permission === "WAIT" ? "yellow" : "red"}
            />
          </div>
        ))}
      </div>
    </>
  );
}

/* ── Decision audit trail ── */
function AuditTab({ data }: { data?: AdminSymbolIntelligence | null }) {
  if (!data) return <div className="px-4 py-6 text-center text-xs text-white/30">Select a symbol to view audit trail</div>;
  const t = data.truth;
  return (
    <div className="px-4 py-3 text-[11px] space-y-2">
      <div className="text-white/50">
        <span className="text-white/30">Symbol: </span>
        <span className="text-white font-medium">{data.symbol}</span>
        <span className="text-white/30 ml-3">Scan: </span>
        <span>{data.lastScanAt}</span>
      </div>
      {t && (
        <>
          <div>
            <span className="text-white/30">Verdict: </span>
            <span className="font-medium" style={{ color: t.finalVerdict === "ALLOW" ? "#10B981" : t.finalVerdict === "BLOCK" ? "#EF4444" : "#6B7280" }}>
              {t.finalVerdict}
            </span>
            <span className="text-white/30 ml-3">Action: </span>
            <span className="text-white/60">{t.operatorAction}</span>
          </div>
          <div>
            <span className="text-white/30">Confidence: </span>
            <span className="text-white/60">{t.confidenceClass} · Size: {t.effectiveSize}x</span>
          </div>
          <div className="text-white/30">Reason stack:</div>
          <ul className="list-disc list-inside text-white/50 space-y-0.5">
            {t.reasonStack.map((r, i) => (
              <li key={i} className={r.impact > 0 ? "text-emerald-400/70" : "text-red-400/70"}>
                {r.label} ({r.impact > 0 ? "+" : ""}{r.impact.toFixed(2)})
              </li>
            ))}
          </ul>
          {data.blockReasons.length > 0 && (
            <div>
              <span className="text-red-400/70">Blocks: </span>
              <span className="text-white/40">{data.blockReasons.join(", ")}</span>
            </div>
          )}
          {data.penalties.length > 0 && (
            <div>
              <span className="text-amber-400/70">Penalties: </span>
              <span className="text-white/40">{data.penalties.join(", ")}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Notes pad ── */
function NotesTab() {
  const [notes, setNotes] = useState("");
  return (
    <div className="p-3">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Trade notes, observations, thesis..."
        className="w-full bg-transparent border border-white/[0.06] rounded-lg p-2 text-xs text-white/70 placeholder:text-white/20 resize-none focus:outline-none focus:border-white/20"
        rows={5}
      />
    </div>
  );
}
