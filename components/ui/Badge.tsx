import React from "react";

export type BadgeTone = "bull" | "bear" | "warn" | "info" | "neutral" | "accent";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

function toneStyle(tone: BadgeTone): React.CSSProperties {
  const map: Record<BadgeTone, { fg: string; bg: string }> = {
    bull:    { fg: "var(--msp-bull)",    bg: "var(--msp-bull-tint)" },
    bear:    { fg: "var(--msp-bear)",    bg: "var(--msp-bear-tint)" },
    warn:    { fg: "var(--msp-warn)",    bg: "var(--msp-warn-tint)" },
    info:    { fg: "var(--msp-info)",    bg: "var(--msp-info-tint)" },
    accent:  { fg: "var(--msp-accent)",  bg: "var(--msp-accent-tint)" },
    neutral: { fg: "var(--msp-text-muted)", bg: "rgba(255,255,255,0.04)" },
  };
  const { fg, bg } = map[tone];
  return { color: fg, background: bg };
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = "neutral", style, children, ...rest },
  ref
) {
  const merged: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: "var(--msp-text-caption)",
    fontWeight: 500,
    lineHeight: 1,
    padding: "3px 8px",
    borderRadius: "var(--msp-radius-pill)",
    whiteSpace: "nowrap",
    ...toneStyle(tone),
    ...style,
  };
  return (
    <span ref={ref} style={merged} {...rest}>
      {children}
    </span>
  );
});

export default Badge;
