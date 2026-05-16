"use client";

/**
 * /admin/macro-outlook
 *
 * MSP macro market outlook. Operator-grade 3-6 month positioning view
 * across economic indicators, Fed policy, credit, breadth (SPY proxy),
 * sentiment (VIX), seasonal & geopolitical context. Research only —
 * the system does not place, route, or auto-execute orders.
 */

import React, { useState } from "react";

interface DashboardRow {
  metric: string;
  latest: string;
  asOf: string;
  signal: "bullish" | "bearish" | "neutral" | "unavailable";
  read: string;
}
interface PositioningCall {
  bucket: string;
  stance: "overweight" | "neutral" | "underweight" | "hedge";
  weightChange: string;
  rationale: string;
  invalidation: string;
}
interface MacroMemo {
  generatedAt: string;
  decisionSummary: {
    headline: string;
    horizon: "3-month" | "6-month" | "tactical-2-week";
    overallStance: "risk-on" | "risk-off" | "neutral" | "barbell" | "defensive-tilt";
    confidence: "high" | "moderate" | "low";
    topOverweights: string[];
    topUnderweights: string[];
    keyHedges: string[];
  };
  opportunityScore: number;
  evidenceQualityScore: number;
  personalExposureFlag: string;
  confidenceStatement: string;
  whatConfirms: string[];
  whatInvalidates: string[];
  mainRisk: string;
  dashboard: DashboardRow[];
  economicIndicators: {
    available: boolean;
    summary: string;
    gdpGrowthRead: string;
    unemploymentRead: string;
    inflationRead: string;
    consumerSpendingRead: string;
  };
  fedAnalysis: {
    currentStance: "tightening" | "easing" | "hold" | "unknown";
    fedFundsRatePct: number | null;
    fedFundsDelta1mBps: number | null;
    rateDecisionProbabilityRead: string;
    qtImpactRead: string;
  };
  earningsOutlook: { available: false; note: string; priceTrendProxy: string };
  valuationAssessment: { available: false; note: string; extensionProxy: string };
  creditMarketSignals: {
    hyOasPct: number | null;
    hyOasDelta1mBps: number | null;
    igOasAvailable: false;
    read: string;
    signal: "risk-on" | "risk-off" | "neutral";
  };
  marketBreadth: {
    constituentBreadthAvailable: false;
    spyProxyAbove200dPct: number | null;
    advanceDeclineRead: string;
    proxyVerdict: "expanding" | "narrowing" | "thrust" | "deteriorating" | "unknown";
    proxyNote: string;
  };
  sentimentIndicators: {
    vix: number | null;
    vixRegime: "complacent" | "normal" | "elevated" | "extreme" | "unknown";
    putCallRatioAvailable: false;
    aaiiSurveyAvailable: false;
    cnnFearGreedAvailable: false;
    note: string;
  };
  geopoliticalRisks: {
    operatorSupplied: boolean;
    summary: string;
    flaggedFactors: string[];
  };
  seasonalPatterns: {
    monthOrPeriod: string;
    historicalRead: string;
    confidence: "high" | "moderate" | "low";
  };
  positioning: {
    rebalanceSummary: string;
    calls: PositioningCall[];
    outlookInvalidationTriggers: string[];
  };
  closingParagraph: string;
  classification: string;
  disclaimer: string;
}
interface ApiResponse {
  data: { memo: MacroMemo | null; snapshot: unknown; aiError?: string };
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

// wrapTruth() returns truth fields at top-level; adapt to nested {data, meta}.
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
  if (s === "overweight") return "#10B981";
  if (s === "underweight") return "#EF4444";
  if (s === "hedge") return "#EC4899";
  return "#94A3B8";
};
const overallStanceColor = (s: string): string => {
  if (s === "risk-on") return "#10B981";
  if (s === "risk-off") return "#EF4444";
  if (s === "barbell") return "#A855F7";
  if (s === "defensive-tilt") return "#F59E0B";
  return "#94A3B8";
};
const signalColor = (s: string): string => {
  if (s === "bullish") return "#10B981";
  if (s === "bearish") return "#EF4444";
  if (s === "unavailable") return "#64748B";
  return "#94A3B8";
};
const fedColor = (s: string): string => {
  if (s === "easing") return "#10B981";
  if (s === "tightening") return "#EF4444";
  if (s === "hold") return "#60A5FA";
  return "#94A3B8";
};
const vixColor = (s: string): string => {
  if (s === "complacent") return "#10B981";
  if (s === "normal") return "#60A5FA";
  if (s === "elevated") return "#F59E0B";
  if (s === "extreme") return "#EF4444";
  return "#94A3B8";
};
const verdictColor = (s: string): string => {
  if (s === "expanding" || s === "thrust") return "#10B981";
  if (s === "deteriorating") return "#EF4444";
  if (s === "narrowing") return "#F59E0B";
  return "#94A3B8";
};
const fmtPct = (n: number | null | undefined): string =>
  n == null ? "n/a" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const fmtBps = (n: number | null | undefined): string =>
  n == null ? "n/a" : `${n > 0 ? "+" : ""}${n.toFixed(0)} bps`;

export default function MacroOutlookPage() {
  const [horizon, setHorizon] = useState<"3-month" | "6-month" | "tactical-2-week">("3-month");
  const [risk, setRisk] = useState<"conservative" | "moderate" | "aggressive">("moderate");
  const [exposures, setExposures] = useState("");
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
      const r = await fetch("/api/admin/macro-outlook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          horizon,
          riskTolerance: risk,
          currentExposures: exposures,
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

  const memo = resp?.data?.memo ?? null;

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", color: "#E2E8F0", padding: 24, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#F1F5F9", margin: 0 }}>Macro Outlook</h1>
          <p style={{ color: "#94A3B8", marginTop: 4 }}>
            MSP macro market outlook · 3-6 month horizon · operator-grade · system does not execute.
          </p>
        </header>

        {/* Input panel */}
        <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            <label style={labelStyle}>
              Horizon
              <select value={horizon} onChange={(e) => setHorizon(e.target.value as typeof horizon)} style={inputStyle}>
                <option value="tactical-2-week">tactical-2-week</option>
                <option value="3-month">3-month</option>
                <option value="6-month">6-month</option>
              </select>
            </label>
            <label style={labelStyle}>
              Risk Tolerance
              <select value={risk} onChange={(e) => setRisk(e.target.value as typeof risk)} style={inputStyle}>
                <option value="conservative">conservative</option>
                <option value="moderate">moderate</option>
                <option value="aggressive">aggressive</option>
              </select>
            </label>
            <label style={labelStyle}>
              Personal Exposure
              <select value={exposure} onChange={(e) => setExposure(e.target.value as typeof exposure)} style={inputStyle}>
                <option value="none">none</option>
                <option value="low">low</option>
                <option value="elevated">elevated</option>
                <option value="high">high</option>
              </select>
            </label>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                onClick={run}
                disabled={loading}
                style={{ ...btnStyle, opacity: loading ? 0.6 : 1, cursor: loading ? "wait" : "pointer", width: "100%" }}
              >
                {loading ? "Analysing…" : "Generate Outlook"}
              </button>
            </div>
          </div>
          <label style={{ ...labelStyle, marginTop: 12 }}>
            Current Cross-Asset Exposures (free text — e.g. "60% equities, 25% IG bonds, 10% gold, 5% cash")
            <input
              value={exposures}
              onChange={(e) => setExposures(e.target.value.slice(0, 800))}
              style={inputStyle}
            />
          </label>
          <label style={{ ...labelStyle, marginTop: 12 }}>
            Operator Notes (optional — geopolitical context, election/policy concerns, sleepless-night questions)
            <textarea
              value={operatorNotes}
              onChange={(e) => setOperatorNotes(e.target.value.slice(0, 2000))}
              rows={2}
              style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", resize: "vertical" }}
            />
          </label>
        </section>

        {error && (
          <div style={{ background: "#7F1D1D", border: "1px solid #B91C1C", color: "#FECACA", padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {resp && !memo && (
          <div style={{ background: "#1E293B", border: "1px solid #F59E0B", borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 13, color: "#E2E8F0" }}>
            <div style={{ color: "#FBBF24", fontWeight: 700, marginBottom: 8 }}>Outlook not produced — diagnostic snapshot</div>
            <div style={{ marginBottom: 4 }}><strong>AI error:</strong> {resp.data.aiError ?? "none"}</div>
            <div style={{ marginBottom: 4 }}><strong>Confidence:</strong> {resp.meta.confidence} — {resp.meta.confidenceReason}</div>
            <div style={{ marginBottom: 4 }}><strong>Freshness:</strong> {resp.meta.freshness} · <strong>Source:</strong> {resp.meta.source}</div>
            <div style={{ marginBottom: 8 }}><strong>Missing:</strong> {resp.meta.missingFields.join(" · ") || "none"}</div>
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", color: "#94A3B8" }}>Raw snapshot (click to expand)</summary>
              <pre style={{ marginTop: 8, padding: 8, background: "#0F172A", borderRadius: 6, fontSize: 11, overflow: "auto", maxHeight: 400 }}>
                {JSON.stringify(resp.data.snapshot, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {memo && resp && (
          <>
            {/* Decision Summary */}
            <section style={{ background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)", border: "2px solid " + overallStanceColor(memo.decisionSummary.overallStance), borderRadius: 10, padding: 20, marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <Pill label={memo.decisionSummary.overallStance.toUpperCase()} color={overallStanceColor(memo.decisionSummary.overallStance)} />
                <Pill label={`Horizon: ${memo.decisionSummary.horizon}`} color="#60A5FA" />
                <Pill label={`Confidence: ${memo.decisionSummary.confidence}`} color="#94A3B8" />
              </div>
              <p style={{ color: "#F1F5F9", margin: "0 0 16px", fontSize: 16, lineHeight: 1.5, fontWeight: 500 }}>
                {memo.decisionSummary.headline}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, borderTop: "1px solid #334155", paddingTop: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#10B981", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Top Overweights</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {memo.decisionSummary.topOverweights.map((t) => (
                      <span key={t} style={{ background: "#10B98133", color: "#10B981", padding: "4px 10px", borderRadius: 4, fontWeight: 700, fontSize: 13 }}>{t}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#EF4444", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Top Underweights</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {memo.decisionSummary.topUnderweights.map((t) => (
                      <span key={t} style={{ background: "#EF444433", color: "#EF4444", padding: "4px 10px", borderRadius: 4, fontWeight: 700, fontSize: 13 }}>{t}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#EC4899", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Key Hedges</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {memo.decisionSummary.keyHedges.length === 0 ? (
                      <span style={{ color: "#64748B", fontSize: 12 }}>none</span>
                    ) : memo.decisionSummary.keyHedges.map((t) => (
                      <span key={t} style={{ background: "#EC489933", color: "#EC4899", padding: "4px 10px", borderRadius: 4, fontWeight: 700, fontSize: 13 }}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Score strip */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              <Stat label="Opportunity" value={`${memo.opportunityScore}/100`} />
              <Stat label="Evidence Quality" value={`${memo.evidenceQualityScore}/100`} />
              <Stat label="Personal Exposure" value={memo.personalExposureFlag} />
              <Stat label="Confidence" value={resp.meta.confidence} />
            </section>

            {/* Macro Dashboard */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={sectionH}>Macro Dashboard</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #334155", color: "#94A3B8", textAlign: "left" }}>
                      <th style={th}>Metric</th>
                      <th style={th}>Latest</th>
                      <th style={th}>As Of</th>
                      <th style={th}>Signal</th>
                      <th style={{ ...th, width: "55%" }}>Read</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memo.dashboard.map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #1E293B" }}>
                        <td style={{ ...td, fontWeight: 700 }}>{row.metric}</td>
                        <td style={td}>{row.latest}</td>
                        <td style={{ ...td, color: "#64748B", fontSize: 11 }}>{row.asOf}</td>
                        <td style={td}>
                          <span style={{ background: signalColor(row.signal) + "33", color: signalColor(row.signal), padding: "3px 8px", borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                            {row.signal.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ ...td, color: "#CBD5E1" }}>{row.read}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Fed + Credit + Breadth + Sentiment grid */}
            <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <Card title="Federal Reserve">
                <Field label="Current Stance" value={memo.fedAnalysis.currentStance.toUpperCase()} valueColor={fedColor(memo.fedAnalysis.currentStance)} />
                <Field label="Fed Funds Rate" value={memo.fedAnalysis.fedFundsRatePct == null ? "n/a" : `${memo.fedAnalysis.fedFundsRatePct.toFixed(2)}%`} />
                <Field label="Δ 1m (bps)" value={fmtBps(memo.fedAnalysis.fedFundsDelta1mBps)} />
                <Field label="Rate Decision Read" value={memo.fedAnalysis.rateDecisionProbabilityRead} />
                <Field label="QT / Liquidity Impact" value={memo.fedAnalysis.qtImpactRead} />
              </Card>
              <Card title="Credit Market Signals">
                <Field label="HY OAS" value={memo.creditMarketSignals.hyOasPct == null ? "n/a" : `${memo.creditMarketSignals.hyOasPct.toFixed(2)}%`} />
                <Field label="Δ 1m" value={fmtBps(memo.creditMarketSignals.hyOasDelta1mBps)} />
                <Field label="Signal" value={memo.creditMarketSignals.signal.toUpperCase()} valueColor={overallStanceColor(memo.creditMarketSignals.signal)} />
                <Field label="Read" value={memo.creditMarketSignals.read} />
                <div style={notAvailNote}>IG (LQD) OAS not in packet — flag.</div>
              </Card>
              <Card title="Market Breadth (SPY proxy)">
                <Field label="SPY > 200d Proxy" value={fmtPct(memo.marketBreadth.spyProxyAbove200dPct)} />
                <Field label="Verdict" value={memo.marketBreadth.proxyVerdict.toUpperCase()} valueColor={verdictColor(memo.marketBreadth.proxyVerdict)} />
                <Field label="Note" value={memo.marketBreadth.proxyNote} />
                <Field label="A/D Read" value={memo.marketBreadth.advanceDeclineRead} />
                <div style={notAvailNote}>True constituent breadth (% of S&P above 200d, A/D line) not in packet — flag.</div>
              </Card>
              <Card title="Sentiment">
                <Field label="VIX" value={memo.sentimentIndicators.vix == null ? "n/a" : memo.sentimentIndicators.vix.toFixed(2)} />
                <Field label="Regime" value={memo.sentimentIndicators.vixRegime.toUpperCase()} valueColor={vixColor(memo.sentimentIndicators.vixRegime)} />
                <Field label="Note" value={memo.sentimentIndicators.note} />
                <div style={notAvailNote}>Put/call ratio, AAII survey, CNN Fear & Greed not in packet — flag.</div>
              </Card>
            </section>

            {/* Economic Indicators + Earnings + Valuation */}
            <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
              <Card title="Economic Indicators">
                <Field label="Summary" value={memo.economicIndicators.summary} />
                <Field label="Unemployment" value={memo.economicIndicators.unemploymentRead} />
                <Field label="Inflation (CPI YoY)" value={memo.economicIndicators.inflationRead} />
                <div style={notAvailNote}>GDP growth, consumer spending: {memo.economicIndicators.gdpGrowthRead}</div>
              </Card>
              <MissingCard
                title="Earnings Outlook"
                note={memo.earningsOutlook.note}
                body={<div><strong>Price-trend proxy:</strong> {memo.earningsOutlook.priceTrendProxy}</div>}
              />
              <MissingCard
                title="Valuation Assessment"
                note={memo.valuationAssessment.note}
                body={<div><strong>Extension proxy:</strong> {memo.valuationAssessment.extensionProxy}</div>}
              />
            </section>

            {/* Geopolitical + Seasonal */}
            <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <Card title="Geopolitical Risks">
                <Field label="Operator-supplied" value={memo.geopoliticalRisks.operatorSupplied ? "yes" : "no"} />
                <Field label="Summary" value={memo.geopoliticalRisks.summary} />
                {memo.geopoliticalRisks.flaggedFactors.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>Flagged Factors</div>
                    <ul style={listStyle}>{memo.geopoliticalRisks.flaggedFactors.map((f, i) => <li key={i}>{f}</li>)}</ul>
                  </div>
                )}
              </Card>
              <Card title="Seasonal Patterns">
                <Field label="Period" value={memo.seasonalPatterns.monthOrPeriod} />
                <Field label="Historical Read" value={memo.seasonalPatterns.historicalRead} />
                <Field label="Confidence" value={memo.seasonalPatterns.confidence} />
                <div style={notAvailNote}>Qualitative only — no fabricated decade-precise stats.</div>
              </Card>
            </section>

            {/* Positioning */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={sectionH}>Positioning Calls</h3>
              <p style={{ fontSize: 13, color: "#CBD5E1", marginTop: 0, marginBottom: 12, lineHeight: 1.6 }}>
                {memo.positioning.rebalanceSummary}
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #334155", color: "#94A3B8", textAlign: "left" }}>
                      <th style={th}>Bucket</th>
                      <th style={th}>Stance</th>
                      <th style={th}>Weight Change</th>
                      <th style={{ ...th, width: "35%" }}>Rationale</th>
                      <th style={{ ...th, width: "30%" }}>Invalidation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memo.positioning.calls.map((c, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #1E293B" }}>
                        <td style={{ ...td, fontWeight: 700 }}>{c.bucket}</td>
                        <td style={td}>
                          <span style={{ background: stanceColor(c.stance) + "33", color: stanceColor(c.stance), padding: "3px 8px", borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                            {c.stance.toUpperCase()}
                          </span>
                        </td>
                        <td style={td}>{c.weightChange}</td>
                        <td style={{ ...td, color: "#CBD5E1" }}>{c.rationale}</td>
                        <td style={{ ...td, color: "#FECACA", fontSize: 11 }}>{c.invalidation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, borderTop: "1px solid #334155", paddingTop: 12 }}>
                <div style={{ fontSize: 11, color: "#EF4444", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Outlook Invalidation Triggers (abandon entire outlook if seen)
                </div>
                <ul style={listStyle}>
                  {memo.positioning.outlookInvalidationTriggers.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            </section>

            {/* Confirms / Invalidates / Main Risk */}
            <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
              <Card title="What Confirms">
                <ul style={listStyle}>{memo.whatConfirms.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </Card>
              <Card title="What Invalidates">
                <ul style={listStyle}>{memo.whatInvalidates.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </Card>
              <Card title="Main Risk">
                <div style={{ fontSize: 13, color: "#FECACA" }}>{memo.mainRisk}</div>
              </Card>
            </section>

            {/* Closing + diagnostics */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={sectionH}>Closing</h3>
              <p style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.6 }}>{memo.closingParagraph}</p>
              <div style={{ borderTop: "1px solid #334155", marginTop: 12, paddingTop: 12, fontSize: 11, color: "#64748B" }}>
                <div><strong>Confidence Statement:</strong> {memo.confidenceStatement}</div>
                <div style={{ marginTop: 4 }}><strong>Confidence:</strong> {resp.meta.confidence} — {resp.meta.confidenceReason}</div>
                <div><strong>Source:</strong> {resp.meta.source}</div>
                <div><strong>Fetched:</strong> {resp.meta.fetchedAt} ({resp.meta.freshness})</div>
                <div><strong>Missing:</strong> {resp.meta.missingFields.join(", ") || "none"}</div>
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: "#64748B", fontStyle: "italic" }}>{memo.disclaimer}</div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", fontSize: 12, color: "#94A3B8" };
const inputStyle: React.CSSProperties = { background: "#0F172A", border: "1px solid #334155", color: "#E2E8F0", padding: "8px 10px", borderRadius: 4, fontSize: 13, marginTop: 4 };
const btnStyle: React.CSSProperties = { background: "#10B981", color: "#0F172A", padding: "10px 16px", borderRadius: 4, border: "none", fontWeight: 600, fontSize: 14 };
const sectionH: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: "#F1F5F9", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 0.5 };
const th: React.CSSProperties = { padding: "8px 6px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: "7px 6px", color: "#E2E8F0", verticalAlign: "top" };
const listStyle: React.CSSProperties = { margin: 0, paddingLeft: 20, fontSize: 12, color: "#CBD5E1", lineHeight: 1.6 };
const notAvailNote: React.CSSProperties = { background: "#7F1D1D33", border: "1px solid #B91C1C", color: "#FECACA", padding: 6, borderRadius: 4, fontSize: 10, marginTop: 8 };

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
      <div style={{ fontSize: 12, color: valueColor || "#E2E8F0", fontWeight: valueColor ? 700 : 400 }}>{value}</div>
    </div>
  );
}
function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ background: color + "33", color, border: "1px solid " + color, padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
      {label}
    </span>
  );
}
function MissingCard({ title, note, body }: { title: string; note: string; body: React.ReactNode }) {
  return (
    <div style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 14 }}>
      <h3 style={sectionH}>{title}</h3>
      <div style={{ background: "#7F1D1D33", border: "1px solid #B91C1C", color: "#FECACA", padding: 8, borderRadius: 4, fontSize: 11, marginBottom: 8 }}>
        {note || "Not in packet — flag."}
      </div>
      <div style={{ fontSize: 12, color: "#CBD5E1" }}>{body}</div>
    </div>
  );
}
