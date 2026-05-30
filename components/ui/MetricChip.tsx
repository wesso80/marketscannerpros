"use client";
import React from "react";

export type MetricChipTone = "bull" | "bear" | "warn" | "info" | "accent" | "neutral";

export interface MetricChipProps {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: MetricChipTone;
  title?: string;
}

function toneColor(tone: MetricChipTone): string {
  switch (tone) {
    case "bull": return "var(--msp-bull)";
    case "bear": return "var(--msp-bear)";
    case "warn": return "var(--msp-warn)";
    case "info": return "var(--msp-info)";
    case "accent": return "var(--msp-accent)";
    default: return "var(--msp-text)";
  }
}

export default function MetricChip({ label, value, detail, tone = "neutral", title }: MetricChipProps) {
  return (
    <div
      style={{
        background: "var(--msp-card-2)",
        borderRadius: "var(--msp-radius-card)",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minHeight: "3.5rem",
      }}
    >
      <span style={{ fontSize: "var(--msp-text-label)", fontWeight: 500, color: "var(--msp-text-muted)" }}>{label}</span>
      <span
        style={{
          fontSize: "var(--msp-text-h2)",
          fontWeight: 500,
          color: toneColor(tone),
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.15,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={title || (typeof value === "string" ? value : undefined)}
      >
        {value}
      </span>
      {detail !== undefined && detail !== null && detail !== "" ? (
        <span
          style={{
            fontSize: 11,
            color: "var(--msp-text-faint)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={typeof detail === "string" ? detail : undefined}
        >
          {detail}
        </span>
      ) : null}
    </div>
  );
}
