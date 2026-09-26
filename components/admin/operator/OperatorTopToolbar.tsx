"use client";

import StatusPill from "../shared/StatusPill";

const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"] as const;
// Values are the API's market names: "EQUITY" used to be sent, which /api/admin/scanner/live read as CRYPTO and
// /api/admin/scan rejected, so the Equity workspace never showed equities.
const MARKETS = [
  { value: "EQUITIES", label: "EQUITY" },
  { value: "CRYPTO", label: "CRYPTO" },
] as const;

export default function OperatorTopToolbar({
  timeframe,
  market,
  onTimeframeChange,
  onMarketChange,
  onRescan,
  onKillSwitch,
  scanning,
  killActive,
  cryptoEnabled = true,
}: {
  timeframe: string;
  market: string;
  onTimeframeChange: (tf: string) => void;
  onMarketChange: (m: string) => void;
  onRescan: () => void;
  onKillSwitch?: () => void;
  scanning?: boolean;
  killActive?: boolean;
  /** false when admin crypto is switched off (ADMIN_CRYPTO_ENABLED=false): the crypto workspace is not live. */
  cryptoEnabled?: boolean;
}) {
  const cryptoPaused = market === "CRYPTO" && !cryptoEnabled;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#101826] px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill
          label={cryptoPaused ? "Crypto switched off" : scanning ? "Scanning…" : "Auto-Scan Live"}
          tone={cryptoPaused ? "yellow" : "green"}
        />
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
              key={m.value}
              onClick={() => onMarketChange(m.value)}
              title={m.value === "CRYPTO" && !cryptoEnabled ? "Admin crypto is switched off (ADMIN_CRYPTO_ENABLED=false)" : undefined}
              className={`px-2.5 py-1 text-xs transition ${
                market === m.value
                  ? "bg-blue-500/20 text-blue-300 font-medium"
                  : "text-white/40 hover:text-white/60 hover:bg-white/[0.03]"
              }`}
            >
              {m.label}
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
        <button className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 transition"
          onClick={onKillSwitch}
          style={killActive ? { background: "rgba(239,68,68,0.3)", borderColor: "rgba(239,68,68,0.5)" } : {}}
        >
          {killActive ? "⏸ Alerts Paused" : "Pause Alerts"}
        </button>
      </div>
    </div>
  );
}
