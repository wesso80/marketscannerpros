import React from "react";

type BadgeStatus = "good" | "warn" | "bad" | "neutral";

interface DataHealthItem {
  label: string;
  value: string;
  status?: BadgeStatus;
}

interface SetupConfidenceCardProps {
  confidence: number;
  reasons: string[];
  blockers?: string[];
  title?: string;
}

interface DataHealthBadgesProps {
  items: DataHealthItem[];
  updatedAtText?: string;
}

function statusStyles(status: BadgeStatus) {
  if (status === "good") {
    return {
      background: "rgba(16,185,129,0.15)",
      border: "1px solid rgba(16,185,129,0.35)",
      color: "#34D399",
    };
  }
  if (status === "warn") {
    return {
      background: "rgba(245,158,11,0.15)",
      border: "1px solid rgba(245,158,11,0.35)",
      color: "#FBBF24",
    };
  }
  if (status === "bad") {
    return {
      background: "rgba(239,68,68,0.15)",
      border: "1px solid rgba(239,68,68,0.35)",
      color: "#F87171",
    };
  }
  return {
    background: "rgba(100,116,139,0.2)",
    border: "1px solid rgba(100,116,139,0.35)",
    color: "#CBD5E1",
  };
}

function confidenceGrade(confidence: number): string {
  if (confidence >= 85) return "A+";
  if (confidence >= 75) return "A";
  if (confidence >= 65) return "B";
  if (confidence >= 55) return "C";
  return "D";
}

export function SetupConfidenceCard({
  confidence,
  reasons,
  blockers = [],
  title = "Setup Confidence",
}: SetupConfidenceCardProps) {
  const normalized = Math.max(1, Math.min(99, Math.round(confidence)));
  const grade = confidenceGrade(normalized);

  return (
    <div
      style={{
        background: "var(--msp-card)",
        border: "1px solid var(--msp-border)",
        borderRadius: "14px",
        padding: "1rem",
        marginBottom: "1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: "0.8rem", color: "var(--msp-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
          {title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ color: "#E2E8F0", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Grade</span>
          <span
            style={{
              background: "rgba(20,184,166,0.14)",
              border: "1px solid rgba(20,184,166,0.3)",
              borderRadius: "999px",
              padding: "0.2rem 0.55rem",
              color: "var(--msp-accent)",
              fontWeight: 700,
              fontSize: "0.8rem",
            }}
          >
            {grade}
          </span>
          <span style={{ color: "#F8FAFC", fontSize: "1.25rem", fontWeight: 800 }}>{normalized}%</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.75rem" }}>
        <div>
          <div style={{ fontSize: "0.72rem", color: "#64748B", textTransform: "uppercase", marginBottom: "0.45rem" }}>
            Why this setup
          </div>
          <div style={{ display: "grid", gap: "0.35rem" }}>
            {reasons.slice(0, 4).map((reason, idx) => (
              <div key={idx} style={{ color: "#34D399", fontSize: "0.82rem" }}>✔ {reason}</div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "0.72rem", color: "#64748B", textTransform: "uppercase", marginBottom: "0.45rem" }}>
            Caution flags
          </div>
          <div style={{ display: "grid", gap: "0.35rem" }}>
            {blockers.length > 0 ? (
              blockers.slice(0, 4).map((flag, idx) => (
                <div key={idx} style={{ color: "#FBBF24", fontSize: "0.82rem" }}>⚠ {flag}</div>
              ))
            ) : (
              <div style={{ color: "#94A3B8", fontSize: "0.82rem" }}>No major blockers flagged.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DataHealthBadges({ items, updatedAtText }: DataHealthBadgesProps) {
  return (
    <div
      style={{
        background: "rgba(15,23,42,0.6)",
        border: "1px solid rgba(51,65,85,0.8)",
        borderRadius: "12px",
        padding: "0.85rem 0.9rem",
        marginBottom: "1rem",
      }}
    >
      <div style={{ fontSize: "0.72rem", color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.55rem" }}>
        Data Health
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {items.map((item, idx) => {
          const style = statusStyles(item.status ?? "neutral");
          return (
            <span
              key={`${item.label}-${idx}`}
              style={{
                ...style,
                borderRadius: "999px",
                padding: "0.3rem 0.65rem",
                fontSize: "0.76rem",
                fontWeight: 600,
              }}
            >
              {item.label}: {item.value}
            </span>
          );
        })}
      </div>
      {updatedAtText && (
        <div style={{ marginTop: "0.55rem", fontSize: "0.72rem", color: "#94A3B8" }}>
          Updated: {updatedAtText}
        </div>
      )}
    </div>
  );
}
