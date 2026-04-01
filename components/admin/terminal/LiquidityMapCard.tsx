"use client";

import AdminCard from "../shared/AdminCard";

export default function LiquidityMapCard() {
  return (
    <AdminCard title="Liquidity Map">
      <div className="text-xs text-white/40 leading-relaxed">
        Liquidity clusters and sweep zones will render here. Includes bid/ask depth visualization, large order
        detection, and historical liquidity sweep levels.
      </div>
    </AdminCard>
  );
}
