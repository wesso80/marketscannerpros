"use client";

/**
 * /admin/sector-rotation
 *
 * Citadel-style sector rotation memo. Operator-grade overweight /
 * underweight calls + a model allocation pie summing to 100%.
 */

import React, { useState } from "react";

interface RankRow {
  ticker: string;
  sector: string;
  classification: string;
  return1mPct: number | null;
  return3mPct: number | null;
  return6mPct: number | null;
  rs1mPct: number | null;
  rs3mPct: number | null;
  rs6mPct: number | null;
  rsCompositeScore: number | null;
  stance: "overweight" | "neutral" | "underweight";
  rationale: string;
}
interface AllocRow {
  ticker: string;
  sector: string;
  allocationPct: number;
  role: string;
  rationale: string;
}
interface SectorMemo {
  generatedAt: string;
  decisionSummary: {
    headline: string;
    cyclePhase: string;
    cycleConfidence: string;
    riskRegime: string;
    fedDirection: string;
    topOverweights: string[];
    topUnderweights: string[];
  };
  opportunityScore: number;
  evidenceQualityScore: number;
  personalExposureFlag: string;
  confidenceStatement: string;
  whatConfirms: string[];
  whatInvalidates: string[];
  mainRisk: string;
  economicCycle: { positioning: string; leadingIndicatorsRead: string; historicalAnalogue: string };
  rateImpact: { summary: string; beneficiaries: string[]; losers: string[]; yieldCurveRead: string };
  earningsGrowthComparison: { available: boolean; note: string; qualitativeRead: string };
  valuationComparison: { available: boolean; note: string; priceExtensionProxy: Array<{ ticker: string; vsSma200Pct: number | null; signal: string }> };
  moneyFlow: { available: boolean; note: string; rsBasedProxy: string };
  defensiveOffensiveRead: { leadership: string; breadthRead: string; verdict: string };
  sectorRankings: RankRow[];
  etfPicks: Array<{ sector: string; ticker: string; expenseRatioPct: number; rationale: string }>;
  modelAllocation: { totalCheckPct: number; rows: AllocRow[]; rebalanceNotes: string };
  implementationPlan: { sequencing: string; triggers: string[]; invalidationLevels: string[] };
  closingParagraph: string;
  classification: string;
  disclaimer: string;
}
interface ApiResponse {
  data: { memo: SectorMemo | null; snapshot: unknown; aiError?: string };
  meta: {
    source: string; fetchedAt: string; freshness: string; simulated: boolean;
    missingFields: string[]; confidence: string; confidenceReason: string;
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
  if (s === "overweight") return "#10B981";
  if (s === "underweight") return "#EF4444";
  return "#94A3B8";
};
const regimeColor = (s: string): string => {
  if (s === "risk-on") return "#10B981";
  if (s === "risk-off") return "#EF4444";
  if (s === "transition") return "#F59E0B";
  return "#94A3B8";
};
const phaseColor = (s: string): string => {
  if (s === "expansion") return "#10B981";
  if (s === "peak") return "#F59E0B";
  if (s === "contraction") return "#EF4444";
  if (s === "trough") return "#60A5FA";
  return "#94A3B8";
};
const roleColor = (s: string): string => {
  if (s === "core-overweight") return "#10B981";
  if (s === "tactical-tilt") return "#60A5FA";
  if (s === "underweight") return "#EF4444";
  if (s === "hedge") return "#EC4899";
  if (s === "cash") return "#FBBF24";
  return "#94A3B8";
};
const fmtPct = (n: number | null | undefined): string =>
  n == null ? "n/a" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

export default function SectorRotationPage() {
  const [risk, setRisk] = useState<"conservative" | "moderate" | "aggressive">("moderate");
  const [horizon, setHorizon] = useState("6-12 months");
  const [exposures, setExposures] = useState("");
  const [exposure, setExposure] = useState<"none" | "low" | "elevated" | "high">("none");
  const [operatorNotes, setOperatorNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setError(null); setResp(null);
    try {
      const r = await fetch("/api/admin/sector-rotation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          riskTolerance: risk,
          timeHorizon: horizon,
          currentExposures: exposures,
          personalExposureFlag: exposure,
          operatorNotes: operatorNotes || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || j.detail || `HTTP ${r.status}`);
        if (j.data) setResp(toEnvelope(j));
      } else setResp(toEnvelope(j));
    } catch (e) {
      setError(e instanceof Error ? e.message : "request_failed");
    } finally { setLoading(false); }
  };

  const memo = resp?.data?.memo ?? null;

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", color: "#E2E8F0", padding: 24, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#F1F5F9", margin: 0 }}>Sector Rotation</h1>
          <p style={{ color: "#94A3B8", marginTop: 4 }}>Citadel-style memo across the 11 GICS sectors via SPDR ETFs. Decision summary + ranking table + model allocation.</p>
        </header>

        {/* Input panel */}
        <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: "#94A3B8" }}>
              Risk Tolerance
              <select value={risk} onChange={(e) => setRisk(e.target.value as "conservative" | "moderate" | "aggressive")} style={inputStyle}>
                <option value="conservative">conservative</option>
                <option value="moderate">moderate</option>
                <option value="aggressive">aggressive</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: "#94A3B8" }}>
              Time Horizon
              <input value={horizon} onChange={(e) => setHorizon(e.target.value.slice(0, 200))} style={inputStyle} />
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
              <button onClick={run} disabled={loading} style={{ ...btnStyle, opacity: loading ? 0.6 : 1, cursor: loading ? "wait" : "pointer", width: "100%" }}>
                {loading ? "Analysing…" : "Generate Memo"}
              </button>
            </div>
          </div>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: "#94A3B8", marginTop: 12 }}>
            Current Sector Exposures (free text — e.g. "30% XLK, 20% XLF, 15% XLV, 35% cash")
            <input value={exposures} onChange={(e) => setExposures(e.target.value.slice(0, 800))} style={inputStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: "#94A3B8", marginTop: 12 }}>
            Operator Notes (optional)
            <textarea value={operatorNotes} onChange={(e) => setOperatorNotes(e.target.value.slice(0, 1500))} rows={2} style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", resize: "vertical" }} />
          </label>
        </section>

        {error && (
          <div style={{ background: "#7F1D1D", border: "1px solid #B91C1C", color: "#FECACA", padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {resp && !memo && (
          <div style={{ background: "#1E293B", border: "1px solid #F59E0B", borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 13, color: "#E2E8F0" }}>
            <div style={{ color: "#FBBF24", fontWeight: 700, marginBottom: 8 }}>Memo not produced — diagnostic snapshot</div>
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

        {memo && resp && (
          <>
            {/* Decision Summary */}
            <section style={{ background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)", border: "2px solid " + regimeColor(memo.decisionSummary.riskRegime), borderRadius: 10, padding: 20, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 320 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    <Pill label={memo.decisionSummary.cyclePhase.toUpperCase()} color={phaseColor(memo.decisionSummary.cyclePhase)} />
                    <Pill label={memo.decisionSummary.riskRegime.toUpperCase()} color={regimeColor(memo.decisionSummary.riskRegime)} />
                    <Pill label={`Fed: ${memo.decisionSummary.fedDirection}`} color="#60A5FA" />
                    <Pill label={`Cycle conf: ${memo.decisionSummary.cycleConfidence}`} color="#94A3B8" />
                  </div>
                  <p style={{ color: "#F1F5F9", margin: "0 0 12px", fontSize: 16, lineHeight: 1.5, fontWeight: 500 }}>{memo.decisionSummary.headline}</p>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, borderTop: "1px solid #334155", paddingTop: 12 }}>
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
              </div>
            </section>

            {/* Score strip */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              <Stat label="Opportunity" value={`${memo.opportunityScore}/100`} />
              <Stat label="Evidence Quality" value={`${memo.evidenceQualityScore}/100`} />
              <Stat label="Personal Exposure" value={memo.personalExposureFlag} />
              <Stat label="Confidence" value={resp.meta.confidence} />
            </section>

            {/* Sector Rankings table */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={sectionH}>Sector Rankings (sorted by composite RS)</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #334155", color: "#94A3B8", textAlign: "left" }}>
                      <th style={th}>ETF</th>
                      <th style={th}>Sector</th>
                      <th style={th}>Class</th>
                      <th style={th}>1m</th>
                      <th style={th}>3m</th>
                      <th style={th}>6m</th>
                      <th style={th}>RS 1m</th>
                      <th style={th}>RS 3m</th>
                      <th style={th}>RS 6m</th>
                      <th style={th}>Composite</th>
                      <th style={th}>Stance</th>
                      <th style={{ ...th, minWidth: 240 }}>Rationale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...memo.sectorRankings].sort((a, b) => (b.rsCompositeScore ?? -999) - (a.rsCompositeScore ?? -999)).map((r) => (
                      <tr key={r.ticker} style={{ borderBottom: "1px solid #1E293B" }}>
                        <td style={{ ...td, fontWeight: 700 }}>{r.ticker}</td>
                        <td style={td}>{r.sector}</td>
                        <td style={{ ...td, color: "#64748B", fontSize: 11 }}>{r.classification}</td>
                        <td style={{ ...td, color: r.return1mPct != null && r.return1mPct > 0 ? "#10B981" : "#EF4444" }}>{fmtPct(r.return1mPct)}</td>
                        <td style={{ ...td, color: r.return3mPct != null && r.return3mPct > 0 ? "#10B981" : "#EF4444" }}>{fmtPct(r.return3mPct)}</td>
                        <td style={{ ...td, color: r.return6mPct != null && r.return6mPct > 0 ? "#10B981" : "#EF4444" }}>{fmtPct(r.return6mPct)}</td>
                        <td style={{ ...td, color: r.rs1mPct != null && r.rs1mPct > 0 ? "#10B981" : "#EF4444" }}>{fmtPct(r.rs1mPct)}</td>
                        <td style={{ ...td, color: r.rs3mPct != null && r.rs3mPct > 0 ? "#10B981" : "#EF4444" }}>{fmtPct(r.rs3mPct)}</td>
                        <td style={{ ...td, color: r.rs6mPct != null && r.rs6mPct > 0 ? "#10B981" : "#EF4444" }}>{fmtPct(r.rs6mPct)}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{r.rsCompositeScore ?? "n/a"}</td>
                        <td style={td}>
                          <span style={{ background: stanceColor(r.stance) + "33", color: stanceColor(r.stance), padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{r.stance}</span>
                        </td>
                        <td style={{ ...td, color: "#CBD5E1", fontSize: 11 }}>{r.rationale}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Model Allocation */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={sectionH}>Model Allocation (sum: {memo.modelAllocation.totalCheckPct}%)</h3>
              {/* Allocation bar */}
              <div style={{ display: "flex", height: 32, borderRadius: 4, overflow: "hidden", marginBottom: 16, background: "#0F172A" }}>
                {memo.modelAllocation.rows.map((r, i) => (
                  <div key={i} title={`${r.ticker}: ${r.allocationPct}%`} style={{ width: `${r.allocationPct}%`, background: roleColor(r.role), display: "flex", alignItems: "center", justifyContent: "center", color: "#0F172A", fontSize: 10, fontWeight: 700, borderRight: "1px solid #0F172A" }}>
                    {r.allocationPct >= 6 && r.ticker}
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                {memo.modelAllocation.rows.map((r, i) => (
                  <div key={i} style={{ background: "#0F172A", border: "1px solid " + roleColor(r.role), borderLeft: "4px solid " + roleColor(r.role), borderRadius: 4, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "#F1F5F9" }}>{r.ticker}</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: roleColor(r.role) }}>{r.allocationPct}%</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>{r.sector} · {r.role}</div>
                    <div style={{ fontSize: 12, color: "#CBD5E1" }}>{r.rationale}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, padding: 10, background: "#0F172A", borderRadius: 4, fontSize: 12, color: "#CBD5E1" }}>
                <strong style={{ color: "#FBBF24" }}>Rebalance:</strong> {memo.modelAllocation.rebalanceNotes}
              </div>
            </section>

            {/* ETF Picks */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={sectionH}>ETF Implementation Guide</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
                {memo.etfPicks.map((p, i) => (
                  <div key={i} style={{ background: "#0F172A", border: "1px solid #334155", borderRadius: 4, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontWeight: 700, color: "#F1F5F9" }}>{p.ticker} — {p.sector}</span>
                      <span style={{ fontSize: 11, color: "#94A3B8" }}>exp {p.expenseRatioPct.toFixed(2)}%</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>{p.rationale}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Cycle / Rate / Defensive-Offensive */}
            <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
              <Card title="Economic Cycle">
                <Field label="Positioning" value={memo.economicCycle.positioning} />
                <Field label="Leading indicators" value={memo.economicCycle.leadingIndicatorsRead} />
                <Field label="Historical analogue" value={memo.economicCycle.historicalAnalogue} />
              </Card>
              <Card title="Interest Rate Impact">
                <Field label="Summary" value={memo.rateImpact.summary} />
                <Field label="Beneficiaries" value={memo.rateImpact.beneficiaries.join(", ") || "n/a"} valueColor="#10B981" />
                <Field label="Losers" value={memo.rateImpact.losers.join(", ") || "n/a"} valueColor="#EF4444" />
                <Field label="Yield curve" value={memo.rateImpact.yieldCurveRead} />
              </Card>
              <Card title="Defensive vs Offensive">
                <Field label="Leadership" value={memo.defensiveOffensiveRead.leadership} />
                <Field label="Breadth read" value={memo.defensiveOffensiveRead.breadthRead} />
                <Field label="Verdict" value={memo.defensiveOffensiveRead.verdict} valueColor={memo.defensiveOffensiveRead.verdict === "lean-offensive" ? "#10B981" : memo.defensiveOffensiveRead.verdict === "lean-defensive" ? "#EF4444" : "#FBBF24"} />
              </Card>
            </section>

            {/* Missing-data sections */}
            <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
              <MissingCard title="Earnings Growth Comparison" note={memo.earningsGrowthComparison.note} body={memo.earningsGrowthComparison.qualitativeRead} />
              <MissingCard title="Valuation Comparison" note={memo.valuationComparison.note} body={
                <div>
                  {memo.valuationComparison.priceExtensionProxy.map((p, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid #1E293B" }}>
                      <span style={{ color: "#E2E8F0", fontWeight: 600 }}>{p.ticker}</span>
                      <span style={{ color: p.vsSma200Pct != null && p.vsSma200Pct > 0 ? "#10B981" : "#EF4444" }}>{fmtPct(p.vsSma200Pct)} · {p.signal}</span>
                    </div>
                  ))}
                </div>
              } />
              <MissingCard title="Money Flow" note={memo.moneyFlow.note} body={memo.moneyFlow.rsBasedProxy} />
            </section>

            {/* Implementation */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={sectionH}>Implementation Plan</h3>
              <Field label="Sequencing" value={memo.implementationPlan.sequencing} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#10B981", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Triggers (act if seen)</div>
                  <ul style={listStyle}>{memo.implementationPlan.triggers.map((t, i) => <li key={i}>{t}</li>)}</ul>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#EF4444", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Invalidation (abandon if seen)</div>
                  <ul style={listStyle}>{memo.implementationPlan.invalidationLevels.map((t, i) => <li key={i}>{t}</li>)}</ul>
                </div>
              </div>
            </section>

            {/* Confirms / Invalidates / Main Risk */}
            <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
              <Card title="What Confirms"><ul style={listStyle}>{memo.whatConfirms.map((c, i) => <li key={i}>{c}</li>)}</ul></Card>
              <Card title="What Invalidates"><ul style={listStyle}>{memo.whatInvalidates.map((c, i) => <li key={i}>{c}</li>)}</ul></Card>
              <Card title="Main Risk"><div style={{ fontSize: 13, color: "#FECACA" }}>{memo.mainRisk}</div></Card>
            </section>

            {/* Closing + diagnostics */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={sectionH}>Closing</h3>
              <p style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.6 }}>{memo.closingParagraph}</p>
              <div style={{ borderTop: "1px solid #334155", marginTop: 12, paddingTop: 12, fontSize: 11, color: "#64748B" }}>
                <div><strong>Confidence:</strong> {resp.meta.confidence} — {resp.meta.confidenceReason}</div>
                <div><strong>Source:</strong> {resp.meta.source}</div>
                <div><strong>Fetched:</strong> {resp.meta.fetchedAt} ({resp.meta.freshness})</div>
                <div><strong>Missing:</strong> {resp.meta.missingFields.join(", ")}</div>
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: "#64748B", fontStyle: "italic" }}>{memo.disclaimer}</div>
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
const th: React.CSSProperties = { padding: "8px 6px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: "7px 6px", color: "#E2E8F0" };
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
function Pill({ label, color }: { label: string; color: string }) {
  return <span style={{ background: color + "33", color, border: "1px solid " + color, padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>{label}</span>;
}
function MissingCard({ title, note, body }: { title: string; note: string; body: React.ReactNode }) {
  return (
    <div style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 14 }}>
      <h3 style={sectionH}>{title}</h3>
      <div style={{ background: "#7F1D1D33", border: "1px solid #B91C1C", color: "#FECACA", padding: 8, borderRadius: 4, fontSize: 11, marginBottom: 8 }}>
        {note || "Not in packet — Alpha Vantage limitation."}
      </div>
      <div style={{ fontSize: 12, color: "#CBD5E1" }}>{body}</div>
    </div>
  );
}
