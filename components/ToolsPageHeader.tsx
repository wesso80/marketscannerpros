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
    <div
      style={{
        background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(11,21,38,0.92))",
        borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
        padding: "18px 24px",
        boxShadow: "0 14px 40px rgba(0,0,0,0.28)",
      }}
    >
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
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: "14px",
              background: "linear-gradient(145deg, #10b981 0%, #3b82f6 100%)",
              display: "grid",
              placeItems: "center",
              boxShadow: "0 10px 30px rgba(16,185,129,0.35)",
            }}
          >
            <span style={{ fontSize: "20px", color: "#0b1625", fontWeight: 800 }}>{icon}</span>
          </div>
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: "999px",
                background: "rgba(16,185,129,0.12)",
                color: "#34d399",
                fontSize: "11px",
                letterSpacing: "0.06em",
                border: "1px solid rgba(16,185,129,0.35)",
              }}
            >
              {badge}
            </div>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 800,
                color: "#e2e8f0",
                margin: "6px 0 0 0",
                letterSpacing: "-0.02em",
              }}
            >
              {title}
            </h1>
            <p style={{ margin: "4px 0 0 0", color: "#94a3b8", fontSize: "12px" }}>{subtitle}</p>
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
              style={{
                padding: "10px 16px",
                background: "transparent",
                border: "1px solid rgba(148,163,184,0.25)",
                borderRadius: "10px",
                color: "#cbd5e1",
                textDecoration: "none",
                fontSize: "13px",
                fontWeight: 600,
              }}
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
