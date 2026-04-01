"use client";

import AdminCard from "../shared/AdminCard";

export default function CrossMarketCard() {
  return (
    <AdminCard title="Cross-Market">
      <div className="space-y-1 text-xs text-white/50">
        <div className="flex justify-between"><span>DXY</span><span className="text-white/70">104.2 ▼</span></div>
        <div className="flex justify-between"><span>VIX</span><span className="text-white/70">18.4</span></div>
        <div className="flex justify-between"><span>BTC Dominance</span><span className="text-white/70">52.1%</span></div>
        <div className="flex justify-between"><span>Rates (10Y)</span><span className="text-white/70">4.31%</span></div>
        <div className="flex justify-between"><span>Correlation Signal</span><span className="text-emerald-400">Aligned</span></div>
      </div>
    </AdminCard>
  );
}
