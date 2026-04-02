"use client";

import AdminCard from "../shared/AdminCard";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

function scoreTone(v: number) {
  if (v >= 0.7) return "text-emerald-400";
  if (v >= 0.4) return "text-amber-300";
  return "text-red-400";
}
function scoreLabel(v: number) {
  if (v >= 0.7) return "strong";
  if (v >= 0.4) return "moderate";
  return "weak";
}

export default function EvidenceStackCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="Evidence Stack"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  const e = data.evidence;
  if (!e) return <AdminCard title="Evidence Stack"><div className="text-white/30 text-xs">No evidence data</div></AdminCard>;
  const rows = [
    { label: "Regime Fit", val: e.regimeFit },
    { label: "Structure", val: e.structureQuality },
    { label: "Timing", val: e.timeConfluence },
    { label: "Volatility", val: e.volatilityAlignment },
    { label: "Participation", val: e.participationFlow },
    { label: "Cross-Market", val: e.crossMarketConfirmation },
    { label: "Event Safety", val: e.eventSafety },
    { label: "Extension Safety", val: e.extensionSafety },
    { label: "Symbol Trust", val: e.symbolTrust },
    { label: "Model Health", val: e.modelHealth },
  ];
  return (
    <AdminCard title="Evidence Stack">
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-xs py-0.5">
            <span className="text-white/50">{r.label}</span>
            <span className={scoreTone(r.val)}>{scoreLabel(r.val)} ({(r.val * 100).toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </AdminCard>
  );
}
