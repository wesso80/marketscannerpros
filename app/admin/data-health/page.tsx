"use client";

import { startVisiblePolling } from "@/lib/client/visiblePolling";
import { useEffect, useState } from "react";
import AdminProviderHealthGrid from "@/components/admin/AdminProviderHealthGrid";
import AdminWebhookStatusPanel from "@/components/admin/AdminWebhookStatusPanel";
import Link from "next/link";
import { useAdmin } from "../admin-client-layout";

/**
 * /admin/data-health — Consolidated diagnostics page that replaces the
 * earlier split between /admin/diagnostics + /admin/system. Pure
 * read-only research-grade health view: providers, webhooks, scanner.
 * One poll feeds both panels.
 */
export default function DataHealthPage() {
  const { discoveryPaused } = useAdmin();
  const [providers, setProviders] = useState<Array<{ id: string; label: string; status: "OK" | "CONFIGURED" | "PAUSED" | "DEGRADED" | "DOWN" | "UNKNOWN"; latencyMs?: number | null; lastSeen?: string | null; note?: string }>>([]);
  const [webhooks, setWebhooks] = useState<Array<{ id: string; label: string; lastReceivedAt?: string | null; lastStatus?: "OK" | "IDLE" | "FAILED" | "NOT_CONFIGURED" | "NO_DATA" | "NOT_MONITORED" | "UNKNOWN"; count24h?: number; failures24h?: number; note?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const secret = typeof window === "undefined" ? "" : sessionStorage.getItem("admin_secret");
        const res = await fetch("/api/admin/data-health", {
          headers: secret ? { Authorization: `Bearer ${secret}` } : {},
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setError(json?.error || "Failed to load data health.");
        } else {
          setProviders(Array.isArray(json.providers) ? json.providers : []);
          setWebhooks(Array.isArray(json.webhooks) ? json.webhooks : []);
          setError("");
        }
      } catch {
        if (!cancelled) setError("Failed to load data health.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const stop = startVisiblePolling(load, 30000);
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

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

      <AdminProviderHealthGrid rows={providers} loading={loading} error={error} />
      {!error && <AdminWebhookStatusPanel rows={webhooks} loading={loading} />}

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
        {discoveryPaused ? (
          <>Legacy diagnostics and system views stay paused.</>
        ) : (
          <>
            Looking for the legacy split views? They are still mounted at{" "}
            <Link href="/admin/diagnostics" style={{ color: "#10B981" }}>
              /admin/diagnostics
            </Link>{" "}
            and{" "}
            <Link href="/admin/system" style={{ color: "#10B981" }}>
              /admin/system
            </Link>
            . They will be retired once this page reaches parity.
          </>
        )}
      </section>
    </div>
  );
}
