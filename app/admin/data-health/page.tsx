"use client";

import AdminProviderHealthGrid from "@/components/admin/AdminProviderHealthGrid";
import AdminWebhookStatusPanel from "@/components/admin/AdminWebhookStatusPanel";
import Link from "next/link";

/**
 * /admin/data-health — Consolidated diagnostics page that replaces the
 * earlier split between /admin/diagnostics + /admin/system. Pure
 * read-only research-grade health view: providers, webhooks, scanner.
 */
export default function DataHealthPage() {
  return (
    <div style={{ color: "#E5E7EB" }}>
      <header style={{ marginBottom: "1.4rem" }}>
        <div style={{ color: "#64748B", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
          System
        </div>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0.2rem 0 0.4rem" }}>Data Health</h1>
        <p style={{ color: "#94A3B8", fontSize: 13, maxWidth: 720 }}>
          Provider feeds, webhook receivers, and scanner heartbeat. Read-only — this page never modifies state or
          dispatches anything outbound.
        </p>
      </header>

      <AdminProviderHealthGrid />
      <AdminWebhookStatusPanel />

      <section
        style={{
          marginTop: "1.5rem",
          padding: "0.85rem 1rem",
          background: "rgba(13,22,38,0.7)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10,
          fontSize: 12,
          color: "#94A3B8",
        }}
      >
        Looking for the legacy split views? They are still mounted at{" "}
        <Link href="/admin/diagnostics" style={{ color: "#10B981" }}>
          /admin/diagnostics
        </Link>{" "}
        and{" "}
        <Link href="/admin/system" style={{ color: "#10B981" }}>
          /admin/system
        </Link>
        . They will be retired once this page reaches parity.
      </section>
    </div>
  );
}
