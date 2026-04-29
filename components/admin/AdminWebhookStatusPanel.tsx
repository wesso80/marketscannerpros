"use client";

import { useEffect, useState } from "react";

/**
 * AdminWebhookStatusPanel — surfaces the most recent webhook activity
 * (Stripe, Discord bridge, alert dispatcher). Read-only diagnostics.
 */

interface WebhookRow {
  id: string;
  label: string;
  lastReceivedAt?: string | null;
  lastStatus?: "OK" | "FAILED" | "STALE" | "UNKNOWN";
  count24h?: number;
  failures24h?: number;
  note?: string;
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const secret = sessionStorage.getItem("admin_secret");
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

function statusColor(status?: WebhookRow["lastStatus"]): string {
  switch (status) {
    case "OK":
      return "#10B981";
    case "FAILED":
      return "#EF4444";
    case "STALE":
      return "#F59E0B";
    default:
      return "#94A3B8";
  }
}

export default function AdminWebhookStatusPanel() {
  const [rows, setRows] = useState<WebhookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/data-health", { headers: authHeaders() });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setError(json?.error || "Failed to load webhook status.");
        } else {
          setRows(Array.isArray(json.webhooks) ? json.webhooks : []);
          setError("");
        }
      } catch {
        if (!cancelled) setError("Failed to load webhook status.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <section style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "0.6rem" }}>
        <div style={{ color: "#E5E7EB", fontWeight: 700 }}>Webhook Activity</div>
        <div style={{ color: "#64748B", fontSize: 11 }}>Receive-only · last 24h</div>
      </div>
      {loading && rows.length === 0 ? (
        <div style={{ color: "#94A3B8", fontSize: 13 }}>Loading webhook activity…</div>
      ) : error ? (
        <div style={{ color: "#F87171", fontSize: 13 }}>{error}</div>
      ) : rows.length === 0 ? (
        <div style={{ color: "#94A3B8", fontSize: 13 }}>No webhook activity reported.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "0.75rem",
          }}
        >
          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                padding: "0.85rem",
                background: "rgba(13,22,38,0.92)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ color: "#E5E7EB", fontWeight: 700, fontSize: 13 }}>{row.label}</div>
                <div style={{ color: statusColor(row.lastStatus), fontSize: 11, fontWeight: 800 }}>
                  {row.lastStatus ?? "UNKNOWN"}
                </div>
              </div>
              <div style={{ color: "#94A3B8", fontSize: 11, marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {typeof row.count24h === "number" && <span>{row.count24h} events</span>}
                {typeof row.failures24h === "number" && (
                  <span style={{ color: row.failures24h > 0 ? "#F87171" : "#94A3B8" }}>
                    {row.failures24h} failed
                  </span>
                )}
                {row.lastReceivedAt && <span>last {row.lastReceivedAt}</span>}
              </div>
              {row.note && (
                <div style={{ color: "#CBD5F5", fontSize: 11, marginTop: 6 }}>{row.note}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
