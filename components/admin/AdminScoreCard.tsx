"use client";

/**
 * AdminScoreCard
 *
 * Renders the three admin scores (Opportunity / Evidence Quality /
 * Personal Exposure) as separate, side-by-side panels.
 *
 * Hard rule (see lib/admin/scoring.ts and .claude/ADMIN_RULES.md):
 *   These three scores MUST remain visually and structurally separate.
 *   Do NOT combine them into a single composite. Personal exposure is
 *   display-only outside risk-desk mode (see lib/admin/modes.ts).
 */

import type { ScoreBundle } from "@/lib/admin";
import { usePortfolioAsBlocker, type AdminMode } from "@/lib/admin";

type Props = {
  bundle: ScoreBundle;
  mode: AdminMode;
};

function scoreColor(value: number) {
  if (value >= 75) return "#10B981";
  if (value >= 50) return "#F59E0B";
  return "#EF4444";
}

function exposureColor(flag: ScoreBundle["exposure"]["flag"]) {
  switch (flag) {
    case "high":
      return "#EF4444";
    case "elevated":
      return "#F59E0B";
    case "low":
      return "#10B981";
    case "none":
    default:
      return "#64748B";
  }
}

const cardStyle: React.CSSProperties = {
  background: "rgba(17, 24, 39, 0.85)",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: "0.75rem",
  padding: "1rem 1.1rem",
  flex: 1,
  minWidth: 220,
};

const labelStyle: React.CSSProperties = {
  color: "#64748B",
  fontSize: "0.7rem",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  fontWeight: 800,
  marginBottom: "0.4rem",
};

const valueStyle: React.CSSProperties = {
  fontSize: "2.1rem",
  fontWeight: 800,
  lineHeight: 1.1,
};

const listStyle: React.CSSProperties = {
  margin: "0.6rem 0 0",
  padding: 0,
  listStyle: "none",
  color: "#CBD5E1",
  fontSize: "0.78rem",
  lineHeight: 1.45,
};

export default function AdminScoreCard({ bundle, mode }: Props) {
  const exposureActive = usePortfolioAsBlocker(mode);
  const exposureValueText =
    bundle.exposure.value == null ? "—" : `${Math.round(bundle.exposure.value)}`;

  return (
    <div
      style={{
        display: "flex",
        gap: "0.85rem",
        flexWrap: "wrap",
        alignItems: "stretch",
      }}
      role="group"
      aria-label="Admin three-score panel"
    >
      {/* Opportunity */}
      <section style={cardStyle} aria-label="Opportunity score">
        <div style={labelStyle}>Opportunity</div>
        <div style={{ ...valueStyle, color: scoreColor(bundle.opportunity.value) }}>
          {Math.round(bundle.opportunity.value)}
          <span style={{ fontSize: "1rem", color: "#64748B", marginLeft: 6 }}>/ 100</span>
        </div>
        {bundle.opportunity.drivers.length > 0 && (
          <ul style={listStyle}>
            {bundle.opportunity.drivers.slice(0, 3).map((d, i) => (
              <li key={i}>• {d}</li>
            ))}
          </ul>
        )}
        {bundle.opportunity.confirms.length > 0 && (
          <div style={{ marginTop: "0.55rem", fontSize: "0.72rem", color: "#10B981" }}>
            Confirms: {bundle.opportunity.confirms.slice(0, 2).join("; ")}
          </div>
        )}
        {bundle.opportunity.invalidates.length > 0 && (
          <div style={{ marginTop: "0.25rem", fontSize: "0.72rem", color: "#F87171" }}>
            Invalidates: {bundle.opportunity.invalidates.slice(0, 2).join("; ")}
          </div>
        )}
      </section>

      {/* Evidence Quality */}
      <section style={cardStyle} aria-label="Evidence quality score">
        <div style={labelStyle}>Evidence Quality</div>
        <div style={{ ...valueStyle, color: scoreColor(bundle.evidence.value) }}>
          {Math.round(bundle.evidence.value)}
          <span style={{ fontSize: "1rem", color: "#64748B", marginLeft: 6 }}>/ 100</span>
        </div>
        <div style={{ marginTop: "0.5rem", fontSize: "0.74rem", color: "#94A3B8" }}>
          Sources: {bundle.evidence.sources.length ? bundle.evidence.sources.join(", ") : "—"}
        </div>
        {(bundle.evidence.stale || bundle.evidence.simulated) && (
          <div style={{ marginTop: "0.4rem", fontSize: "0.72rem", color: "#F59E0B" }}>
            {bundle.evidence.stale ? "STALE " : ""}
            {bundle.evidence.simulated ? "SIMULATED" : ""}
          </div>
        )}
        {bundle.evidence.missingFields.length > 0 && (
          <div style={{ marginTop: "0.35rem", fontSize: "0.72rem", color: "#F87171" }}>
            Missing: {bundle.evidence.missingFields.slice(0, 4).join(", ")}
            {bundle.evidence.missingFields.length > 4 ? "…" : ""}
          </div>
        )}
      </section>

      {/* Personal Exposure */}
      <section style={cardStyle} aria-label="Personal exposure context">
        <div style={{ ...labelStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Personal Exposure</span>
          <span
            style={{
              fontSize: "0.6rem",
              color: exposureActive ? "#F59E0B" : "#64748B",
              border: `1px solid ${exposureActive ? "#F59E0B" : "#475569"}`,
              padding: "0.1rem 0.4rem",
              borderRadius: 4,
              letterSpacing: "0.1em",
            }}
            title={
              exposureActive
                ? "Risk-desk mode: exposure may gate execution decisions."
                : "Display only — does not block, hide, or downgrade opportunities in this mode."
            }
          >
            {exposureActive ? "ACTIVE" : "DISPLAY"}
          </span>
        </div>
        <div style={{ ...valueStyle, color: exposureColor(bundle.exposure.flag) }}>
          {exposureValueText}
          {bundle.exposure.value != null && (
            <span style={{ fontSize: "1rem", color: "#64748B", marginLeft: 6 }}>/ 100</span>
          )}
        </div>
        <div style={{ marginTop: "0.45rem", fontSize: "0.74rem", color: exposureColor(bundle.exposure.flag), textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
          {bundle.exposure.flag}
        </div>
        {bundle.exposure.notes.length > 0 && (
          <ul style={listStyle}>
            {bundle.exposure.notes.slice(0, 2).map((n, i) => (
              <li key={i}>• {n}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
