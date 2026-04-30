"use client";

/**
 * Phase 7 — Journal Learning cockpit
 *
 * Workspace-wide rollup of every saved admin_research_case grouped by
 * setup × market × bias. Read-only research surface — no trades.
 */

import { useEffect, useState } from "react";
import type { JournalDNASummary } from "@/lib/engines/journalLearning";
import AdminBiasCheckPanel from "@/components/admin/AdminBiasCheckPanel";

function authHeaders(): HeadersInit {
  const secret = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : null;
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

export default function JournalLearningPage() {
  const [summary, setSummary] = useState<JournalDNASummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/journal-learning?limit=500", {
        credentials: "include",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `HTTP ${res.status}`);
        return;
      }
      setSummary(data.summary || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load journal patterns");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div style={{ padding: "1rem 1.25rem", color: "#E5E7EB", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>Journal Learning</h1>
          <p style={{ fontSize: "0.7rem", color: "#9CA3AF", margin: "0.25rem 0 0" }}>
            Repeat-pattern memory mined from saved research cases. Read-only research analytics.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          style={{
            padding: "0.4rem 0.9rem",
            borderRadius: "0.4rem",
            background: "#10B981",
            color: "#0F172A",
            border: "none",
            fontWeight: 700,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={{
          padding: "0.75rem 1rem",
          borderRadius: "0.5rem",
          background: "rgba(239,68,68,0.1)",
          border: "1px solid rgba(239,68,68,0.3)",
          color: "#FCA5A5",
          fontSize: "0.8rem",
          marginBottom: "1rem",
        }}>
          {error}
        </div>
      )}

      {summary && (
        <>
          <div style={{ marginBottom: "1rem" }}>
            <AdminBiasCheckPanel />
          </div>

          <div style={{
            background: "rgba(17,24,39,0.6)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "0.75rem",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            fontSize: "0.8rem",
            color: "#9CA3AF",
          }}>
            <strong style={{ color: "#E5E7EB" }}>{summary.totalCases}</strong> total research cases ·{" "}
            <strong style={{ color: "#E5E7EB" }}>{summary.groups.length}</strong> distinct setup × market × bias patterns
          </div>

          {summary.groups.length === 0 ? (
            <p style={{ color: "#6B7280", fontSize: "0.85rem", textAlign: "center", padding: "2rem" }}>
              No journal patterns yet. Save research cases from the Symbol Research Terminal to start building pattern memory.
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "0.75rem" }}>
              {summary.groups.map((g) => (
                <div
                  key={g.key}
                  style={{
                    background: "rgba(17,24,39,0.6)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "0.5rem",
                    padding: "0.75rem 1rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#E5E7EB" }}>{g.setupType}</span>
                    <span style={{ fontSize: "0.7rem", color: "#9CA3AF" }}>
                      {g.count} · avg {g.avgScore}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#9CA3AF", marginBottom: "0.4rem" }}>
                    {g.market} · {g.bias}
                    {g.lastSeenAt ? ` · last ${g.lastSeenAt.slice(0, 10)}` : ""}
                  </div>
                  {g.sampleSymbols.length > 0 && (
                    <div style={{ fontSize: "0.7rem", color: "#6B7280" }}>{g.sampleSymbols.join(", ")}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
