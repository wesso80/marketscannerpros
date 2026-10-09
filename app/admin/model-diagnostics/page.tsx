"use client";

import { useEffect, useRef, useState } from "react";

import TruthStampLine from "@/components/admin/shared/TruthStampLine";
interface CalibrationBucket {
  band: string;
  min: number;
  max: number;
  cases: number;
  labelled?: number;
  wins?: number;
  losses?: number;
  neutral?: number;
  pending?: number;
  expired?: number;
  excludedOrUnknown?: number;
  hitRate: number | null;
  avgScore: number | null;
  measured?: number;
  avgSignedMove?: number | null;
  avgSignedMoveAfterCost?: number | null;
  smallSample?: boolean;
}

interface DriftRow {
  from: string;
  to: string;
  delta: number;
  fromLabelled?: number;
  toLabelled?: number;
}

interface Definition {
  sample: string;
  sampleFrom: string | null;
  sampleTo: string | null;
  label: string;
  hitRateDenominator: string;
  labelledSince: string;
  costs: string;
  minLabelledForComparison: number;
  zeroScoreSignals: number;
  zeroScoreNote: string | null;
  overlap: string;
}

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n > 0 ? "+" : ""}${n}%`);

interface ModelDiagnosticsResponse {
  ok: boolean;
  scoreField?: ScoreField;
  scoreColumn?: string;
  totalSignals?: number;
  totalCases?: number;
  totalLabelled?: number;
  overallHitRate?: number | null;
  buckets?: CalibrationBucket[];
  drift?: DriftRow[];
  note?: string | null;
  definition?: Definition;
  error?: string;
}

type ScoreField = "confluence" | "elite" | "confidence";

const SCORE_OPTIONS: { value: ScoreField; label: string }[] = [
  { value: "confluence", label: "Confluence score" },
  { value: "elite", label: "Elite score" },
  { value: "confidence", label: "Confidence" },
];

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const secret = sessionStorage.getItem("admin_secret");
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

export default function ModelDiagnosticsPage() {
  const [data, setData] = useState<ModelDiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scoreField, setScoreField] = useState<ScoreField>("confluence");
  const requestVersion = useRef(0);

  const refresh = async (field: ScoreField = scoreField) => {
    const version = ++requestVersion.current;
    setLoading(true);
    setData(null);
    setError("");
    try {
      const res = await fetch(`/api/admin/model-diagnostics?score=${field}`, { headers: authHeaders() });
      const json = (await res.json().catch(() => ({}))) as ModelDiagnosticsResponse;
      if (version !== requestVersion.current) return;
      if (!res.ok || !json.ok) {
        setError(json.error || "Failed to load model diagnostics.");
      } else {
        setData(json);
        setError("");
      }
    } catch {
      if (version === requestVersion.current) setError("Failed to load model diagnostics.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    refresh(scoreField);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreField]);

  return (
    <div style={{ color: "#E5E7EB" }}>
      <header style={{ marginBottom: "1.4rem", display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "#64748B", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            System
          </div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0.2rem 0 0.4rem" }}>Model Diagnostics</h1>
          {data && <TruthStampLine truth={(data as any).truth} />}
          <p style={{ color: "#94A3B8", fontSize: 13, maxWidth: 720 }}>
            Calibration of shared-scan signal scores against realised outcomes (ai_signal_log, fixed-labeller verdicts
            only). Buckets use the {SCORE_OPTIONS.find((o) => o.value === scoreField)?.label.toLowerCase()}
            {data?.scoreColumn ? ` (${data.scoreColumn})` : ""}. Read-only telemetry — this page does not retrain or
            alter the model.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <select
          aria-label="Score used for buckets"
          value={scoreField}
          onChange={(e) => setScoreField(e.target.value as ScoreField)}
          style={{
            padding: "0.45rem 0.6rem", background: "rgba(15,23,42,0.8)", color: "#E5E7EB",
            border: "1px solid rgba(148,163,184,0.3)", borderRadius: 8, fontSize: 12,
          }}
        >
          {SCORE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          onClick={() => refresh()}
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
        </div>
      </header>

      {error && (
        <div role="alert" style={{ padding: "0.75rem 1rem", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.32)", borderRadius: 8, color: "#FCA5A5", marginBottom: "1rem" }}>
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
            <Stat label="Signals" value={String(data.totalSignals ?? data.totalCases ?? 0)} />
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
                    <span style={{ color: "#64748B", fontSize: 11 }}>{b.cases} signals</span>
                  </div>
                  <div style={{ color: b.smallSample ? "#94A3B8" : "#10B981", fontSize: 22, fontWeight: 800, marginTop: 6 }}>
                    {b.hitRate !== null ? `${b.hitRate}%` : "—"}
                  </div>
                  <div data-band-labelled style={{ color: "#CBD5E1", fontSize: 11 }}>
                    of {b.labelled ?? 0} labelled ({b.wins ?? 0} correct / {b.losses ?? 0} wrong) · {b.neutral ?? 0} neutral
                  </div>
                  <div data-band-unresolved style={{ color: "#94A3B8", fontSize: 11 }}>
                    {b.pending ?? "—"} pending · {b.expired ?? "—"} expired · {b.excludedOrUnknown ?? "—"} excluded/unknown
                  </div>
                  {b.smallSample && (
                    <div data-band-small style={{ color: "#FBBF24", fontSize: 11 }}>
                      Too few labelled to compare (under {data.definition?.minLabelledForComparison ?? 20})
                    </div>
                  )}
                  <div style={{ color: "#94A3B8", fontSize: 11 }}>
                    avg 24h move {pct(b.avgSignedMove)} · after assumed cost {pct(b.avgSignedMoveAfterCost)} ({b.measured ?? 0} measured)
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
                    Hit rate dropped {d.delta}pp moving from band {d.from} to {d.to}
                    {d.fromLabelled !== undefined && d.toLabelled !== undefined ? ` (${d.fromLabelled} vs ${d.toLabelled} labelled)` : ""}.
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.definition && (
            <section
              data-calibration-definition
              style={{
                marginBottom: "1rem",
                padding: "0.85rem 1rem",
                background: "rgba(13,22,38,0.7)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10,
                fontSize: 12,
                color: "#94A3B8",
              }}
            >
              <div style={{ color: "#E5E7EB", fontWeight: 700, marginBottom: 4 }}>What these numbers mean</div>
              <ul style={{ margin: 0, paddingLeft: "1rem", display: "grid", gap: 2 }}>
                <li>Excluded/unknown includes old-method verdicts and missing or unrecognised labels; it is not a count of pending signals.</li>
                <li>Band comparisons are descriptive; the minimum sample rule does not establish statistical significance.</li>
                <li>
                  Sample: {data.definition.sample}
                  {data.definition.sampleFrom && data.definition.sampleTo
                    ? `, ${new Date(data.definition.sampleFrom).toLocaleDateString()} to ${new Date(data.definition.sampleTo).toLocaleDateString()}`
                    : ""}.
                </li>
                <li>Outcome: {data.definition.label}. Labelled since {new Date(data.definition.labelledSince).toLocaleString()}.</li>
                <li>Hit rate = {data.definition.hitRateDenominator}.</li>
                <li>{data.definition.costs}</li>
                <li>{data.definition.overlap}</li>
                {data.definition.zeroScoreNote && (
                  <li>{data.definition.zeroScoreSignals} signals have score 0: {data.definition.zeroScoreNote}</li>
                )}
                <li>A hit rate is not profitability: it ignores the size of wins and losses beyond the threshold.</li>
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
