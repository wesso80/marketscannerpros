"use client";

import DataTruthBadge from "@/components/admin/shared/DataTruthBadge";
import type { DataTruth } from "@/lib/engines/dataTruth";
import type { InternalResearchScore, SetupDefinition } from "@/lib/admin/adminTypes";
import type { BiasState } from "@/lib/admin/types";

const lifecycleColors: Record<string, string> = {
  READY: "#10B981", FRESH: "#3B82F6", TRIGGERED: "#8B5CF6",
  DEVELOPING: "#FBBF24", EXHAUSTED: "#F97316", TRAPPED: "#F97316",
  INVALIDATED: "#EF4444", NO_EDGE: "#EF4444", DATA_DEGRADED: "#6B7280",
};

function biasColor(b: string): string {
  if (b === "LONG") return "#10B981";
  if (b === "SHORT") return "#EF4444";
  return "#9CA3AF";
}

/**
 * AdminResearchVerdictPanel — top-of-page summary for the new symbol
 * research terminal. Read-only research surface; no execution CTAs.
 */
export default function AdminResearchVerdictPanel({
  symbol, timeframe, market, bias, setup, score, dataTruth,
}: {
  symbol: string;
  timeframe: string;
  market: string;
  bias: BiasState;
  setup: SetupDefinition;
  score: InternalResearchScore;
  dataTruth: DataTruth;
}) {
  const lifecycleColor = lifecycleColors[score.lifecycle] ?? "#9CA3AF";
  const scoreColor = score.score >= 70 ? "#10B981" : score.score >= 50 ? "#FBBF24" : "#9CA3AF";

  return (
    <div style={{
      background: "rgba(17,24,39,0.6)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "0.75rem", padding: "1rem 1.25rem",
      display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "1.25rem", alignItems: "center",
    }}>
      <div>
        <div style={{ fontSize: "0.65rem", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {market} · {timeframe}
        </div>
        <div style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "0.02em" }}>{symbol}</div>
        <div style={{ marginTop: 4, fontSize: "0.8rem", color: biasColor(bias), fontWeight: 700 }}>
          {bias} · {setup.label}
        </div>
        <div style={{ fontSize: "0.7rem", color: "#9CA3AF", marginTop: 2, maxWidth: 320 }}>
          {setup.description}
        </div>
      </div>

      <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center" }}>
        <Stat label="Research Score" value={`${score.score}/100`} color={scoreColor} />
        <Stat label="Lifecycle" value={score.lifecycle} color={lifecycleColor} />
        <Stat label="Dominant Axis" value={score.dominantAxis ?? "—"} color="#9CA3AF" />
        <Stat label="Raw (uncapped)" value={`${score.rawScore}`} color="#6B7280" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <DataTruthBadge truth={dataTruth} size="md" />
        <span style={{ fontSize: "0.65rem", color: "#6B7280" }}>
          Trust {dataTruth.trustScore}/100 · {dataTruth.ageSec}s old
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "0.6rem", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.1rem", fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}
