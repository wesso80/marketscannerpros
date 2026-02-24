"use client";

import { RETAIL_COLORS } from "@/lib/displayMode";

export interface EventItem {
  title: string;
  /** "green" = low, "yellow" = caution, "red" = high impact, "purple" = event risk */
  severity: "green" | "yellow" | "red" | "purple";
  icon?: string;
  detail?: string;
}

interface RetailEventRiskPanelProps {
  events: EventItem[];
  loading?: boolean;
}

/**
 * Event & News Risk Panel — color-coded event warnings.
 * Retail users need protection from surprise.
 */
export default function RetailEventRiskPanel({
  events,
  loading,
}: RetailEventRiskPanelProps) {
  if (loading) {
    return (
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 animate-pulse h-36" />
    );
  }

  const hasHighImpact = events.some((e) => e.severity === "red");

  return (
    <div
      className={`border rounded-2xl p-5 ${
        hasHighImpact
          ? "bg-red-500/5 border-red-500/30"
          : "bg-slate-800/60 border-slate-700/50"
      }`}
    >
      <h3 className="text-sm uppercase tracking-wider text-slate-400 font-medium mb-3 flex items-center gap-2">
        📰 Event & News Risk
        {hasHighImpact && (
          <span className="bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] px-2 py-0.5 rounded-md font-bold animate-pulse">
            HIGH IMPACT
          </span>
        )}
      </h3>

      {events.length === 0 ? (
        <div className="flex items-center gap-3 text-slate-300">
          <span className="text-2xl">🟢</span>
          <div>
            <div className="font-medium">No High-Impact Events Today</div>
            <div className="text-sm text-slate-400">Clear trading conditions</div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((evt, i) => {
            const c = RETAIL_COLORS[evt.severity];
            return (
              <div
                key={i}
                className={`${c.bg} ${c.border} border rounded-xl px-4 py-2.5 flex items-start gap-3`}
              >
                <span className="text-lg mt-0.5">{evt.icon || severityIcon(evt.severity)}</span>
                <div className="min-w-0">
                  <div className={`font-medium ${c.text} text-sm`}>{evt.title}</div>
                  {evt.detail && (
                    <div className="text-xs text-slate-400 mt-0.5">{evt.detail}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function severityIcon(severity: string): string {
  switch (severity) {
    case "red":
      return "🔴";
    case "yellow":
      return "🟡";
    case "purple":
      return "🟣";
    default:
      return "🟢";
  }
}
