"use client";

import type { ResearchScoreAxes } from "@/lib/admin/adminTypes";

const AXIS_LABELS: Record<keyof ResearchScoreAxes, string> = {
  trend: "Trend",
  momentum: "Momentum",
  volatility: "Volatility",
  time: "Time Confluence",
  options: "Options Context",
  liquidity: "Liquidity / Structure",
  macro: "Macro / Event Safety",
  sentiment: "Symbol Trust / Sentiment",
  fundamentals: "Model Health / Fundamentals",
};

function axisColor(v: number): string {
  if (v >= 70) return "#10B981";
  if (v >= 50) return "#FBBF24";
  if (v >= 30) return "#F59E0B";
  return "#EF4444";
}

/**
 * AdminEvidenceStack — 9-axis horizontal bar chart consuming the
 * centralized score's per-axis sub-scores.
 */
export default function AdminEvidenceStack({
  axes, dominant,
}: {
  axes: ResearchScoreAxes;
  dominant?: keyof ResearchScoreAxes | null;
}) {
  const entries = Object.entries(axes) as [keyof ResearchScoreAxes, number][];

  return (
    <div style={{
      background: "rgba(17,24,39,0.6)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "0.75rem", padding: "1rem 1.25rem",
    }}>
      <div style={{
        fontSize: "0.7rem", color: "#9CA3AF", textTransform: "uppercase",
        letterSpacing: "0.06em", marginBottom: "0.75rem", fontWeight: 700,
      }}>
        Evidence Stack — 9 Axes
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {entries.map(([key, value]) => {
          const isDominant = key === dominant;
          const color = axisColor(value);
          return (
            <div key={key} style={{ display: "grid", gridTemplateColumns: "180px 1fr 40px", gap: 12, alignItems: "center" }}>
              <div style={{
                fontSize: "0.75rem", color: isDominant ? "#E5E7EB" : "#9CA3AF",
                fontWeight: isDominant ? 700 : 500,
              }}>
                {AXIS_LABELS[key]}{isDominant && <span style={{ color: "#FBBF24", marginLeft: 4 }}>★</span>}
              </div>
              <div style={{
                position: "relative", height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4,
              }}>
                <div style={{
                  width: `${Math.max(2, value)}%`, height: "100%", background: color, borderRadius: 4,
                  transition: "width 0.2s",
                }} />
              </div>
              <div style={{ textAlign: "right", fontSize: "0.75rem", fontWeight: 700, color }}>{value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
