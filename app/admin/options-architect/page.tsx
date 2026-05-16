"use client";

/**
 * /admin/options-architect
 *
 * D.E. Shaw-style options strategy memo. Operator inputs ticker +
 * directional view + horizon + risk budget; gets ONE recommended
 * strategy (legs/Greeks/P&L/breakeven/POP), payoff narrative, Greeks
 * interpretation, adjustment plan, exit rules, and alternatives
 * considered. Option prices, IV, and Greeks are REAL per-contract
 * values from AV HISTORICAL_OPTIONS (EOD T-1). Operator MUST
 * re-validate live at the broker before order entry.
 */

import React, { useState } from "react";

type Outlook = "bullish" | "bearish" | "neutral" | "volatile";
type StrategyCategory =
  | "covered-call" | "cash-secured-put" | "bull-call-spread" | "bear-put-spread"
  | "bull-put-spread" | "bear-call-spread" | "long-straddle" | "long-strangle"
  | "iron-condor" | "protective-put" | "collar";

interface OptionsLegOut {
  type: "call" | "put";
  side: "long" | "short";
  contractID: string;
  strike: number;
  dte: number;
  qty: number;
  bid: number;
  ask: number;
  mid: number;
  impliedVolatilityPct: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  volume: number;
  openInterest: number;
  liquidity: "high" | "ok" | "thin" | "no-quote";
  spreadPct: number | null;
}

interface OptionsArchitectMemo {
  generatedAt: string;
  decisionSummary: {
    headline: string;
    outlookCall: Outlook;
    recommendedStrategy: StrategyCategory;
    sizingCall: string;
    confidenceCall: "high" | "moderate" | "low";
  };
  opportunityScore: number;
  evidenceQualityScore: number;
  personalExposureFlag: string;
  confidenceStatement: string;
  whatConfirms: string[];
  whatInvalidates: string[];
  mainRisk: string;
  outlookAssessment: {
    underlyingPrice: number;
    impliedMoveOneSigma: number;
    hvRegime: string;
    ivVsHvNote: string;
    direction: Outlook;
    rationale: string;
  };
  tradeSetup: {
    category: StrategyCategory;
    description: string;
    legs: OptionsLegOut[];
    netCreditPerShare: number;
    netCreditPerContract: number;
    maxProfitPerContract: number | null;
    maxLossPerContract: number | null;
    breakevens: number[];
    marginEstimatePerContract: number;
    probabilityOfProfitPct: number | null;
    positionGreeks: { delta: number; gamma: number; theta: number; vega: number };
    contractsToOpen: number;
    totalCapitalAtRisk: number;
    worstLegLiquidity: "high" | "ok" | "thin" | "no-quote";
    avgSpreadPct: number | null;
    liquidityAssessment: string;
  };
  payoffNarrative: {
    bullCaseDescription: string;
    baseCaseDescription: string;
    bearCaseDescription: string;
    payoffTable: Array<{ priceAtExpiry: number; pnlPerContract: number; pnlPctOfRisk: number | null }>;
  };
  greeksAnalysis: {
    deltaInterpretation: string;
    thetaInterpretation: string;
    gammaInterpretation: string;
    vegaInterpretation: string;
  };
  adjustmentPlan: Array<{ trigger: string; action: string; rationale: string }>;
  exitRules: Array<{ condition: string; action: string; threshold: string }>;
  riskManagementRules: string[];
  alternativesConsidered: Array<{ category: StrategyCategory; description: string; whyConsidered: string; whyRejected: string }>;
  chainDataAsOfDate: string | null;
  chainContractCount: number;
  selectedExpiration: string | null;
  selectedExpirationDte: number | null;
  requiresLiveRepricing: { required: boolean; note: string };
  earlyExerciseRisk: { applies: boolean; note: string };
  classification: string;
  disclaimer: string;
}

interface ApiResponse {
  data: { memo: OptionsArchitectMemo | null; snapshot: unknown; aiError?: string };
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

const outlookColor = (o: string) => {
  switch (o) {
    case "bullish": return "#10B981";
    case "bearish": return "#EF4444";
    case "neutral": return "#94A3B8";
    case "volatile": return "#FBBF24";
    default: return "#94A3B8";
  }
};
const sideColor = (s: string) => (s === "long" ? "#10B981" : "#EF4444");
const regimeColor = (r: string) => {
  switch (r) {
    case "low": return "#10B981";
    case "normal": return "#60A5FA";
    case "elevated": return "#F59E0B";
    case "extreme": return "#EF4444";
    default: return "#94A3B8";
  }
};

export default function OptionsArchitectPage() {
  const [ticker, setTicker] = useState("AAPL");
  const [view, setView] = useState<Outlook>("neutral");
  const [horizon, setHorizon] = useState(30);
  const [budget, setBudget] = useState(5000);
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
      const r = await fetch("/api/admin/options-architect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.trim().toUpperCase(),
          directionalView: view,
          timeHorizonDays: horizon,
          riskBudgetUSD: budget,
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
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#F1F5F9", margin: 0 }}>Options Strategy Architect</h1>
          <p style={{ color: "#94A3B8", marginTop: 4 }}>
            D.E. Shaw-style options memo. Strategy candidates built from the REAL Alpha Vantage options chain (EOD T-1) — real bid/ask, per-contract IV, per-contract Greeks, OI, and volume. Operator MUST re-validate live at the broker before order entry.
          </p>
        </header>

        {/* Input panel */}
        <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr", gap: 12 }}>
            <label style={lblStyle}>
              Ticker
              <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} style={inputStyle} maxLength={10} />
            </label>
            <label style={lblStyle}>
              Directional View
              <select value={view} onChange={(e) => setView(e.target.value as Outlook)} style={inputStyle}>
                <option value="bullish">Bullish</option>
                <option value="bearish">Bearish</option>
                <option value="neutral">Neutral / range</option>
                <option value="volatile">Volatile / big move</option>
              </select>
            </label>
            <label style={lblStyle}>
              Horizon (days, 7-120)
              <input type="number" value={horizon} min={7} max={120} onChange={(e) => setHorizon(Math.max(7, Math.min(120, Number(e.target.value) || 30)))} style={inputStyle} />
            </label>
            <label style={lblStyle}>
              Risk Budget (USD)
              <input type="number" value={budget} min={100} step={500} onChange={(e) => setBudget(Math.max(100, Number(e.target.value) || 5000))} style={inputStyle} />
            </label>
            <label style={lblStyle}>
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
                {loading ? "Architecting…" : "Build Strategy"}
              </button>
            </div>
          </div>
          <label style={{ ...lblStyle, marginTop: 12 }}>
            Operator Notes (optional — earnings date, catalyst, IV expectation, position context)
            <textarea
              value={operatorNotes}
              onChange={(e) => setOperatorNotes(e.target.value.slice(0, 1500))}
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
          <div style={{ background: "#1E293B", border: "1px solid #F59E0B", borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 13 }}>
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
            {/* Decision Summary header */}
            <section style={{ background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)", border: "2px solid " + outlookColor(memo.decisionSummary.outlookCall), borderRadius: 10, padding: 20, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div style={{ flex: "1 1 60%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <h2 style={{ fontSize: 22, fontWeight: 700, color: "#F1F5F9", margin: 0 }}>
                      {ticker} — {memo.decisionSummary.recommendedStrategy.toUpperCase().replace(/-/g, " ")}
                    </h2>
                    <span style={{ ...pillStyle, background: outlookColor(memo.decisionSummary.outlookCall) + "33", color: outlookColor(memo.decisionSummary.outlookCall), border: "1px solid " + outlookColor(memo.decisionSummary.outlookCall) }}>
                      {memo.decisionSummary.outlookCall.toUpperCase()}
                    </span>
                    <span style={{ ...pillStyle, background: "#1E40AF33", color: "#93C5FD", border: "1px solid #1E40AF" }}>
                      {horizon}d horizon
                    </span>
                  </div>
                  <p style={{ color: "#CBD5E1", marginTop: 8, fontSize: 15, lineHeight: 1.5 }}>{memo.decisionSummary.headline}</p>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 8 }}><strong style={{ color: "#FBBF24" }}>Sizing call:</strong> {memo.decisionSummary.sizingCall}</div>
                </div>
                <div style={{ textAlign: "right", minWidth: 200 }}>
                  <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5 }}>1-sigma implied move</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#FBBF24" }}>±${memo.outlookAssessment.impliedMoveOneSigma.toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 6 }}>HV regime</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: regimeColor(memo.outlookAssessment.hvRegime) }}>{memo.outlookAssessment.hvRegime.toUpperCase()}</div>
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

            {/* Trade Setup */}
            <section style={{ background: "#1E293B", border: "2px solid " + outlookColor(memo.decisionSummary.outlookCall), borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={sectionH}>Trade Setup — {memo.tradeSetup.description}</h3>

              <div style={{ overflowX: "auto", marginBottom: 14 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #334155", color: "#94A3B8", textAlign: "left" }}>
                      <th style={th}>Side</th>
                      <th style={th}>Contract</th>
                      <th style={th}>Type / K / DTE</th>
                      <th style={th}>Bid / Ask</th>
                      <th style={th}>Mid</th>
                      <th style={th}>IV %</th>
                      <th style={th}>Δ</th>
                      <th style={th}>γ</th>
                      <th style={th}>θ/d</th>
                      <th style={th}>ν</th>
                      <th style={th}>Vol / OI</th>
                      <th style={th}>Liquidity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memo.tradeSetup.legs.map((lg, i) => {
                      const liqColor = lg.liquidity === "high" ? "#10B981" : lg.liquidity === "ok" ? "#60A5FA" : lg.liquidity === "thin" ? "#F59E0B" : "#EF4444";
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #0F172A" }}>
                          <td style={{ ...td, color: sideColor(lg.side), fontWeight: 700 }}>{lg.side.toUpperCase()} ×{lg.qty}</td>
                          <td style={{ ...td, fontSize: 10, fontFamily: "ui-monospace, monospace", color: "#94A3B8" }}>{lg.contractID}</td>
                          <td style={{ ...td, fontWeight: 600 }}>{lg.type.toUpperCase()} ${lg.strike} / {lg.dte}d</td>
                          <td style={td}>${lg.bid.toFixed(2)} / ${lg.ask.toFixed(2)}{lg.spreadPct != null && <span style={{ fontSize: 10, color: "#64748B" }}> ({lg.spreadPct.toFixed(1)}%)</span>}</td>
                          <td style={{ ...td, fontWeight: 600 }}>${lg.mid.toFixed(2)}</td>
                          <td style={td}>{lg.impliedVolatilityPct.toFixed(1)}%</td>
                          <td style={td}>{lg.delta.toFixed(3)}</td>
                          <td style={td}>{lg.gamma.toFixed(4)}</td>
                          <td style={td}>{lg.theta.toFixed(3)}</td>
                          <td style={td}>{lg.vega.toFixed(3)}</td>
                          <td style={td}>{lg.volume} / {lg.openInterest}</td>
                          <td style={{ ...td }}><span style={{ ...pillStyle, fontSize: 10, padding: "2px 8px", background: liqColor + "33", color: liqColor, border: "1px solid " + liqColor }}>{lg.liquidity}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ background: "#0F172A", border: "1px solid #334155", borderRadius: 6, padding: 10, marginBottom: 12, fontSize: 12 }}>
                <span style={{ color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.3, fontSize: 10 }}>Liquidity assessment</span>
                <div style={{ color: "#E2E8F0", marginTop: 4 }}>
                  Worst leg: <strong style={{ color: memo.tradeSetup.worstLegLiquidity === "high" ? "#10B981" : memo.tradeSetup.worstLegLiquidity === "ok" ? "#60A5FA" : memo.tradeSetup.worstLegLiquidity === "thin" ? "#F59E0B" : "#EF4444" }}>{memo.tradeSetup.worstLegLiquidity}</strong>
                  {" · "}Avg spread: <strong>{memo.tradeSetup.avgSpreadPct != null ? `${memo.tradeSetup.avgSpreadPct.toFixed(1)}%` : "n/a"}</strong>
                </div>
                <div style={{ color: "#CBD5E1", marginTop: 6, fontSize: 12 }}>{memo.tradeSetup.liquidityAssessment}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 12 }}>
                <Field label="Net credit (-debit) / share" value={`$${memo.tradeSetup.netCreditPerShare.toFixed(2)}`} valueColor={memo.tradeSetup.netCreditPerShare >= 0 ? "#10B981" : "#EF4444"} />
                <Field label="Max profit / contract" value={memo.tradeSetup.maxProfitPerContract == null ? "unlimited" : `$${memo.tradeSetup.maxProfitPerContract.toFixed(2)}`} valueColor="#10B981" />
                <Field label="Max loss / contract" value={memo.tradeSetup.maxLossPerContract == null ? "undefined" : `$${memo.tradeSetup.maxLossPerContract.toFixed(2)}`} valueColor="#EF4444" />
                <Field label="Breakeven(s)" value={memo.tradeSetup.breakevens.map((b) => `$${b.toFixed(2)}`).join(", ")} valueColor="#FBBF24" />
                <Field label="POP" value={memo.tradeSetup.probabilityOfProfitPct != null ? `${memo.tradeSetup.probabilityOfProfitPct.toFixed(1)}%` : "n/a"} valueColor="#60A5FA" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
                <Field label="Contracts to open" value={String(memo.tradeSetup.contractsToOpen)} valueColor="#F1F5F9" />
                <Field label="Margin / contract" value={`$${memo.tradeSetup.marginEstimatePerContract.toFixed(2)}`} />
                <Field label="Total capital at risk" value={`$${memo.tradeSetup.totalCapitalAtRisk.toFixed(2)}`} valueColor="#FBBF24" />
                <Field label="Position Δ / θ" value={`${memo.tradeSetup.positionGreeks.delta.toFixed(2)} / ${memo.tradeSetup.positionGreeks.theta.toFixed(2)}/d`} />
              </div>
            </section>

            {/* Payoff narrative + table */}
            <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16 }}>
                <h3 style={sectionH}>Payoff Narrative</h3>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#10B981", textTransform: "uppercase", letterSpacing: 0.5 }}>Bull case</div>
                  <div style={{ fontSize: 13, color: "#E2E8F0" }}>{memo.payoffNarrative.bullCaseDescription}</div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5 }}>Base case</div>
                  <div style={{ fontSize: 13, color: "#E2E8F0" }}>{memo.payoffNarrative.baseCaseDescription}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#EF4444", textTransform: "uppercase", letterSpacing: 0.5 }}>Bear case</div>
                  <div style={{ fontSize: 13, color: "#E2E8F0" }}>{memo.payoffNarrative.bearCaseDescription}</div>
                </div>
              </div>
              <div style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16 }}>
                <h3 style={sectionH}>Payoff @ Expiry</h3>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #334155", color: "#94A3B8" }}>
                      <th style={{ ...th, textAlign: "left" }}>Price</th>
                      <th style={{ ...th, textAlign: "right" }}>PnL/ctr</th>
                      <th style={{ ...th, textAlign: "right" }}>% risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memo.payoffNarrative.payoffTable.map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #0F172A" }}>
                        <td style={td}>${row.priceAtExpiry.toFixed(2)}</td>
                        <td style={{ ...td, textAlign: "right", color: row.pnlPerContract >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>
                          {row.pnlPerContract >= 0 ? "+" : ""}${row.pnlPerContract.toFixed(2)}
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>{row.pnlPctOfRisk != null ? `${row.pnlPctOfRisk.toFixed(1)}%` : "n/a"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Greeks analysis */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={sectionH}>Greeks Read</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                <GreekBox letter="Δ" name="Delta" body={memo.greeksAnalysis.deltaInterpretation} color="#60A5FA" />
                <GreekBox letter="θ" name="Theta" body={memo.greeksAnalysis.thetaInterpretation} color="#FBBF24" />
                <GreekBox letter="γ" name="Gamma" body={memo.greeksAnalysis.gammaInterpretation} color="#10B981" />
                <GreekBox letter="ν" name="Vega" body={memo.greeksAnalysis.vegaInterpretation} color="#EC4899" />
              </div>
            </section>

            {/* Adjustment plan + Exit rules */}
            <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <Card title="Adjustment Plan">
                {memo.adjustmentPlan.map((a, i) => (
                  <div key={i} style={{ borderBottom: i === memo.adjustmentPlan.length - 1 ? "none" : "1px solid #334155", padding: "8px 0" }}>
                    <div style={{ fontSize: 12, color: "#FBBF24", fontWeight: 600 }}>IF: {a.trigger}</div>
                    <div style={{ fontSize: 12, color: "#10B981", fontWeight: 600, marginTop: 2 }}>DO: {a.action}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{a.rationale}</div>
                  </div>
                ))}
              </Card>
              <Card title="Exit Rules">
                {memo.exitRules.map((e, i) => {
                  const c = e.action === "close-for-profit" ? "#10B981" : e.action === "close-for-loss" ? "#EF4444" : e.action === "roll" ? "#FBBF24" : "#94A3B8";
                  return (
                    <div key={i} style={{ borderBottom: i === memo.exitRules.length - 1 ? "none" : "1px solid #334155", padding: "8px 0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                        <div style={{ fontSize: 12, color: "#E2E8F0" }}>{e.condition}</div>
                        <span style={{ ...pillStyle, background: c + "33", color: c, border: "1px solid " + c, whiteSpace: "nowrap" }}>{e.action.replace(/-/g, " ")}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}><strong>Threshold:</strong> {e.threshold}</div>
                    </div>
                  );
                })}
              </Card>
            </section>

            {/* Risk management rules */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={sectionH}>Risk Management Rules</h3>
              <ul style={listStyle}>{memo.riskManagementRules.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </section>

            {/* Alternatives considered */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={sectionH}>Alternatives Considered & Rejected</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {memo.alternativesConsidered.map((alt, i) => (
                  <div key={i} style={{ background: "#0F172A", border: "1px solid #334155", borderRadius: 6, padding: 12 }}>
                    <div style={{ fontSize: 12, color: "#60A5FA", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>{alt.category.replace(/-/g, " ")}</div>
                    <div style={{ fontSize: 12, color: "#CBD5E1", marginBottom: 8 }}>{alt.description}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}><strong style={{ color: "#10B981" }}>Considered:</strong> {alt.whyConsidered}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}><strong style={{ color: "#EF4444" }}>Rejected:</strong> {alt.whyRejected}</div>
                  </div>
                ))}
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

            {/* Outlook rationale + Chain metadata */}
            <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <Card title="Outlook Rationale">
                <div style={{ fontSize: 13, color: "#E2E8F0", marginBottom: 8 }}>{memo.outlookAssessment.rationale}</div>
                <Field label="Spot" value={`$${memo.outlookAssessment.underlyingPrice.toFixed(2)}`} />
                <Field label="Direction" value={memo.outlookAssessment.direction} valueColor={outlookColor(memo.outlookAssessment.direction)} />
                <Field label="IV vs HV" value={memo.outlookAssessment.ivVsHvNote} />
              </Card>
              <Card title="Chain Metadata (AV HISTORICAL_OPTIONS)">
                <Field label="Chain as of (EOD)" value={memo.chainDataAsOfDate ?? "n/a"} valueColor="#FBBF24" />
                <Field label="Contracts in chain" value={String(memo.chainContractCount)} />
                <Field label="Selected expiration" value={`${memo.selectedExpiration ?? "n/a"} (${memo.selectedExpirationDte ?? "?"}d)`} valueColor="#60A5FA" />
                <div style={{ marginTop: 10, padding: 8, background: "#7F1D1D33", border: "1px solid #F59E0B", borderRadius: 4 }}>
                  <div style={{ fontSize: 11, color: "#FBBF24", fontWeight: 700, marginBottom: 4 }}>⚠ LIVE REPRICING REQUIRED</div>
                  <div style={{ fontSize: 11, color: "#FECACA" }}>{memo.requiresLiveRepricing?.note}</div>
                </div>
                <div style={{ marginTop: 8, padding: 8, background: memo.earlyExerciseRisk.applies ? "#7F1D1D33" : "#06402333", border: `1px solid ${memo.earlyExerciseRisk.applies ? "#F59E0B" : "#10B981"}`, borderRadius: 4 }}>
                  <div style={{ fontSize: 11, color: memo.earlyExerciseRisk.applies ? "#FBBF24" : "#10B981", fontWeight: 700, marginBottom: 4 }}>Early-exercise risk: {memo.earlyExerciseRisk.applies ? "YES" : "low"}</div>
                  <div style={{ fontSize: 11, color: "#CBD5E1" }}>{memo.earlyExerciseRisk.note}</div>
                </div>
              </Card>
            </section>

            {/* Confidence + diagnostics */}
            <section style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.6, marginBottom: 8 }}>{memo.confidenceStatement}</div>
              <div style={{ borderTop: "1px solid #334155", paddingTop: 10, fontSize: 11, color: "#64748B" }}>
                <div><strong>Confidence:</strong> {resp.meta.confidence} — {resp.meta.confidenceReason}</div>
                <div><strong>Source:</strong> {resp.meta.source}</div>
                <div><strong>Fetched:</strong> {resp.meta.fetchedAt} ({resp.meta.freshness})</div>
                <div><strong>Missing fields:</strong> {resp.meta.missingFields.join(", ")}</div>
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
const lblStyle: React.CSSProperties = { display: "flex", flexDirection: "column", fontSize: 12, color: "#94A3B8" };
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
      <div style={{ fontSize: 13, color: valueColor || "#E2E8F0", fontWeight: valueColor ? 600 : 400 }}>{value}</div>
    </div>
  );
}

function GreekBox({ letter, name, body, color }: { letter: string; name: string; body: string; color: string }) {
  return (
    <div style={{ background: "#0F172A", border: "1px solid " + color, borderRadius: 6, padding: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color }}>{letter}</span>
        <span style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5 }}>{name}</span>
      </div>
      <div style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}


