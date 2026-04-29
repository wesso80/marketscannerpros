"use client";

import { useEffect, useState } from "react";

interface CalibrationBucket {
  band: string;
  min: number;
  max: number;
  cases: number;
  hitRate: number | null;
  avgScore: number | null;
}

interface DriftRow {
  from: string;
  to: string;
  delta: number;
}

interface ModelDiagnosticsResponse {
  ok: boolean;
  totalCases?: number;
  totalLabelled?: number;
  overallHitRate?: number | null;
  buckets?: CalibrationBucket[];
  drift?: DriftRow[];
  note?: string | null;
  error?: string;
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const secret = sessionStorage.getItem("admin_secret");
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

export default function ModelDiagnosticsPage() {
  const [data, setData] = useState<ModelDiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/model-diagnostics", { headers: authHeaders() });
      const json = (await res.json().catch(() => ({}))) as ModelDiagnosticsResponse;
      if (!res.ok || !json.ok) {
        setError(json.error || "Failed to load model diagnostics.");
      } else {
        setData(json);
        setError("");
      }
    } catch {
      setError("Failed to load model diagnostics.");
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
            System
          </div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0.2rem 0 0.4rem" }}>Model Diagnostics</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, maxWidth: 720 }}>
            Calibration of the internal research score against realised outcomes. Read-only telemetry — this page does
            not retrain or alter the model.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          style={{
            padding: "0.5rem 0.9rem",
            background: loading ? "rgba(16,185,129,0.18)" : "rgba(16,185,129,0.18)",
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
            <Stat label="Labelled outcomes" value={String(data.totalLabelled ?? 0)} />
            <Stat
              label="Overall hit rate"
              value={data.overallHitRate !== null && data.overallHitRate !== undefined ? `${data.overallHitRate}%` : "—"}
              tone={
                data.overallHitRate !== null && data.overallHitRate !== undefined
                  ? data.overallHitRate >= 55
                    ? "green"
                    : data.overallHitRate >= 45
                    ? "amber"
                    : "red"
                  : "neutral"
              }
            />
            <Stat label="Drift warnings" value={String(data.drift?.length ?? 0)} tone={(data.drift?.length ?? 0) > 0 ? "amber" : "neutral"} />
          </section>

          <section style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Score Calibration</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "0.75rem",
              }}
            >
              {data.buckets?.map((b) => (
                <div
                  key={b.band}
                  style={{
                    padding: "0.85rem",
                    background: "rgba(13,22,38,0.92)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#E5E7EB", fontWeight: 700 }}>Band {b.band}</span>
                    <span style={{ color: "#64748B", fontSize: 11 }}>{b.cases} cases</span>
                  </div>
                  <div style={{ color: "#10B981", fontSize: 22, fontWeight: 800, marginTop: 6 }}>
                    {b.hitRate !== null ? `${b.hitRate}%` : "—"}
                  </div>
                  <div style={{ color: "#94A3B8", fontSize: 11 }}>
                    avg score {b.avgScore !== null ? b.avgScore : "—"}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {data.drift && data.drift.length > 0 && (
            <section style={{ marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem", color: "#FBBF24" }}>
                Drift Warnings
              </h2>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.5rem" }}>
                {data.drift.map((d, idx) => (
                  <li
                    key={idx}
                    style={{
                      padding: "0.6rem 0.85rem",
                      background: "rgba(245,158,11,0.10)",
                      border: "1px solid rgba(245,158,11,0.32)",
                      borderRadius: 8,
                      fontSize: 13,
                      color: "#FCD34D",
                    }}
                  >
                    Hit rate dropped {d.delta}pp moving from band {d.from} to {d.to}.
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.note && (
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
              {data.note}
            </section>
          )}
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
