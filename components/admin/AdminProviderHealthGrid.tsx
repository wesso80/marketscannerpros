"use client";

import { useEffect, useState } from "react";

/**
 * AdminProviderHealthGrid — at-a-glance status of every external data
 * provider the research terminal depends on. Read-only. Polls
 * /api/admin/data-health and renders a colored grid.
 */

interface ProviderRow {
  id: string;
  label: string;
  status: "OK" | "DEGRADED" | "DOWN" | "UNKNOWN";
  latencyMs?: number | null;
  lastSeen?: string | null;
  note?: string;
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const secret = sessionStorage.getItem("admin_secret");
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

function tone(status: ProviderRow["status"]): { color: string; bg: string; border: string } {
  switch (status) {
    case "OK":
      return { color: "#10B981", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.32)" };
    case "DEGRADED":
      return { color: "#F59E0B", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.32)" };
    case "DOWN":
      return { color: "#EF4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.32)" };
    default:
      return { color: "#94A3B8", bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.22)" };
  }
}

export default function AdminProviderHealthGrid() {
  const [rows, setRows] = useState<ProviderRow[]>([]);
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
          setError(json?.error || "Failed to load provider health.");
        } else {
          setRows(Array.isArray(json.providers) ? json.providers : []);
          setError("");
        }
      } catch {
        if (!cancelled) setError("Failed to load provider health.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <section style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "0.6rem" }}>
        <div style={{ color: "#E5E7EB", fontWeight: 700 }}>Provider Health</div>
        <div style={{ color: "#64748B", fontSize: 11 }}>Auto-refreshes every 30s</div>
      </div>
      {loading && rows.length === 0 ? (
        <div style={{ color: "#94A3B8", fontSize: 13 }}>Loading provider feeds…</div>
      ) : error ? (
        <div style={{ color: "#F87171", fontSize: 13 }}>{error}</div>
      ) : rows.length === 0 ? (
        <div style={{ color: "#94A3B8", fontSize: 13 }}>No providers reported.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "0.75rem",
          }}
        >
          {rows.map((row) => {
            const t = tone(row.status);
            return (
              <div
                key={row.id}
                style={{
                  padding: "0.85rem",
                  background: t.bg,
                  border: `1px solid ${t.border}`,
                  borderRadius: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: "#E5E7EB", fontWeight: 700, fontSize: 13 }}>{row.label}</div>
                  <div style={{ color: t.color, fontSize: 11, fontWeight: 800, letterSpacing: "0.08em" }}>{row.status}</div>
                </div>
                <div style={{ color: "#94A3B8", fontSize: 11, marginTop: 6, display: "flex", gap: 10 }}>
                  {typeof row.latencyMs === "number" && <span>{row.latencyMs} ms</span>}
                  {row.lastSeen && <span>last {row.lastSeen}</span>}
                </div>
                {row.note && (
                  <div style={{ color: "#CBD5F5", fontSize: 11, marginTop: 6 }}>{row.note}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
