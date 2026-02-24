"use client";

import {
  retailRegime,
  retailVolState,
  retailSession,
  RETAIL_COLORS,
} from "@/lib/displayMode";

interface PulseItem {
  label: string;
  value: string;
  color: "green" | "yellow" | "red" | "purple" | "blue";
  icon: string;
}

interface MarketPulseBarProps {
  regime?: string;
  volState?: string;
  riskMode?: string;
  session?: string;
}

/**
 * Market Pulse Bar — top strip across the Retail dashboard.
 * 4 cards: Market Mood · Volatility · Risk Level · Session
 */
export default function MarketPulseBar({
  regime,
  volState,
  riskMode,
  session,
}: MarketPulseBarProps) {
  const reg = retailRegime(regime);
  const vol = retailVolState(volState);
  const sess = retailSession(session);

  const riskColor =
    riskMode === "LOCKED"
      ? "red"
      : riskMode === "CAUTION"
      ? "yellow"
      : "green";

  const riskLabel =
    riskMode === "LOCKED"
      ? "High Risk"
      : riskMode === "CAUTION"
      ? "Elevated"
      : "Normal";

  const items: PulseItem[] = [
    { label: "Market Mood", value: reg.label, color: reg.color, icon: reg.color === "green" ? "📈" : reg.color === "red" ? "📉" : "📊" },
    { label: "Volatility", value: vol.label, color: vol.color, icon: "🌊" },
    { label: "Risk Level", value: riskLabel, color: riskColor, icon: riskColor === "red" ? "🛑" : riskColor === "yellow" ? "⚠️" : "🟢" },
    { label: "Session", value: sess.label, color: sess.color, icon: "🕐" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((item) => {
        const c = RETAIL_COLORS[item.color];
        return (
          <div
            key={item.label}
            className={`${c.bg} ${c.border} border rounded-xl px-4 py-3 flex items-center gap-3`}
          >
            <span className="text-2xl">{item.icon}</span>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                {item.label}
              </div>
              <div className={`text-lg font-bold ${c.text}`}>
                {item.value}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
