"use client";

import { retailSetupStrength, RETAIL_COLORS } from "@/lib/displayMode";

interface SetupStrengthMeterProps {
  /** 0–100 continuation probability */
  probability?: number;
  /** e.g. "+1.8%" */
  typicalDayMove?: string;
  /** e.g. "-1.1%" */
  typicalRisk?: string;
}

/**
 * Visual horizontal strength meter.
 * Weak → Moderate → Strong → High Conviction
 */
export default function SetupStrengthMeter({
  probability,
  typicalDayMove,
  typicalRisk,
}: SetupStrengthMeterProps) {
  const s = retailSetupStrength(probability);
  const fillPct = Math.max(5, Math.min(100, s.pct));

  const barColor =
    s.level === "high-conviction"
      ? "bg-emerald-400"
      : s.level === "strong"
      ? "bg-emerald-500"
      : s.level === "moderate"
      ? "bg-amber-400"
      : "bg-red-400";

  const labelColor =
    s.level === "high-conviction" || s.level === "strong"
      ? RETAIL_COLORS.green
      : s.level === "moderate"
      ? RETAIL_COLORS.yellow
      : RETAIL_COLORS.red;

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
      <h3 className="text-sm uppercase tracking-wider text-slate-400 font-medium mb-4">
        Setup Strength
      </h3>

      {/* Labels above bar */}
      <div className="flex justify-between text-xs text-slate-500 mb-1.5">
        <span>Weak</span>
        <span>Moderate</span>
        <span>Strong</span>
        <span>High Conviction</span>
      </div>

      {/* Bar */}
      <div className="relative h-4 bg-slate-700/60 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${fillPct}%` }}
        />
        {/* Notch markers at 25%, 50%, 75% */}
        <div className="absolute inset-0 flex">
          <div className="w-1/4 border-r border-slate-600/40" />
          <div className="w-1/4 border-r border-slate-600/40" />
          <div className="w-1/4 border-r border-slate-600/40" />
          <div className="w-1/4" />
        </div>
      </div>

      {/* Current Badge */}
      <div className="flex items-center justify-center mt-3">
        <span
          className={`${labelColor.bg} ${labelColor.border} border rounded-lg px-3 py-1 text-sm font-bold ${labelColor.text}`}
        >
          {s.label}
        </span>
      </div>

      {/* Stats underneath */}
      {(probability != null || typicalDayMove || typicalRisk) && (
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-700/40">
          {probability != null && (
            <StatPill label="Historical Probability" value={`${probability}% continuation`} />
          )}
          {typicalDayMove && (
            <StatPill label="Typical 1-Day Move" value={typicalDayMove} />
          )}
          {typicalRisk && (
            <StatPill label="Typical Risk" value={typicalRisk} />
          )}
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm font-medium text-slate-200 mt-0.5">{value}</div>
    </div>
  );
}
