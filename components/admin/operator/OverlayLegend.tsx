"use client";

import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function OverlayLegend({ data }: { data?: AdminSymbolIntelligence | null }) {
  if (!data) return null;
  const rr =
    data.targets.entry && data.targets.invalidation && data.targets.target1
      ? Math.abs(data.targets.target1 - data.targets.entry) / Math.abs(data.targets.entry - data.targets.invalidation)
      : 0;

  return (
    <div className="flex flex-wrap gap-3 text-[10px] text-white/40">
      <span>
        <span className="text-blue-400/60">━</span> EMA20
        <span className="text-amber-400/60 ml-2">━</span> EMA50
      </span>
      <span className="text-white/20">|</span>
      <span>
        R:R {rr > 0 ? `1:${rr.toFixed(1)}` : "—"}
      </span>
      <span className="text-white/20">|</span>
      <span>
        ATR {data.indicators.atr > 0 ? data.indicators.atr.toFixed(data.price < 1 ? 6 : 4) : "—"}
      </span>
      <span className="text-white/20">|</span>
      <span>
        VWAP {data.indicators.vwap > 0 ? data.indicators.vwap.toFixed(data.price < 1 ? 6 : 2) : "—"}
      </span>
      <span className="text-white/20">|</span>
      <span>
        RVOL {data.indicators.rvol > 0 ? `${data.indicators.rvol.toFixed(1)}x` : "—"}
      </span>
    </div>
  );
}
