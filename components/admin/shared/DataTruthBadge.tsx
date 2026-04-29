"use client";

import { dataTruthColor, dataTruthLabel, type DataTruth } from "@/lib/engines/dataTruth";

/**
 * DataTruthBadge — small chip that surfaces the centralized DataTruth
 * verdict on any admin research card. Mount this anywhere a card renders
 * scanner/indicator data so the operator can see at a glance whether a
 * verdict is trustworthy.
 *
 * The badge is intentionally compact; hover the title attribute for the
 * full notes payload.
 */
export default function DataTruthBadge({
  truth,
  size = "sm",
  className,
}: {
  truth: DataTruth;
  size?: "sm" | "md";
  className?: string;
}) {
  const color = dataTruthColor(truth.status);
  const label = dataTruthLabel(truth.status);
  const padding = size === "md" ? "0.25rem 0.55rem" : "0.15rem 0.4rem";
  const fontSize = size === "md" ? "0.7rem" : "0.6rem";
  const title = [
    `${label} · trust ${truth.trustScore}/100 · ${truth.ageSec}s old`,
    `Live ≤ ${truth.thresholds.liveSec}s · Stale > ${truth.thresholds.staleSec}s`,
    ...truth.notes,
  ].join("\n");

  return (
    <span
      className={className}
      title={title}
      role="status"
      aria-label={`Data truth: ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        padding,
        borderRadius: 999,
        background: `${color}1A`,
        border: `1px solid ${color}55`,
        color,
        fontSize,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
          boxShadow: `0 0 6px ${color}`,
        }}
      />
      {label}
      <span style={{ opacity: 0.7, fontWeight: 600 }}>· {truth.trustScore}</span>
    </span>
  );
}
