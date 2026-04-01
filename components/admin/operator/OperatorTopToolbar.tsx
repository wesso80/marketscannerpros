"use client";

import StatusPill from "../shared/StatusPill";

const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"] as const;
const MARKETS = ["CRYPTO", "EQUITY"] as const;

export default function OperatorTopToolbar({
  timeframe,
  market,
  onTimeframeChange,
  onMarketChange,
  onRescan,
  scanning,
}: {
  timeframe: string;
  market: string;
  onTimeframeChange: (tf: string) => void;
  onMarketChange: (m: string) => void;
  onRescan: () => void;
  scanning?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#101826] px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill label={scanning ? "Scanning…" : "Auto-Scan Live"} tone="green" />
        {/* Timeframe selector */}
        <div className="flex rounded-lg border border-white/10 overflow-hidden">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-2.5 py-1 text-xs transition ${
                timeframe === tf
                  ? "bg-emerald-500/20 text-emerald-300 font-medium"
                  : "text-white/40 hover:text-white/60 hover:bg-white/[0.03]"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        {/* Market selector */}
        <div className="flex rounded-lg border border-white/10 overflow-hidden">
          {MARKETS.map((m) => (
            <button
              key={m}
              onClick={() => onMarketChange(m)}
              className={`px-2.5 py-1 text-xs transition ${
                market === m
                  ? "bg-blue-500/20 text-blue-300 font-medium"
                  : "text-white/40 hover:text-white/60 hover:bg-white/[0.03]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onRescan}
          disabled={scanning}
          className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition disabled:opacity-40"
        >
          {scanning ? "Scanning…" : "↻ Rescan"}
        </button>
        <button className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 transition">
          Kill Switch
        </button>
      </div>
    </div>
  );
}
