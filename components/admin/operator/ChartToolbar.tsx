"use client";

import { useState } from "react";

const OVERLAYS = [
  { key: "ema", label: "EMA", default: true },
  { key: "levels", label: "Levels", default: true },
  { key: "volume", label: "Volume", default: true },
] as const;

export default function ChartToolbar({
  timeframe = "15m",
  onTimeframeChange,
}: {
  timeframe?: string;
  onTimeframeChange?: (tf: string) => void;
}) {
  const timeframes = ["1m", "5m", "15m", "1h", "4h", "1D"];
  const [overlays, setOverlays] = useState<Record<string, boolean>>({
    ema: true,
    levels: true,
    volume: true,
  });

  function toggleOverlay(key: string) {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {/* Timeframe selector */}
      <div className="flex items-center gap-1">
        {timeframes.map((tf) => (
          <button
            key={tf}
            onClick={() => onTimeframeChange?.(tf === "1D" ? "1d" : tf)}
            className={`rounded border px-2 py-1 transition ${
              (timeframe === tf || (timeframe === "1d" && tf === "1D"))
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:bg-white/[0.04]"
            }`}
          >
            {tf}
          </button>
        ))}
      </div>
      <div className="h-4 w-px bg-white/10 mx-1" />
      {/* Overlay toggles */}
      <div className="flex items-center gap-1">
        {OVERLAYS.map((o) => (
          <button
            key={o.key}
            onClick={() => toggleOverlay(o.key)}
            className={`rounded border px-2 py-1 transition ${
              overlays[o.key]
                ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                : "border-white/[0.06] bg-white/[0.02] text-white/30"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {/* Fullscreen toggle */}
      <div className="ml-auto">
        <button className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-white/50 hover:bg-white/[0.04] transition">⛶</button>
      </div>
    </div>
  );
}
