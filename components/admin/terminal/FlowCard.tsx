"use client";

import AdminCard from "../shared/AdminCard";

export default function FlowCard() {
  return (
    <AdminCard title="Flow">
      <div className="space-y-1 text-xs text-white/50">
        <div className="flex justify-between"><span>Open Interest</span><span className="text-white/70">+2.1M</span></div>
        <div className="flex justify-between"><span>Funding Rate</span><span className="text-white/70">0.005%</span></div>
        <div className="flex justify-between"><span>Long/Short Ratio</span><span className="text-emerald-400">1.24</span></div>
        <div className="flex justify-between"><span>CVD</span><span className="text-white/70">Positive</span></div>
      </div>
    </AdminCard>
  );
}
