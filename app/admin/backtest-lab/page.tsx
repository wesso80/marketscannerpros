"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface SetupBreakdown {
  setup: string;
  market: string;
  cases: number;
  avgScore: number;
  hitRate: number | null;
  wins: number;
  losses: number;
}

interface BacktestLabResponse {
  ok: boolean;
  totalCases?: number;
  totalWins?: number;
  totalLosses?: number;
  overallHitRate?: number | null;
  overallAvgScore?: number | null;
  breakdown?: SetupBreakdown[];
  note?: string | null;
  error?: string;
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const secret = sessionStorage.getItem("admin_secret");
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

export default function BacktestLabPage() {
  const [data, setData] = useState<BacktestLabResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/backtest-lab", { headers: authHeaders() });
      const json = (await res.json().catch(() => ({}))) as BacktestLabResponse;
      if (!res.ok || !json.ok) {
        setError(json.error || "Failed to load Backtest Lab.");
      } else {
        setData(json);
        setError("");
      }
    } catch {
      setError("Failed to load Backtest Lab.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div style={{ color: "#E5E7EB" }}>
      <header style={{ marginBottom: "1.4rem", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "#64748B", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            Markets
          </div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0.2rem 0 0.4rem" }}>Backtest Lab</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, maxWidth: 720 }}>
            Historical performance of saved research calls grouped by setup and market. Read-only — this lab studies
            past calls, it does not place anything.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          style={{
            padding: "0.5rem 0.9rem",
            background: "rgba(16,185,129,0.18)",
            color: "#10B981",
            border: "1px solid rgba(16,185,129,0.36)",
            borderRadius: 8,
            cursor: loading ? "default" : "pointer",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error && (
        <div style={{ padding: "0.75rem 1rem", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.32)", borderRadius: 8, color: "#FCA5A5", marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {data && (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.75rem",
              marginBottom: "1.25rem",
            }}
          >
            <Stat label="Total cases" value={String(data.totalCases ?? 0)} />
            <Stat label="Wins" value={String(data.totalWins ?? 0)} tone="green" />
            <Stat label="Losses" value={String(data.totalLosses ?? 0)} tone="red" />
            <Stat
              label="Hit rate"
              value={data.overallHitRate !== null && data.overallHitRate !== undefined ? `${data.overallHitRate}%` : "—"}
            />
            <Stat
              label="Avg score"
              value={data.overallAvgScore !== null && data.overallAvgScore !== undefined ? String(data.overallAvgScore) : "—"}
            />
          </section>

          <section style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Setup × Market Breakdown</h2>
            {(!data.breakdown || data.breakdown.length === 0) ? (
              <div style={{ color: "#94A3B8", fontSize: 13 }}>No breakdown rows yet.</div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  gap: "0.75rem",
                }}
              >
                {data.breakdown.map((row) => (
                  <div
                    key={`${row.setup}-${row.market}`}
                    style={{
                      padding: "0.85rem",
                      background: "rgba(13,22,38,0.92)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ color: "#E5E7EB", fontWeight: 700 }}>{row.setup}</span>
                      <span style={{ color: "#64748B", fontSize: 11 }}>{row.market}</span>
                    </div>
                    <div style={{ color: "#10B981", fontSize: 22, fontWeight: 800, marginTop: 6 }}>
                      {row.hitRate !== null ? `${row.hitRate}%` : "—"}
                    </div>
                    <div style={{ color: "#94A3B8", fontSize: 11 }}>
                      {row.cases} cases · {row.wins}W / {row.losses}L · avg score {row.avgScore}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {data.note && (
            <section
              style={{
                padding: "0.85rem 1rem",
                background: "rgba(13,22,38,0.7)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10,
                fontSize: 12,
                color: "#94A3B8",
                marginBottom: "1rem",
              }}
            >
              {data.note}
            </section>
          )}

          <section
            style={{
              padding: "0.85rem 1rem",
              background: "rgba(13,22,38,0.7)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10,
              fontSize: 12,
              color: "#94A3B8",
            }}
          >
            Looking for the strategy research surface?{" "}
            <Link href="/admin/quant" style={{ color: "#10B981" }}>
              Quant Terminal
            </Link>{" "}
            remains available for live scans and indicator research.
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "green" | "amber" | "red" | "neutral" }) {
  const color =
    tone === "green" ? "#10B981" : tone === "amber" ? "#FBBF24" : tone === "red" ? "#F87171" : "#E5E7EB";
  return (
    <div
      style={{
        padding: "0.85rem",
        background: "rgba(13,22,38,0.92)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
      }}
    >
      <div style={{ color: "#64748B", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  );
}
