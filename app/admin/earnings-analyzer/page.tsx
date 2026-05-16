"use client";

/**
 * /admin/earnings-analyzer
 *
 * MSP earnings preview / recap. Operator inputs ticker +
 * (optional) earnings date + framing, gets a full decision summary at
 * the top, plus 6Q history, key metrics, segment expectations,
 * management guidance read, options-IV proxy, historical pattern,
 * pre-earnings positioning, and post-earnings playbook.
 */

import React, { useState } from "react";

interface EarningsHistoryRow {
  reportedDate: string | null;
  estimatedEPS: number | null;
  reportedEPS: number | null;
  surprisePct: number | null;
  beat: "beat" | "miss" | "in-line" | "unknown";
  reactionPct: number | null;
  reactionDirection: "gap-up" | "gap-down" | "flat" | "unknown";
  context: string;
}
interface KeyMetric { metric: string; significance: string; threshold: string; }
interface SegmentExp { segment: string; estimate: string; growthCommentary: string; source: string; }
interface PostScenario { scenario: "gap-up" | "gap-down" | "flat-open"; trigger: string; playbook: string; invalidation: string; positionSizingNote: string; }

interface EarningsNote {
  generatedAt: string;
  ticker: string;
  earningsDate: string | null;
  framing: "pre-earnings" | "post-earnings";
  decisionSummary: {
    headline: string;
    preEarningsStance: string;
    expectedOutcome: string;
    historicalImpliedMovePct: number | null;
    topTriggers: string[];
  };
  opportunityScore: number;
  evidenceQualityScore: number;
  personalExposureFlag: string;
  confidenceStatement: string;
  whatConfirms: string[];
  whatInvalidates: string[];
  mainRisk: string;
  earningsHistory: EarningsHistoryRow[];
  consensus: {
    nextQuarterRevenueEstimate: string;
    nextQuarterEPSEstimate: string;
    consensusSource: string;
    yoyRevenueGrowthExpectedPct: number | null;
    yoyEPSGrowthExpectedPct: number | null;
    whisperNumberNote: string;
  };
  keyMetricsToWatch: KeyMetric[];
  segmentExpectations: SegmentExp[];
  managementGuidance: {
    lastQuarterGuidance: string;
    deliveryLikelihood: string;
    rationale: string;
    keyForwardGuidanceItems: string[];
  };
  optionsImpliedMove: {
    available: boolean;
    impliedMovePct: number | null;
    expiry: string | null;
    source: string;
    note: string;
    historicalProxyAvgPct: number | null;
    historicalProxyMedianPct: number | null;
  };
  historicalPattern: {
    sampleSize: number;
    avgAbsMovePct: number | null;
    medianAbsMovePct: number | null;
    avgReactionOnBeatPct: number | null;
    avgReactionOnMissPct: number | null;
    pattern: string;
  };
  preEarningsPositioning: {
    recommendation: string;
    rationale: string;
    structure: string;
    sizing: string;
    riskLevel: string;
  };
  postEarningsPlaybook: PostScenario[];
  closingParagraph: string;
  classification: string;
  disclaimer: string;
}

interface ApiResponse {
  data: { note: EarningsNote | null; snapshot: unknown; aiError?: string };
  meta: {
    source: string;
    fetchedAt: string;
    freshness: string;
    simulated: boolean;
    missingFields: string[];
    confidence: string;
    confidenceReason: string;
  };
}

// wrapTruth() returns truth fields at top-level; adapt to nested {data, meta} shape.
function toEnvelope(j: any): ApiResponse {
  return {
    data: (j?.data ?? {}) as ApiResponse["data"],
    meta: {
      source: j?.source ?? "unknown",
      fetchedAt: j?.fetchedAt ?? new Date().toISOString(),
      freshness: j?.freshness ?? "unknown",
      simulated: !!j?.simulated,
      missingFields: Array.isArray(j?.missingFields) ? j.missingFields : [],
      confidence: j?.confidence ?? "low",
      confidenceReason: j?.confidenceReason ?? "no_envelope",
    },
  };
}

const stanceColor = (s: string): string => {
  switch (s) {
    case "buy-before": return "#10B981";
    case "trim-before": return "#F59E0B";
    case "wait-for-reaction": return "#60A5FA";
    case "hedge-existing": return "#EC4899";
    case "no-action": return "#94A3B8";
    default: return "#94A3B8";
  }
};
const beatColor = (b: string): string => {
  switch (b) {
    case "beat": return "#10B981";
    case "miss": return "#EF4444";
    case "in-line": return "#94A3B8";
    default: return "#64748B";
  }
};
const directionColor = (d: string): string => {
  if (d === "gap-up") return "#10B981";
  if (d === "gap-down") return "#EF4444";
  if (d === "flat") return "#94A3B8";
  return "#64748B";
};
const riskColor = (r: string): string => {
  switch (r) {
    case "low": return "#10B981";
    case "moderate": return "#60A5FA";
    case "high": return "#F59E0B";
    case "extreme": return "#EF4444";
    default: return "#94A3B8";
  }
};

export default function EarningsAnalyzerPage() {
  const [ticker, setTicker] = useState("AAPL");
  const [framing, setFraming] = useState<"pre-earnings" | "post-earnings">("pre-earnings");
  const [earningsDate, setEarningsDate] = useState("");
  const [exposure, setExposure] = useState<"none" | "low" | "elevated" | "high">("none");
  const [operatorNotes, setOperatorNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResp(null);
    try {
      const r = await fetch("/api/admin/earnings-analyzer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.trim().toUpperCase(),
          framing,
          earningsDate: earningsDate || undefined,
          personalExposureFlag: exposure,
          operatorNotes: operatorNotes || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || j.detail || `HTTP ${r.status}`);
        if (j.data) setResp(toEnvelope(j));
      } else {
        setResp(toEnvelope(j));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "request_failed");
    } finally {
      setLoading(false);
    }
  };

  const note = resp?.data?.note ?? null;

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", color: "#E2E8F0", padding: "24px", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#F1F5F9", margin: 0 }}>Earnings Analyzer</h1>
          <p style={{ color: "#94A3B8", marginTop: 4 }}>MSP pre/post-earnings note. Decision summary + trade plan at the top, full history + scenario playbook below.</p>
        </header>

        {/* Input panel */}
        <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: "#94A3B8" }}>
              Ticker
              <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} style={inputStyle} maxLength={10} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: "#94A3B8" }}>
              Framing
              <select value={framing} onChange={(e) => setFraming(e.target.value as "pre-earnings" | "post-earnings")} style={inputStyle}>
                <option value="pre-earnings">Pre-earnings</option>
                <option value="post-earnings">Post-earnings</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: "#94A3B8" }}>
              Earnings Date (YYYY-MM-DD, optional)
              <input value={earningsDate} onChange={(e) => setEarningsDate(e.target.value)} placeholder="2026-05-30" style={inputStyle} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: "#94A3B8" }}>
              Personal Exposure
              <select value={exposure} onChange={(e) => setExposure(e.target.value as "none" | "low" | "elevated" | "high")} style={inputStyle}>
                <option value="none">none</option>
                <option value="low">low</option>
                <option value="elevated">elevated</option>
                <option value="high">high</option>
              </select>
            </label>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button onClick={run} disabled={loading || !ticker.trim()} style={{ ...btnStyle, opacity: loading ? 0.6 : 1, cursor: loading ? "wait" : "pointer", width: "100%" }}>
                {loading ? "Analysing…" : "Generate Note"}
              </button>
            </div>
          </div>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: "#94A3B8", marginTop: 12 }}>
            Operator Notes (optional — supply known consensus, IV, whisper, segment estimates here if available)
            <textarea
              value={operatorNotes}
              onChange={(e) => setOperatorNotes(e.target.value.slice(0, 1500))}
              rows={3}
              style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", resize: "vertical" }}
            />
          </label>
        </section>

        {error && (
          <div style={{ background: "#7F1D1D", border: "1px solid #B91C1C", color: "#FECACA", padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {resp && !note && (
          <div style={{ background: "#1E293B", border: "1px solid #F59E0B", borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 13, color: "#E2E8F0" }}>
            <div style={{ color: "#FBBF24", fontWeight: 700, marginBottom: 8 }}>Note not produced — diagnostic snapshot</div>
            <div style={{ marginBottom: 4 }}><strong>AI error:</strong> {resp.data.aiError ?? "none"}</div>
            <div style={{ marginBottom: 4 }}><strong>Confidence:</strong> {resp.meta.confidence} — {resp.meta.confidenceReason}</div>
            <div style={{ marginBottom: 4 }}><strong>Freshness:</strong> {resp.meta.freshness} · <strong>Source:</strong> {resp.meta.source}</div>
            <div style={{ marginBottom: 8 }}><strong>Missing fields:</strong> {resp.meta.missingFields.join(" · ") || "none"}</div>
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", color: "#94A3B8" }}>Raw snapshot (click to expand)</summary>
              <pre style={{ marginTop: 8, padding: 8, background: "#0F172A", borderRadius: 6, fontSize: 11, overflow: "auto", maxHeight: 400 }}>{JSON.stringify(resp.data.snapshot, null, 2)}</pre>
            </details>
          </div>
        )}

        {note && resp && (
          <>
            {/* Decision Summary header strip */}
            <section style={{ background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)", border: "2px solid " + stanceColor(note.decisionSummary.preEarningsStance), borderRadius: 10, padding: 20, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <h2 style={{ fontSize: 22, fontWeight: 700, color: "#F1F5F9", margin: 0 }}>
                      {note.ticker} — {note.framing === "pre-earnings" ? "Pre-Earnings" : "Post-Earnings"} Note
                    </h2>
                    <span style={{ ...pillStyle, background: stanceColor(note.decisionSummary.preEarningsStance) + "33", color: stanceColor(note.decisionSummary.preEarningsStance), border: "1px solid " + stanceColor(note.decisionSummary.preEarningsStance) }}>
                      {note.decisionSummary.preEarningsStance.toUpperCase().replace(/-/g, " ")}
                    </span>
                    {note.earningsDate && (
                      <span style={{ ...pillStyle, background: "#1E40AF33", color: "#93C5FD", border: "1px solid #1E40AF" }}>
                        Earnings: {note.earningsDate}
                      </span>
                    )}
                  </div>
                  <p style={{ color: "#CBD5E1", marginTop: 8, fontSize: 15, lineHeight: 1.5 }}>{note.decisionSummary.headline}</p>
                </div>
                <div style={{ textAlign: "right", minWidth: 180 }}>
                  <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5 }}>Historical Implied Move</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#FBBF24" }}>
                    ±{note.decisionSummary.historicalImpliedMovePct?.toFixed(2) ?? "n/a"}%
                  </div>
                  <div style={{ fontSize: 10, color: "#64748B" }}>backward-looking proxy (no AV options-IV)</div>
                </div>
              </div>
              <div style={{ borderTop: "1px solid #334155", paddingTop: 12 }}>
                <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Expected Outcome</div>
                <div style={{ fontSize: 14, color: "#E2E8F0", marginBottom: 12 }}>{note.decisionSummary.expectedOutcome}</div>
                <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Top Triggers</div>
                <ol style={{ margin: 0, paddingLeft: 20, color: "#E2E8F0", fontSize: 13, lineHeight: 1.6 }}>
                  {note.decisionSummary.topTriggers.map((t, i) => <li key={i}>{t}</li>)}
                </ol>
              </div>
            </section>

            {/* Score strip */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              <Stat label="Opportunity" value={`${note.opportunityScore}/100`} />
              <Stat label="Evidence Quality" value={`${note.evidenceQualityScore}/100`} />
              <Stat label="Personal Exposure" value={note.personalExposureFlag} />
              <Stat label="Confidence" value={resp.meta.confidence} />
            </section>

            {/* Earnings History table */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={sectionH}>Earnings History (last 6 quarters)</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #334155", color: "#94A3B8", textAlign: "left" }}>
                      <th style={th}>Report Date</th>
                      <th style={th}>Est EPS</th>
                      <th style={th}>Act EPS</th>
                      <th style={th}>Surprise %</th>
                      <th style={th}>Result</th>
                      <th style={th}>Reaction %</th>
                      <th style={th}>Direction</th>
                      <th style={{ ...th, minWidth: 240 }}>Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {note.earningsHistory.map((q, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #1E293B" }}>
                        <td style={td}>{q.reportedDate ?? "?"}</td>
                        <td style={td}>{q.estimatedEPS?.toFixed(2) ?? "n/a"}</td>
                        <td style={td}>{q.reportedEPS?.toFixed(2) ?? "n/a"}</td>
                        <td style={td}>{q.surprisePct != null ? `${q.surprisePct > 0 ? "+" : ""}${q.surprisePct.toFixed(2)}%` : "n/a"}</td>
                        <td style={td}><span style={{ color: beatColor(q.beat), fontWeight: 600 }}>{q.beat}</span></td>
                        <td style={{ ...td, color: q.reactionPct != null && q.reactionPct > 0 ? "#10B981" : q.reactionPct != null && q.reactionPct < 0 ? "#EF4444" : "#94A3B8", fontWeight: 600 }}>
                          {q.reactionPct != null ? `${q.reactionPct > 0 ? "+" : ""}${q.reactionPct.toFixed(2)}%` : "n/a"}
                        </td>
                        <td style={td}><span style={{ color: directionColor(q.reactionDirection) }}>{q.reactionDirection}</span></td>
                        <td style={{ ...td, color: "#CBD5E1" }}>{q.context}</td>
                      </tr>
                    ))}
                    {!note.earningsHistory.length && (
                      <tr><td colSpan={8} style={{ ...td, color: "#64748B", textAlign: "center" }}>No earnings history returned by Alpha Vantage.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Consensus + Historical Pattern + Options proxy */}
            <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
              <Card title="Consensus (Wall Street)">
                <Field label="Revenue est" value={note.consensus.nextQuarterRevenueEstimate} />
                <Field label="EPS est" value={note.consensus.nextQuarterEPSEstimate} />
                <Field label="Source" value={note.consensus.consensusSource} />
                <Field label="YoY rev growth exp" value={note.consensus.yoyRevenueGrowthExpectedPct != null ? `${note.consensus.yoyRevenueGrowthExpectedPct.toFixed(2)}%` : "n/a"} />
                <Field label="YoY EPS growth exp" value={note.consensus.yoyEPSGrowthExpectedPct != null ? `${note.consensus.yoyEPSGrowthExpectedPct.toFixed(2)}%` : "n/a"} />
                <div style={{ borderTop: "1px solid #334155", marginTop: 8, paddingTop: 8, fontSize: 11, color: "#94A3B8" }}>
                  <strong style={{ color: "#FBBF24" }}>Whisper:</strong> {note.consensus.whisperNumberNote}
                </div>
              </Card>
              <Card title="Historical Pattern">
                <Field label="Sample size" value={String(note.historicalPattern.sampleSize)} />
                <Field label="Avg abs move" value={note.historicalPattern.avgAbsMovePct != null ? `${note.historicalPattern.avgAbsMovePct.toFixed(2)}%` : "n/a"} />
                <Field label="Median abs move" value={note.historicalPattern.medianAbsMovePct != null ? `${note.historicalPattern.medianAbsMovePct.toFixed(2)}%` : "n/a"} />
                <Field label="Avg on beat" value={note.historicalPattern.avgReactionOnBeatPct != null ? `${note.historicalPattern.avgReactionOnBeatPct > 0 ? "+" : ""}${note.historicalPattern.avgReactionOnBeatPct.toFixed(2)}%` : "n/a"} valueColor={note.historicalPattern.avgReactionOnBeatPct != null && note.historicalPattern.avgReactionOnBeatPct > 0 ? "#10B981" : undefined} />
                <Field label="Avg on miss" value={note.historicalPattern.avgReactionOnMissPct != null ? `${note.historicalPattern.avgReactionOnMissPct > 0 ? "+" : ""}${note.historicalPattern.avgReactionOnMissPct.toFixed(2)}%` : "n/a"} valueColor={note.historicalPattern.avgReactionOnMissPct != null && note.historicalPattern.avgReactionOnMissPct < 0 ? "#EF4444" : undefined} />
                <div style={{ borderTop: "1px solid #334155", marginTop: 8, paddingTop: 8, fontSize: 12, color: "#CBD5E1" }}>{note.historicalPattern.pattern}</div>
              </Card>
              <Card title="Options Implied Move">
                {note.optionsImpliedMove.available ? (
                  <div style={{ background: "#064E3B33", border: "1px solid #10B981", color: "#A7F3D0", padding: 8, borderRadius: 4, fontSize: 11, marginBottom: 8 }}>
                    Live ATM straddle{note.optionsImpliedMove.expiry ? ` · expiry ${note.optionsImpliedMove.expiry}` : ""}{note.optionsImpliedMove.source ? ` · ${note.optionsImpliedMove.source}` : ""}
                  </div>
                ) : (
                  <div style={{ background: "#7F1D1D33", border: "1px solid #B91C1C", color: "#FECACA", padding: 8, borderRadius: 4, fontSize: 11, marginBottom: 8 }}>
                    Options chain unavailable on this Alpha Vantage plan — using historical earnings-day move as proxy.
                  </div>
                )}
                {note.optionsImpliedMove.available && note.optionsImpliedMove.impliedMovePct != null && (
                  <Field label="Implied move" value={`\u00B1${note.optionsImpliedMove.impliedMovePct.toFixed(2)}%`} valueColor="#10B981" />
                )}
                <Field label="Hist proxy avg" value={note.optionsImpliedMove.historicalProxyAvgPct != null ? `\u00B1${note.optionsImpliedMove.historicalProxyAvgPct.toFixed(2)}%` : "n/a"} />
                <Field label="Hist proxy median" value={note.optionsImpliedMove.historicalProxyMedianPct != null ? `\u00B1${note.optionsImpliedMove.historicalProxyMedianPct.toFixed(2)}%` : "n/a"} />
                <div style={{ borderTop: "1px solid #334155", marginTop: 8, paddingTop: 8, fontSize: 11, color: "#94A3B8" }}>{note.optionsImpliedMove.note}</div>
              </Card>
            </section>

            {/* Key Metrics + Segment Expectations */}
            <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <Card title="Key Metrics To Watch">
                {note.keyMetricsToWatch.map((m, i) => (
                  <div key={i} style={{ borderBottom: i < note.keyMetricsToWatch.length - 1 ? "1px solid #334155" : "none", paddingBottom: 10, marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, color: "#F1F5F9", fontSize: 13 }}>{m.metric}</div>
                    <div style={{ fontSize: 12, color: "#FBBF24", marginTop: 2 }}>Threshold: {m.threshold}</div>
                    <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 2 }}>{m.significance}</div>
                  </div>
                ))}
              </Card>
              <Card title="Segment Expectations">
                {note.segmentExpectations.map((s, i) => (
                  <div key={i} style={{ borderBottom: i < note.segmentExpectations.length - 1 ? "1px solid #334155" : "none", paddingBottom: 10, marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontWeight: 600, color: "#F1F5F9", fontSize: 13 }}>{s.segment}</span>
                      <span style={{ fontSize: 10, color: "#64748B" }}>{s.source}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#FBBF24", marginTop: 2 }}>{s.estimate}</div>
                    <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 2 }}>{s.growthCommentary}</div>
                  </div>
                ))}
              </Card>
            </section>

            {/* Management Guidance */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={sectionH}>Management Guidance</h3>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5 }}>Last quarter guidance</div>
                  <div style={{ fontSize: 13, color: "#E2E8F0", marginBottom: 12 }}>{note.managementGuidance.lastQuarterGuidance}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5 }}>Rationale</div>
                  <div style={{ fontSize: 13, color: "#E2E8F0", marginBottom: 12 }}>{note.managementGuidance.rationale}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5 }}>Forward guidance items to listen for</div>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 20, fontSize: 13, color: "#E2E8F0", lineHeight: 1.6 }}>
                    {note.managementGuidance.keyForwardGuidanceItems.map((g, i) => <li key={i}>{g}</li>)}
                  </ul>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5 }}>Delivery likelihood</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: note.managementGuidance.deliveryLikelihood === "high" ? "#10B981" : note.managementGuidance.deliveryLikelihood === "low" ? "#EF4444" : "#FBBF24" }}>
                    {note.managementGuidance.deliveryLikelihood}
                  </div>
                </div>
              </div>
            </section>

            {/* Pre-earnings positioning */}
            <section style={{ background: "#1E293B", border: "2px solid " + stanceColor(note.preEarningsPositioning.recommendation), borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={sectionH}>Pre-Earnings Positioning</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                <Field label="Recommendation" value={note.preEarningsPositioning.recommendation.toUpperCase().replace(/-/g, " ")} valueColor={stanceColor(note.preEarningsPositioning.recommendation)} />
                <Field label="Risk Level" value={note.preEarningsPositioning.riskLevel} valueColor={riskColor(note.preEarningsPositioning.riskLevel)} />
                <Field label="Sizing" value={note.preEarningsPositioning.sizing} />
                <Field label="Structure" value={note.preEarningsPositioning.structure} />
              </div>
              <div style={{ fontSize: 13, color: "#CBD5E1", borderTop: "1px solid #334155", paddingTop: 10 }}>{note.preEarningsPositioning.rationale}</div>
            </section>

            {/* Post-earnings playbook */}
            <section style={{ marginBottom: 16 }}>
              <h3 style={{ ...sectionH, marginBottom: 8 }}>Post-Earnings Playbook</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {note.postEarningsPlaybook.map((s, i) => {
                  const c = s.scenario === "gap-up" ? "#10B981" : s.scenario === "gap-down" ? "#EF4444" : "#94A3B8";
                  return (
                    <div key={i} style={{ background: "#1E293B", border: "1px solid " + c, borderRadius: 8, padding: 14 }}>
                      <div style={{ fontWeight: 700, color: c, fontSize: 14, textTransform: "uppercase", marginBottom: 8 }}>{s.scenario.replace(/-/g, " ")}</div>
                      <Field label="Trigger" value={s.trigger} />
                      <Field label="Playbook" value={s.playbook} />
                      <Field label="Invalidation" value={s.invalidation} />
                      <Field label="Sizing" value={s.positionSizingNote} />
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Confirms / Invalidates / Main Risk */}
            <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
              <Card title="What Confirms">
                <ul style={listStyle}>{note.whatConfirms.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </Card>
              <Card title="What Invalidates">
                <ul style={listStyle}>{note.whatInvalidates.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </Card>
              <Card title="Main Risk">
                <div style={{ fontSize: 13, color: "#FECACA" }}>{note.mainRisk}</div>
              </Card>
            </section>

            {/* Closing + diagnostics */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={sectionH}>Closing</h3>
              <p style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.6 }}>{note.closingParagraph}</p>
              <div style={{ borderTop: "1px solid #334155", marginTop: 12, paddingTop: 12, fontSize: 11, color: "#64748B" }}>
                <div><strong>Confidence:</strong> {resp.meta.confidence} — {resp.meta.confidenceReason}</div>
                <div><strong>Source:</strong> {resp.meta.source}</div>
                <div><strong>Fetched:</strong> {resp.meta.fetchedAt} ({resp.meta.freshness})</div>
                <div><strong>Missing fields:</strong> {resp.meta.missingFields.join(", ")}</div>
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: "#64748B", fontStyle: "italic" }}>{note.disclaimer}</div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { background: "#0F172A", border: "1px solid #334155", color: "#E2E8F0", padding: "8px 10px", borderRadius: 4, fontSize: 13, marginTop: 4 };
const btnStyle: React.CSSProperties = { background: "#10B981", color: "#0F172A", padding: "10px 16px", borderRadius: 4, border: "none", fontWeight: 600, fontSize: 14 };
const sectionH: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: "#F1F5F9", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 0.5 };
const pillStyle: React.CSSProperties = { padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, letterSpacing: 0.5 };
const th: React.CSSProperties = { padding: "8px 6px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: "8px 6px", color: "#E2E8F0" };
const listStyle: React.CSSProperties = { margin: 0, paddingLeft: 20, fontSize: 12, color: "#CBD5E1", lineHeight: 1.6 };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#F1F5F9", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 14 }}>
      <h3 style={sectionH}>{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 12, color: valueColor || "#E2E8F0", fontWeight: valueColor ? 600 : 400 }}>{value}</div>
    </div>
  );
}
