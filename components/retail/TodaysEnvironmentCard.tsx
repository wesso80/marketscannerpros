"use client";

import { retailRegime, retailVolState, RETAIL_COLORS } from "@/lib/displayMode";

interface TodaysEnvironmentCardProps {
  regime?: string;
  volState?: string;
  majorEventsToday?: number;
  suggestedStrategy?: string;
}

/**
 * "Today's Trading Environment" — hero card on the Retail dashboard.
 * Big, prominent, instantly readable.
 */
export default function TodaysEnvironmentCard({
  regime,
  volState,
  majorEventsToday = 0,
  suggestedStrategy,
}: TodaysEnvironmentCardProps) {
  const reg = retailRegime(regime);
  const vol = retailVolState(volState);

  // Derive strategy suggestion from regime + vol
  const strategy =
    suggestedStrategy ||
    deriveStrategy(reg.label, vol.label);

  const eventColor = majorEventsToday >= 3 ? "red" : majorEventsToday >= 1 ? "yellow" : "green";

  return (
    <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-slate-700/60 rounded-2xl p-6 md:p-8">
      <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
        Today&apos;s Trading Environment
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Trend Strength */}
        <InfoRow
          icon="📈"
          label="Trend Strength"
          value={reg.label}
          desc={reg.description}
          color={reg.color}
        />

        {/* Volatility */}
        <InfoRow
          icon="🌊"
          label="Volatility"
          value={vol.label}
          desc={
            vol.label === "Low"
              ? "Quieter conditions — tighter ranges expected"
              : vol.label === "Elevated"
              ? "Wider stops needed — careful with size"
              : vol.label === "Extreme"
              ? "Very large moves happening — reduce exposure"
              : "Normal range activity"
          }
          color={vol.color}
        />

        {/* Events */}
        <InfoRow
          icon="⚠️"
          label="Major Events Today"
          value={String(majorEventsToday)}
          desc={
            majorEventsToday === 0
              ? "No high-impact events scheduled"
              : `${majorEventsToday} event${majorEventsToday > 1 ? "s" : ""} — check before entering`
          }
          color={eventColor}
        />

        {/* Suggested Strategy */}
        <InfoRow
          icon="💡"
          label="Best Strategy Type Today"
          value={strategy}
          desc="Based on current market conditions"
          color="blue"
        />
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  desc,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  desc: string;
  color: "green" | "yellow" | "red" | "blue" | "purple";
}) {
  const c = RETAIL_COLORS[color];
  return (
    <div className={`${c.bg} ${c.border} border rounded-xl p-4 flex items-start gap-3`}>
      <span className="text-2xl mt-0.5">{icon}</span>
      <div>
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">{label}</div>
        <div className={`text-xl font-bold ${c.text}`}>{value}</div>
        <div className="text-sm text-slate-300 mt-1">{desc}</div>
      </div>
    </div>
  );
}

function deriveStrategy(regime: string, vol: string): string {
  const r = regime.toLowerCase();
  const v = vol.toLowerCase();
  if (r.includes("trend") && v !== "extreme") return "Trend Continuation";
  if (r.includes("breakout")) return "Breakout Continuation";
  if (r.includes("sideways") && v === "low") return "Mean Reversion";
  if (v.includes("extreme")) return "Reduced Exposure";
  if (r.includes("sideways")) return "Range Trading";
  return "Pullback Continuation";
}
