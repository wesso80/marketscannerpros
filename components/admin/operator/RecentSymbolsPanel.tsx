"use client";

export default function RecentSymbolsPanel() {
  const symbols = ["ADA", "BTC-USD 🔐", "SPY", "TSLA", "SUI"];
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-white/50 uppercase tracking-wider">Recent Symbols</div>
      <div className="flex flex-wrap gap-1.5">
        {symbols.map((s) => (
          <span
            key={s}
            className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-xs text-white/60 cursor-pointer hover:bg-white/[0.06] hover:text-white/90 transition"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
