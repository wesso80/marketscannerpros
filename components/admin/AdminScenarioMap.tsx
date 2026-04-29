"use client";

import type { AdminSymbolIntelligence } from "@/lib/admin/types";
import type { SetupDefinition } from "@/lib/admin/adminTypes";

/**
 * AdminScenarioMap — bullish / bearish / neutral / invalidation
 * conditions derived from the snapshot's structural levels and setup.
 *
 * Research framing only — no entry orders, no sizing, no execution.
 */
export default function AdminScenarioMap({
  snapshot, setup,
}: {
  snapshot: AdminSymbolIntelligence;
  setup: SetupDefinition;
}) {
  const lvl = snapshot.levels;
  const t = snapshot.targets;
  const fmt = (n: number | null | undefined): string => {
    if (n == null || !Number.isFinite(n) || n === 0) return "—";
    return n.toFixed(n < 1 ? 5 : 2);
  };

  const scenarios: { label: string; color: string; condition: string; outcome: string }[] = [
    {
      label: "Bullish",
      color: "#10B981",
      condition: `Reclaim and hold above ${fmt(lvl?.pdh)} (PDH) with rising RVOL`,
      outcome: `Research target ${fmt(t?.target1)} → ${fmt(t?.target2)}`,
    },
    {
      label: "Bearish",
      color: "#EF4444",
      condition: `Loss of ${fmt(lvl?.pdl)} (PDL) with momentum continuation`,
      outcome: `Research target ${fmt(lvl?.weeklyLow)} (weekly low)`,
    },
    {
      label: "Neutral",
      color: "#9CA3AF",
      condition: `Range between ${fmt(lvl?.pdl)} and ${fmt(lvl?.pdh)} with low ADX`,
      outcome: `Wait — no edge, monitor ${setup.label} development`,
    },
    {
      label: "Invalidation",
      color: "#F59E0B",
      condition: `Close beyond ${fmt(t?.invalidation)} against thesis`,
      outcome: `Mark setup INVALIDATED, re-evaluate after next session`,
    },
  ];

  return (
    <div style={{
      background: "rgba(17,24,39,0.6)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "0.75rem", padding: "1rem 1.25rem",
    }}>
      <div style={{
        fontSize: "0.7rem", color: "#9CA3AF", textTransform: "uppercase",
        letterSpacing: "0.06em", marginBottom: "0.75rem", fontWeight: 700,
      }}>
        Scenario Map
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
        {scenarios.map((s) => (
          <div key={s.label} style={{
            padding: "0.65rem 0.8rem",
            background: `${s.color}10`, border: `1px solid ${s.color}30`, borderRadius: "0.5rem",
          }}>
            <div style={{ fontSize: "0.65rem", color: s.color, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {s.label}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#E5E7EB", marginTop: 4, lineHeight: 1.4 }}>
              <strong style={{ color: "#9CA3AF", fontWeight: 600 }}>If: </strong>{s.condition}
            </div>
            <div style={{ fontSize: "0.7rem", color: "#9CA3AF", marginTop: 4, lineHeight: 1.4 }}>
              <strong style={{ color: "#6B7280", fontWeight: 600 }}>Then: </strong>{s.outcome}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
