"use client";

import AdminCard from "../shared/AdminCard";
import { mockSymbol } from "@/lib/admin/mock-data";

export default function IndicatorMatrixCard() {
  const i = mockSymbol.indicators;

  const rows = [
    { label: "EMA.20", val1: "-1.1% 🔖", val2: i.ema20.toFixed(2), val3: "1.20" },
    { label: "EMA20", val1: "1.79", val2: "-1.11", val3: "1.11" },
    { label: "EMA240", val1: "1.11", val2: "1.29", val3: "-0.004" },
    { label: "VWAP", val1: "1.28", val2: (i.vwap).toFixed(3), val3: "-0.634" },
    { label: "ATR", val1: `${i.atr.toFixed(2)}`, val2: "0.55%", val3: "" },
    { label: "BBWP %", val1: "", val2: "", val3: `${i.bbwpPercentile}` },
    { label: "PLO", val1: "1.0", val2: "", val3: "" },
    { label: "ADX", val1: "", val2: "", val3: `${i.adx}` },
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
