"use client";

import AdminCard from "../shared/AdminCard";
import DataRow from "../shared/DataRow";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

function fmt(val: number, price: number) {
  if (!val) return "—";
  return val.toFixed(price < 1 ? 6 : 2);
}

export default function TargetsInvalidationCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="Targets / Invalidation"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  const t = data.targets;
  const p = data.price;

  // Risk/Reward ratios
  const riskAmt = t.entry && t.invalidation ? Math.abs(t.entry - t.invalidation) : 0;
  const rr1 = riskAmt > 0 && t.target1 ? Math.abs(t.target1 - t.entry) / riskAmt : 0;
  const rr2 = riskAmt > 0 && t.target2 ? Math.abs(t.target2 - t.entry) / riskAmt : 0;

  // Position sizing: 1% risk on $100k account
  const accountEquity = 100_000;
  const riskPct = 0.01;
  const riskPerUnit = riskAmt || 0.001; // Prevent division by zero
  const positionSize = Math.floor((accountEquity * riskPct * data.sizeMultiplier) / riskPerUnit);
  const notional = positionSize * (t.entry || p);

  return (
    <AdminCard title="Targets / Invalidation" actions={<span className="text-white/30 text-xs cursor-pointer">≡</span>}>
      <div className="space-y-0.5">
        <DataRow label="Entry" value={fmt(t.entry, p)} valueColor="text-emerald-300" />
        <DataRow label="Stop" value={fmt(t.invalidation, p)} valueColor="text-red-300" />
        <DataRow label="Target 1" value={`${fmt(t.target1, p)}${rr1 > 0 ? ` (${rr1.toFixed(1)}R)` : ""}`} />
        <DataRow label="Target 2" value={`${fmt(t.target2, p)}${rr2 > 0 ? ` (${rr2.toFixed(1)}R)` : ""}`} />
        {t.target3 > 0 && <DataRow label="Target 3" value={fmt(t.target3, p)} />}
      </div>

      {/* R:R Visual bar */}
      {riskAmt > 0 && rr1 > 0 && (
        <div className="mt-2.5 mb-1">
          <div className="flex items-center gap-1 text-[9px] text-white/30 mb-1">
            <span>Risk</span>
            <span className="flex-1" />
            <span>R:R 1:{rr1.toFixed(1)}</span>
          </div>
          <div className="flex h-2 rounded overflow-hidden">
            <div className="bg-red-500/50" style={{ flex: 1 }} />
            <div className="bg-emerald-500/50" style={{ flex: rr1 }} />
          </div>
        </div>
      )}

      {/* Position sizing */}
      {t.entry > 0 && riskAmt > 0 && (
        <div className="mt-2 pt-2 border-t border-white/[0.04] text-[10px] text-white/40 space-y-0.5">
          <div className="flex justify-between">
            <span>Risk per unit</span>
            <span className="text-white/60">${riskAmt.toFixed(p < 1 ? 6 : 4)}</span>
          </div>
          <div className="flex justify-between">
            <span>Size ({data.sizeMultiplier}x @ 1% risk)</span>
            <span className="text-white/60">{positionSize.toLocaleString()} units</span>
          </div>
          <div className="flex justify-between">
            <span>Notional</span>
            <span className="text-white/60">${notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
      )}
    </AdminCard>
  );
}
