"use client";

import React from "react";
import Link from "next/link";

interface ToolsPageHeaderProps {
  badge: string;
  title: string;
  subtitle: string;
  icon: string;
  actions?: React.ReactNode;
  backHref?: string;
}

export function ToolsPageHeader({ badge, title, subtitle, icon, actions, backHref }: ToolsPageHeaderProps) {
  return (
    <div className="border-b border-msp-border bg-msp-card px-6 py-5 shadow-msp">
      <div
        style={{
          maxWidth: "1600px",
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          rowGap: 14,
          flexDirection: "row",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: "1 1 100%", minWidth: 260 }}>
          <div className="grid h-[42px] w-[42px] place-items-center rounded-msp border border-msp-borderStrong bg-msp-panel">
            <span style={{ fontSize: "20px", color: "var(--msp-accent)", fontWeight: 800 }}>{icon}</span>
          </div>
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-msp-borderStrong bg-msp-panel px-2.5 py-1 text-[11px] tracking-[0.06em] text-msp-accent">
              {badge}
            </div>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 800,
                color: "var(--msp-text)",
                margin: "6px 0 0 0",
                letterSpacing: "-0.02em",
              }}
            >
              {title}
            </h1>
            <p style={{ margin: "4px 0 0 0", color: "var(--msp-text-muted)", fontSize: "12px" }}>{subtitle}</p>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-msp-warn/30 bg-msp-warnTint px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.04em] text-msp-warn">
              Educational Only • Not Financial Advice
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            flex: "1 1 100%",
            minWidth: 220,
            marginTop: 12,
          }}
        >
          {backHref && (
            <Link
              href={backHref}
              className="rounded-panel border border-msp-border bg-msp-panel px-4 py-2.5 text-[13px] font-semibold text-msp-text no-underline"
            >
              ← Back
            </Link>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
}

export default ToolsPageHeader;
