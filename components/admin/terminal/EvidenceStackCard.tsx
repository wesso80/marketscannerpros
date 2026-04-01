"use client";

import AdminCard from "../shared/AdminCard";

const evidence = [
  { label: "Directional", status: "constructive", tone: "text-emerald-400" },
  { label: "Volatility", status: "expansion phase", tone: "text-amber-300" },
  { label: "Structure", status: "continuation intact", tone: "text-emerald-400" },
  { label: "Participation", status: "acceptable", tone: "text-white/70" },
  { label: "Flow", status: "neutral", tone: "text-white/50" },
  { label: "Timing", status: "hot window active", tone: "text-amber-300" },
  { label: "Cross-Market", status: "aligned", tone: "text-emerald-400" },
];

export default function EvidenceStackCard() {
  return (
    <AdminCard title="Evidence Stack">
      <div className="space-y-1">
        {evidence.map((e) => (
          <div key={e.label} className="flex items-center justify-between text-xs py-0.5">
            <span className="text-white/50">{e.label}</span>
            <span className={e.tone}>{e.status}</span>
          </div>
        ))}
      </div>
    </AdminCard>
  );
}
