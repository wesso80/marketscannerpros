"use client";

import AdminCard from "../shared/AdminCard";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function IndicatorMatrixCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="Indicator Matrix"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  const i = data.indicators;

  const rows = [
    { label: "EMA 20", val1: i.ema20.toFixed(2), val2: "", val3: "" },
    { label: "EMA 50", val1: i.ema50.toFixed(2), val2: "", val3: "" },
    { label: "EMA 200", val1: i.ema200.toFixed(2), val2: "", val3: "" },
    { label: "VWAP", val1: i.vwap.toFixed(3), val2: "", val3: "" },
    { label: "ATR", val1: i.atr.toFixed(4), val2: "", val3: "" },
    { label: "BBWP %", val1: `${i.bbwpPercentile}`, val2: "", val3: "" },
    { label: "ADX", val1: `${i.adx.toFixed(1)}`, val2: "", val3: "" },
    { label: "RVOL", val1: `${i.rvol.toFixed(2)}x`, val2: "", val3: "" },
  ];

  return (
    <AdminCard title="Indicator Matrix" actions={<span className="text-white/30 text-xs cursor-pointer">⊡ ≡</span>}>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-white/[0.04]">
                <td className="py-1 text-white/50 pr-2">{r.label}</td>
                <td className="py-1 text-white/70 text-right px-1">{r.val1}</td>
                <td className="py-1 text-white/70 text-right px-1">{r.val2}</td>
                <td className="py-1 text-white/70 text-right pl-1">{r.val3}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminCard>
  );
}
