"use client";

import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function LiveChartPanel({ data }: { data: AdminSymbolIntelligence | null }) {
  return (
    <div className="relative rounded-xl border border-white/[0.06] bg-[#0b1220] overflow-hidden" style={{ height: 380 }}>
      {/* EMA overlay header */}
      <div className="absolute top-2 left-3 z-10 flex flex-wrap gap-2 text-[10px]">
        <span className="text-amber-400">{data?.symbol ?? ""} · {data?.timeframe ?? ""}</span>
        <span className="text-emerald-400">{data?.regime ?? ""}</span>
        <span className="text-white/40">EMA20 {data?.indicators.ema20.toFixed(2) ?? "—"}</span>
        <span className="text-white/40">EMA50 {data?.indicators.ema50.toFixed(2) ?? "—"}</span>
        <span className="text-white/40">EMA200 {data?.indicators.ema200.toFixed(2) ?? "—"}</span>
        <span className="text-white/40">VWAP {data?.indicators.vwap.toFixed(3) ?? "—"}</span>
        <span className="text-white/40">ATR {data?.indicators.atr.toFixed(4) ?? "—"}</span>
      </div>

      {/* Price axis on right */}
      <div className="absolute top-0 right-0 flex flex-col justify-between h-full py-8 pr-2 text-[10px] text-white/30">
        <span>1.254</span>
        <span>1.245</span>
        <span>1.236</span>
        <span>1.227</span>
        <span>1.218</span>
        <span>1.205</span>
      </div>

      {/* Key level labels */}
      <div className="absolute right-16 top-[35%] text-[9px]">
        <div className="text-white/40 flex items-center gap-1">
          <span className="h-px w-4 bg-white/20 inline-block" />
          Invalidation
        </div>
      </div>
      <div className="absolute right-16 top-[55%] text-[9px]">
        <div className="text-white/30 flex items-center gap-1">
          <span className="h-px w-4 bg-white/15 inline-block" />
          Entry
        </div>
      </div>
      <div className="absolute right-16 top-[65%] text-[9px]">
        <div className="text-white/30 flex items-center gap-1">
          <span className="h-px w-4 bg-white/15 inline-block" />
          Target 1
        </div>
      </div>

      {/* Current price tag */}
      <div className="absolute right-0 top-[42%] z-10">
        <div className="rounded-l-md bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white">
          {(data?.price ?? 0).toFixed(3)}
        </div>
      </div>

      {/* Candlestick placeholder visualization */}
      <div className="absolute inset-0 flex items-end justify-center p-8 pb-12">
        <div className="flex items-end gap-[3px] h-[65%] w-full">
          {Array.from({ length: 60 }, (_, i) => {
            const h = 15 + Math.random() * 70;
            const green = Math.random() > 0.45;
            return (
              <div
                key={i}
                className="flex-1 rounded-sm min-w-[2px]"
                style={{
                  height: `${h}%`,
                  background: green
                    ? "rgba(16, 185, 129, 0.6)"
                    : "rgba(239, 68, 68, 0.5)",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Volume bars at bottom */}
      <div className="absolute bottom-6 left-8 right-16 flex items-end gap-[3px] h-10">
        {Array.from({ length: 60 }, (_, i) => {
          const h = 5 + Math.random() * 95;
          return (
            <div
              key={i}
              className="flex-1 rounded-sm min-w-[2px]"
              style={{
                height: `${h}%`,
                background: "rgba(99, 102, 241, 0.25)",
              }}
            />
          );
        })}
      </div>

      {/* Time axis */}
      <div className="absolute bottom-1 left-8 right-16 flex justify-between text-[9px] text-white/20">
        <span>15:30</span>
        <span>15:50</span>
        <span>16:00</span>
        <span>16:50</span>
        <span>11:00</span>
        <span>11:00</span>
        <span>15s</span>
      </div>

      {/* Overlay toggles at bottom of chart */}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1 text-[9px]">
        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-white/30">EMA</span>
        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-amber-400/60">VWAP</span>
        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-white/30">Levels</span>
        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-white/30">Volume</span>
      </div>
    </div>
  );
}
