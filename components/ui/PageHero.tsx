"use client";
import React from "react";
import Button, { type ButtonProps } from "./Button";
import MetricChip, { type MetricChipProps } from "./MetricChip";

export interface PageHeroAction extends Omit<ButtonProps, "children" | "size"> {
  label: string;
  href?: string;
}

export interface PageHeroBadge {
  label: React.ReactNode;
  tone?: "neutral" | "bull" | "bear" | "warn" | "info";
}

export interface PageHeroProps {
  /** Sentence-case eyebrow label (12px muted). */
  eyebrow: React.ReactNode;
  /** Optional small chips that sit next to the eyebrow. */
  badges?: PageHeroBadge[];
  /** Main h1 title \u2014 sentence case. */
  title: React.ReactNode;
  /** Optional short subtitle below the title. */
  subtitle?: React.ReactNode;
  /** Up to ~3 actions \u2014 first is primary, then secondary, then ghost. */
  actions?: PageHeroAction[];
  /** Optional trailing node rendered below actions (e.g. shared header buttons). */
  trailing?: React.ReactNode;
  /** Metric chips rendered in the right-hand grid. */
  metrics?: MetricChipProps[];
  /** Optional aria-label for the section landmark. */
  ariaLabel?: string;
}

function badgeStyle(tone: PageHeroBadge["tone"]): React.CSSProperties {
  const colorMap: Record<NonNullable<PageHeroBadge["tone"]>, string> = {
    neutral: "var(--msp-text-muted)",
    bull: "var(--msp-bull)",
    bear: "var(--msp-bear)",
    warn: "var(--msp-warn)",
    info: "var(--msp-info)",
  };
  return {
    background: "rgba(255,255,255,0.04)",
    borderRadius: 6,
    padding: "2px 8px",
    fontSize: 11,
    color: colorMap[tone ?? "neutral"],
  };
}

/**
 * Shared page hero for all trader tool pages.
 * Renders: sentence-case eyebrow + optional badges + h1 + subtitle + actions + metrics grid.
 * Replaces the duplicated gradient/emerald-bordered hero used across portfolio,
 * crypto, workspace, golden-egg, terminal, liquidity-sweep, explorer and others.
 */
export default function PageHero({
  eyebrow,
  badges,
  title,
  subtitle,
  actions,
  trailing,
  metrics,
  ariaLabel,
}: PageHeroProps) {
  const hasRightColumn = metrics && metrics.length > 0;
  const variantOrder: NonNullable<ButtonProps["variant"]>[] = ["primary", "secondary", "ghost"];
  return (
    <section
      aria-label={ariaLabel}
      style={{
        background: "var(--msp-panel)",
        borderRadius: "var(--msp-radius-card)",
        padding: 16,
      }}
    >
      <div
        className={hasRightColumn ? "grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)]" : ""}
      >
        <div>
          <div
            className="flex flex-wrap items-center gap-2"
            style={{ fontSize: "var(--msp-text-label)", color: "var(--msp-text-muted)" }}
          >
            <span>{eyebrow}</span>
            {badges?.map((b, i) => (
              <span key={i} style={badgeStyle(b.tone)}>{b.label}</span>
            ))}
          </div>
          <h1
            className="mt-1"
            style={{
              fontSize: "var(--msp-text-h1)",
              fontWeight: 500,
              color: "var(--msp-text)",
              lineHeight: 1.25,
            }}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              className="mt-1 max-w-3xl"
              style={{
                fontSize: "var(--msp-text-body-sm)",
                color: "var(--msp-text-muted)",
                lineHeight: 1.5,
              }}
            >
              {subtitle}
            </p>
          ) : null}
          {actions && actions.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {actions.map((a, i) => {
                const { label, href, variant, ...rest } = a;
                const resolvedVariant = variant ?? variantOrder[Math.min(i, variantOrder.length - 1)];
                const onClick = rest.onClick ?? (href ? () => { window.location.href = href; } : undefined);
                return (
                  <Button key={i} size="sm" variant={resolvedVariant} {...rest} onClick={onClick}>
                    {label}
                  </Button>
                );
              })}
            </div>
          ) : null}
          {trailing ? <div className="mt-3 flex flex-wrap items-center gap-2">{trailing}</div> : null}
        </div>

        {hasRightColumn ? (
          <div className="grid self-start gap-1.5 sm:grid-cols-2">
            {metrics!.map((m, i) => <MetricChip key={i} {...m} />)}
          </div>
        ) : null}
      </div>
    </section>
  );
}
