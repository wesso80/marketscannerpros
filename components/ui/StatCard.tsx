import React from "react";

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  delta?: React.ReactNode;
  deltaTone?: "bull" | "bear" | "flat" | "auto";
  /** When deltaTone="auto", pass the raw numeric delta to infer sign. */
  deltaValue?: number;
}

function toneColor(tone: "bull" | "bear" | "flat"): string {
  if (tone === "bull") return "var(--msp-bull)";
  if (tone === "bear") return "var(--msp-bear)";
  return "var(--msp-flat)";
}

function inferTone(n: number | undefined): "bull" | "bear" | "flat" {
  if (n === undefined || !Number.isFinite(n) || n === 0) return "flat";
  return n > 0 ? "bull" : "bear";
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(function StatCard(
  { label, value, delta, deltaTone = "auto", deltaValue, style, ...rest },
  ref
) {
  const tone = deltaTone === "auto" ? inferTone(deltaValue) : deltaTone;
  const wrap: React.CSSProperties = {
    background: "var(--msp-panel)",
    borderRadius: "var(--msp-radius-card)",
    padding: "var(--msp-panel-padding)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    ...style,
  };
  return (
    <div ref={ref} style={wrap} {...rest}>
      <span
        style={{
          fontSize: "var(--msp-text-label)",
          fontWeight: 500,
          color: "var(--msp-text-muted)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "var(--msp-text-display)",
          fontWeight: 500,
          color: "var(--msp-text)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
      {delta !== undefined && delta !== null && (
        <span
          style={{
            fontSize: "var(--msp-text-body-sm)",
            fontWeight: 500,
            color: toneColor(tone),
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {delta}
        </span>
      )}
    </div>
  );
});

export default StatCard;
