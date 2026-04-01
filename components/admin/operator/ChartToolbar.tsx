"use client";

export default function ChartToolbar() {
  const timeframes = ["1m", "5m", "15m", "1h", "4h", "1D"];
  const tools = ["Trend", "Reks", "Cone", "Indiatr", "Time Swiners"];

  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <div className="flex items-center gap-1 mr-2">
        {tools.map((t) => (
          <button
            key={t}
            className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-white/50 hover:bg-white/[0.04] hover:text-white/70 transition"
          >
            {t}
          </button>
        ))}
      </div>
      <div className="h-4 w-px bg-white/10 mx-1" />
      <div className="flex items-center gap-1">
        {timeframes.map((tf) => (
          <button
            key={tf}
            className={`rounded border px-2 py-1 transition ${
              tf === "15m"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:bg-white/[0.04]"
            }`}
          >
            {tf}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-white/50 hover:bg-white/[0.04] transition">📊</button>
        <button className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-white/50 hover:bg-white/[0.04] transition">⊞</button>
        <button className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-white/50 hover:bg-white/[0.04] transition">⊕</button>
        <button className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-white/50 hover:bg-white/[0.04] transition">⚙️</button>
      </div>
    </div>
  );
}
