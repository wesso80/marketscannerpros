"use client";

import AdminCard from "../shared/AdminCard";

export default function SymbolTrustCard() {
  return (
    <AdminCard title="Symbol Trust">
      <div className="space-y-2 text-xs text-white/50">
        <div className="flex justify-between"><span>Data Quality</span><span className="text-white/70">Good</span></div>
        <div className="flex justify-between"><span>Spread Stability</span><span className="text-white/70">Moderate</span></div>
        <div className="flex justify-between"><span>Volume Consistency</span><span className="text-white/70">Low</span></div>
        <div className="flex justify-between"><span>Historical Win Rate</span><span className="text-white/70">—</span></div>
        <div className="flex justify-between"><span>Composite Trust</span><span className="text-sky-300 font-medium">53%</span></div>
      </div>
    </AdminCard>
  );
}
