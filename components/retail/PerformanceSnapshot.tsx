"use client";

import { RETAIL_COLORS } from "@/lib/displayMode";

interface PerformanceSnapshotProps {
  winRate?: number;
  avgRMultiple?: number;
  bestSetupType?: string;
  biggestLeak?: string;
  totalTrades?: number;
  loading?: boolean;
}

/**
 * Simple Performance Snapshot — retail-friendly journal summary.
 * "You perform best in Trend Pullback setups."
 * No raw math tables.
 */
export default function PerformanceSnapshot({
  winRate,
  avgRMultiple,
  bestSetupType,
  biggestLeak,
  totalTrades = 0,
  loading,
}: PerformanceSnapshotProps) {
  if (loading) {
    return (
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 animate-pulse h-36" />
    );
  }

  if (totalTrades < 3) {
    return (
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-6 text-center">
        <span className="text-3xl">📓</span>
        <p className="text-slate-300 font-medium mt-2">Start Your Trade Journal</p>
        <p className="text-slate-500 text-sm mt-1">
          Log at least 3 trades to see your performance insights
        </p>
      </div>
    );
  }

  const winColor =
    (winRate ?? 0) >= 60 ? "green" : (winRate ?? 0) >= 45 ? "yellow" : "red";
  const rColor =
    (avgRMultiple ?? 0) >= 1.5 ? "green" : (avgRMultiple ?? 0) >= 0.8 ? "yellow" : "red";

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
      <h3 className="text-sm uppercase tracking-wider text-slate-400 font-medium mb-4 flex items-center gap-2">
        📊 Your Performance
        <span className="text-slate-500 normal-case tracking-normal">
          (Last {totalTrades} trades)
        </span>
      </h3>

      <div className="grid grid-cols-2 gap-4">
        {/* Win Rate */}
        <MetricCard
          label="Win Rate"
          value={winRate != null ? `${winRate.toFixed(0)}%` : "—"}
          color={winColor}
          icon="🎯"
        />

        {/* Avg R */}
        <MetricCard
          label="Avg R Multiple"
          value={avgRMultiple != null ? `${avgRMultiple.toFixed(2)}R` : "—"}
          color={rColor}
          icon="📈"
        />
      </div>

      {/* Insights */}
      <div className="mt-4 pt-4 border-t border-slate-700/40 flex flex-col gap-2">
        {bestSetupType && (
          <InsightRow
            icon="🏆"
            text={`You perform best in ${bestSetupType} setups.`}
            color="green"
          />
        )}
        {biggestLeak && (
          <InsightRow
            icon="⚠️"
            text={`Biggest leak: ${biggestLeak}`}
            color="yellow"
          />
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: "green" | "yellow" | "red";
  icon: string;
}) {
  const c = RETAIL_COLORS[color];
  return (
    <div className={`${c.bg} ${c.border} border rounded-xl p-4 text-center`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className={`text-2xl font-bold ${c.text}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}

function InsightRow({
  icon,
  text,
  color,
}: {
  icon: string;
  text: string;
  color: "green" | "yellow" | "red";
}) {
  const c = RETAIL_COLORS[color];
  return (
    <div className={`flex items-center gap-2 text-sm ${c.text}`}>
      <span>{icon}</span>
      <span className="text-slate-300">{text}</span>
    </div>
  );
}
