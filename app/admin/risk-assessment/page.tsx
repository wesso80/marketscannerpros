"use client";

/**
 * Admin Risk Assessment — MSP portfolio risk memo.
 * Operator-grade. System never executes orders.
 */

import { useCallback, useState } from "react";
import Link from "next/link";

type Exposure = "none" | "low" | "elevated" | "high";
type RiskRating = "low" | "moderate" | "elevated" | "high" | "extreme";

interface HoldingRow {
  ticker: string;
  allocationPct: string;     // string while typing
  costBasis: string;
}

interface DashboardRow {
  ticker: string;
  allocationPct: number;
  hv90Pct: number | null;
  beta252: number | null;
  maxDrawdownPct: number | null;
  stress2008Pct: number | null;
  liquidityBand: string;
  sector: string | null;
  riskRating: RiskRating;
  topConcerns: string[];
}

interface HedgingRec {
  hedgeType: string;
  target: string;
  structure: string;
  estimatedCost: string;
  protectionEstimate: string;
  rationale: string;
  triggerCondition: string;
}

interface RiskMemo {
  generatedAt: string;
  executiveSummary: string;
  opportunityScore: number;
  evidenceQualityScore: number;
  personalExposureFlag: Exposure;
  confidenceStatement: string;
  whatConfirms: string[];
  whatInvalidates: string[];
  mainRisk: string;
  dashboard: DashboardRow[];
  portfolioFindings: {
    overallRiskRating: RiskRating;
    diversificationScore: number;
    concentrationVerdict: string;
    correlationVerdict: string;
    rateSensitivityVerdict: string;
    recessionScenario: string;
    liquidityVerdict: string;
    earningsRiskVerdict: string;
  };
  holdingNotes: Array<{
    ticker: string;
    riskRating: RiskRating;
    keyRisks: string[];
    drawdownContext: string;
    betaContext: string;
    catalystRisk: string;
    holdingVerdict: string;
  }>;
  hedgingPlan: HedgingRec[];
  recommendedActions: Array<{
    priority: 1 | 2 | 3;
    action: string;
    rationale: string;
    triggerCondition: string;
  }>;
  closingParagraph: string;
  classification: string;
  disclaimer: string;
}

interface SnapshotMin {
  totalAllocationPct: number;
  benchmark: { ticker: string; status: string; lastBarDate: string | null };
  correlations: Array<{ pair: string; r: number; windowDays: number }>;
  sectorConcentration: Array<{ sector: string; allocationPct: number; tickers: string[] }>;
  portfolio: {
    weightedHv90: number | null;
    weightedBeta: number | null;
    weightedMaxDD: number | null;
    weightedStress2008: number | null;
    weightedStressCovid: number | null;
    topHoldingPct: number;
    topSectorPct: number;
    topSectorName: string | null;
  };
  missingFields: string[];
  errors: string[];
}

interface Resp {
  data?: { memo: RiskMemo | null; snapshot: SnapshotMin; aiError?: string };
  source?: string;
  freshness?: string;
  confidence?: string;
  confidenceReason?: string;
  error?: string;
  detail?: string;
}

const blank: HoldingRow = { ticker: "", allocationPct: "", costBasis: "" };

export default function RiskAssessmentPage() {
  const [rows, setRows] = useState<HoldingRow[]>([
    { ticker: "AAPL", allocationPct: "20", costBasis: "" },
    { ticker: "MSFT", allocationPct: "20", costBasis: "" },
    { ticker: "NVDA", allocationPct: "15", costBasis: "" },
    { ticker: "GOOGL", allocationPct: "15", costBasis: "" },
    { ticker: "AMZN", allocationPct: "15", costBasis: "" },
    { ticker: "SPY", allocationPct: "15", costBasis: "" },
  ]);
  const [totalValue, setTotalValue] = useState("");
  const [exposure, setExposure] = useState<Exposure>("none");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const totalPct = rows.reduce((s, r) => s + (Number(r.allocationPct) || 0), 0);

  const updateRow = (i: number, key: keyof HoldingRow, val: string) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: key === "ticker" ? val.toUpperCase() : val } : r)));
  };
  const addRow = () => setRows((rs) => [...rs, { ...blank }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const run = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setResp(null);
    try {
      const holdings = rows
        .map((r) => ({
          ticker: r.ticker.trim().toUpperCase(),
          allocationPct: Number(r.allocationPct),
          costBasis: r.costBasis ? Number(r.costBasis) : undefined,
        }))
        .filter((h) => h.ticker && h.allocationPct > 0);
      if (!holdings.length) {
        setErr("Add at least one holding with allocation > 0");
        return;
      }
      const r = await fetch("/api/admin/risk-assessment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          holdings,
          totalPortfolioValueUSD: totalValue ? Number(totalValue) : undefined,
          personalExposureFlag: exposure,
          operatorNotes: notes,
        }),
      });
      const body = (await r.json()) as Resp;
      if (!r.ok) setErr(body.error || `HTTP ${r.status}${body.detail ? ` — ${body.detail}` : ""}`);
      setResp(body);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, [rows, totalValue, exposure, notes]);

  return (
    <main style={{ minHeight: "100vh", background: "#0B1220", color: "#E5E7EB", padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: "#F9FAFB" }}>Risk Assessment</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9CA3AF" }}>
            MSP portfolio risk memo · operator-grade · system does not execute.
          </p>
        </div>
        <Link href="/admin" style={navLink}>← Command Home</Link>
      </header>

      {/* Portfolio input */}
      <section style={card}>
        <h3 style={cardTitle}>Portfolio</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1fr 1fr 60px", gap: 8, fontSize: 11, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.4, paddingBottom: 6, borderBottom: "1px solid #1F2937", marginBottom: 6 }}>
          <div>Ticker</div><div>Allocation %</div><div>Cost basis (opt)</div><div></div><div></div><div></div><div></div>
        </div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1fr 1fr 60px", gap: 8, marginBottom: 6 }}>
            <input value={r.ticker} onChange={(e) => updateRow(i, "ticker", e.target.value)} placeholder="AAPL" maxLength={10} style={inp} />
            <input value={r.allocationPct} onChange={(e) => updateRow(i, "allocationPct", e.target.value)} placeholder="15" inputMode="decimal" style={inp} />
            <input value={r.costBasis} onChange={(e) => updateRow(i, "costBasis", e.target.value)} placeholder="optional" inputMode="decimal" style={inp} />
            <div /><div /><div />
            <button type="button" onClick={() => removeRow(i)} style={{ ...btnGhost, color: "#EF4444" }}>×</button>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <button type="button" onClick={addRow} style={btnGhost}>+ Add holding</button>
          <div style={{ fontSize: 12, color: totalPct > 100 ? "#EF4444" : totalPct === 100 ? "#10B981" : "#F59E0B" }}>
            Total allocation: {totalPct.toFixed(1)}% {totalPct === 100 ? "✓" : totalPct > 100 ? "⚠ over 100" : "(may be partial book)"}
          </div>
        </div>
      </section>

      {/* Operator inputs */}
      <section style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12 }}>
          <label style={lbl}>Total portfolio value (USD, optional)
            <input value={totalValue} onChange={(e) => setTotalValue(e.target.value)} placeholder="e.g. 250000" inputMode="decimal" style={inp} />
          </label>
          <label style={lbl}>Personal exposure (operator-set)
            <select value={exposure} onChange={(e) => setExposure(e.target.value as Exposure)} style={inp}>
              <option value="none">none</option><option value="low">low</option><option value="elevated">elevated</option><option value="high">high</option>
            </select>
          </label>
          <label style={lbl}>Operator notes (optional)
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="rate environment view, time horizon, constraints…" maxLength={1500} style={inp} />
          </label>
        </div>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button type="button" onClick={run} disabled={loading || rows.every((r) => !r.ticker)} style={{
            padding: "8px 16px", background: loading ? "#1F2937" : "#10B981", color: "#0B1220",
            border: "none", borderRadius: 6, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
          }}>
            {loading ? "Building memo…" : "Generate risk memo"}
          </button>
          <span style={{ fontSize: 12, color: "#6B7280" }}>
            One AV daily-series + OVERVIEW per holding + SPY benchmark · ~{rows.filter((r) => r.ticker).length * 2 + 1} AV calls
          </span>
        </div>
      </section>

      {err ? (
        <div style={{ padding: 12, background: "#2A0B0B", border: "1px solid #7F1D1D", borderRadius: 8, color: "#FCA5A5", fontSize: 13, marginBottom: 16 }}>
          Error: {err}
        </div>
      ) : null}

      {resp?.data ? <MemoView resp={resp} /> : null}
    </main>
  );
}

/* ───────── Memo ───────── */

function MemoView({ resp }: { resp: Resp }) {
  const d = resp.data!;
  const m = d.memo;
  const snap = d.snapshot;
  if (!m) {
    return (
      <section style={card}>
        <h3 style={cardTitle}>Memo failed validation</h3>
        <div style={{ color: "#FCA5A5", fontSize: 13 }}>{d.aiError || "unknown"}</div>
        <pre style={{ fontSize: 11, color: "#9CA3AF", marginTop: 12, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(snap.portfolio, null, 2)}
        </pre>
      </section>
    );
  }
  const overallColor = ratingColor(m.portfolioFindings.overallRiskRating);
  return (
    <article style={{ display: "grid", gap: 16 }}>
      {/* Header */}
      <section style={{ ...card, borderColor: `${overallColor}55`, borderWidth: 2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={lblTiny}>Portfolio Risk Memo</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 4 }}>
              <h2 style={{ margin: 0, fontSize: 26, color: "#F9FAFB" }}>Overall: {m.portfolioFindings.overallRiskRating.toUpperCase()}</h2>
              <span style={{ padding: "3px 10px", background: `${overallColor}22`, color: overallColor, borderRadius: 5, fontWeight: 700, fontSize: 12 }}>
                Diversification {m.portfolioFindings.diversificationScore}/10
              </span>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 13, color: "#E5E7EB", lineHeight: 1.55 }}>{m.executiveSummary}</p>
            <div style={{ marginTop: 8, fontSize: 11, color: "#6B7280" }}>
              {resp.source} · {resp.freshness} · confidence {resp.confidence}
              {resp.confidenceReason ? ` — ${resp.confidenceReason}` : ""}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, auto)", gap: 8 }}>
            <ScoreBox label="Defensive Opp" value={m.opportunityScore} color="#60A5FA" />
            <ScoreBox label="Evidence" value={m.evidenceQualityScore} color="#10B981" />
          </div>
        </div>
        <div style={{ marginTop: 10, padding: 8, background: "#0B1220", border: "1px solid #1F2937", borderRadius: 6, fontSize: 12, color: "#D1D5DB" }}>
          <strong>Confidence: </strong>{m.confidenceStatement}
        </div>
      </section>

      {/* Aggregates strip */}
      <section style={card}>
        <h3 style={cardTitle}>Portfolio Aggregates</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
          <Stat label="Weighted HV90" value={fmtPct(snap.portfolio.weightedHv90)} color="#60A5FA" />
          <Stat label="Weighted Beta" value={fmtNum(snap.portfolio.weightedBeta)} color="#60A5FA" />
          <Stat label="Weighted |maxDD|" value={fmtPct(snap.portfolio.weightedMaxDD)} color="#F59E0B" />
          <Stat label="-55% SPY shock" value={fmtPct(snap.portfolio.weightedStress2008)} color="#EF4444" />
          <Stat label="-34% SPY shock" value={fmtPct(snap.portfolio.weightedStressCovid)} color="#EF4444" />
          <Stat label={`Top sector: ${snap.portfolio.topSectorName ?? "n/a"}`} value={`${snap.portfolio.topSectorPct.toFixed(1)}%`} color="#F59E0B" />
        </div>
      </section>

      {/* Risk dashboard table */}
      <section style={card}>
        <h3 style={cardTitle}>Risk Dashboard</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#9CA3AF", textAlign: "left" }}>
                <th style={th}>Ticker</th><th style={th}>Alloc</th><th style={th}>Sector</th>
                <th style={th}>HV90</th><th style={th}>β252</th><th style={th}>MaxDD</th>
                <th style={th}>-55% est</th><th style={th}>Liquidity</th>
                <th style={th}>Risk</th><th style={th}>Top concerns</th>
              </tr>
            </thead>
            <tbody>
              {m.dashboard.map((row, i) => {
                const c = ratingColor(row.riskRating);
                return (
                  <tr key={i} style={{ borderTop: "1px solid #1F2937" }}>
                    <td style={td}><strong>{row.ticker}</strong></td>
                    <td style={td}>{row.allocationPct}%</td>
                    <td style={td}>{row.sector ?? "n/a"}</td>
                    <td style={td}>{fmtPct(row.hv90Pct)}</td>
                    <td style={td}>{fmtNum(row.beta252)}</td>
                    <td style={td}>{fmtPct(row.maxDrawdownPct)}</td>
                    <td style={td}>{fmtPct(row.stress2008Pct)}</td>
                    <td style={td}>{row.liquidityBand}</td>
                    <td style={{ ...td, color: c, fontWeight: 700 }}>{row.riskRating}</td>
                    <td style={td}>{row.topConcerns.join("; ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Findings + correlations + sectors */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <section style={card}>
          <h3 style={cardTitle}>Portfolio Findings</h3>
          <KV k="Concentration" v={m.portfolioFindings.concentrationVerdict} />
          <KV k="Correlation" v={m.portfolioFindings.correlationVerdict} />
          <KV k="Rate sensitivity" v={m.portfolioFindings.rateSensitivityVerdict} />
          <KV k="Recession scenario" v={m.portfolioFindings.recessionScenario} />
          <KV k="Liquidity" v={m.portfolioFindings.liquidityVerdict} />
          <KV k="Earnings risk" v={m.portfolioFindings.earningsRiskVerdict} />
        </section>
        <section style={card}>
          <h3 style={cardTitle}>Sector Concentration</h3>
          {snap.sectorConcentration.map((s, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1F2937", fontSize: 12 }}>
              <span style={{ color: "#E5E7EB" }}>{s.sector}</span>
              <span style={{ color: s.allocationPct > 30 ? "#EF4444" : "#9CA3AF" }}>
                {s.allocationPct}% [{s.tickers.join(", ")}]
              </span>
            </div>
          ))}
          <h3 style={{ ...cardTitle, marginTop: 12 }}>Pairwise Correlations (252d)</h3>
          {snap.correlations.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {snap.correlations.slice().sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).map((c, i) => (
                <div key={i} style={{ fontSize: 11, color: Math.abs(c.r) > 0.7 ? "#F59E0B" : "#9CA3AF" }}>
                  {c.pair.replace("|", " ↔ ")}: <strong>{c.r.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize: 12, color: "#6B7280" }}>insufficient overlap</div>}
        </section>
      </div>

      {/* Recommended actions */}
      <section style={{ ...card, borderColor: "#10B98155" }}>
        <h3 style={{ ...cardTitle, color: "#10B981" }}>Recommended Actions (operator-grade · system does not execute)</h3>
        <div style={{ display: "grid", gap: 10 }}>
          {m.recommendedActions.sort((a, b) => a.priority - b.priority).map((a, i) => (
            <div key={i} style={{ padding: 10, background: "#0B1220", border: "1px solid #1F2937", borderRadius: 6 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{
                  padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                  background: a.priority === 1 ? "#EF444422" : a.priority === 2 ? "#F59E0B22" : "#1F2937",
                  color: a.priority === 1 ? "#EF4444" : a.priority === 2 ? "#F59E0B" : "#9CA3AF",
                }}>P{a.priority}</span>
                <strong style={{ color: "#F9FAFB", fontSize: 14 }}>{a.action}</strong>
              </div>
              <p style={para}>{a.rationale}</p>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>Trigger: {a.triggerCondition}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Hedging plan */}
      <section style={card}>
        <h3 style={cardTitle}>Hedging Plan</h3>
        <div style={{ display: "grid", gap: 10 }}>
          {m.hedgingPlan.map((h, i) => (
            <div key={i} style={{ padding: 10, background: "#0B1220", border: "1px solid #1F2937", borderRadius: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <strong style={{ color: "#F9FAFB", fontSize: 14 }}>{h.hedgeType.replace(/-/g, " ")}</strong>
                <span style={{ fontSize: 11, color: "#9CA3AF" }}>target: {h.target}</span>
              </div>
              <KV k="Structure" v={h.structure} />
              <KV k="Est. cost" v={h.estimatedCost} />
              <KV k="Protection" v={h.protectionEstimate} />
              <KV k="Trigger" v={h.triggerCondition} />
              <p style={para}>{h.rationale}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Per-holding notes */}
      <section style={card}>
        <h3 style={cardTitle}>Per-Holding Notes</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {m.holdingNotes.map((h, i) => {
            const c = ratingColor(h.riskRating);
            return (
              <div key={i} style={{ padding: 10, background: "#0B1220", border: `1px solid ${c}33`, borderRadius: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong style={{ color: "#F9FAFB" }}>{h.ticker}</strong>
                  <span style={{ color: c, fontWeight: 700, fontSize: 11, textTransform: "uppercase" }}>{h.riskRating}</span>
                </div>
                <KV k="Drawdown" v={h.drawdownContext} />
                <KV k="Beta" v={h.betaContext} />
                <KV k="Catalysts" v={h.catalystRisk} />
                <div style={{ fontSize: 12, color: "#E5E7EB", marginTop: 6 }}>{h.holdingVerdict}</div>
                {h.keyRisks.length ? (
                  <ul style={{ ...ul, marginTop: 6 }}>
                    {h.keyRisks.map((r, j) => <li key={j} style={li}>{r}</li>)}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* Confirms / invalidates / main risk */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <section style={card}>
          <h3 style={cardTitle}>What Confirms</h3>
          <ul style={ul}>{m.whatConfirms.map((s, i) => <li key={i} style={li}>{s}</li>)}</ul>
        </section>
        <section style={card}>
          <h3 style={cardTitle}>What Invalidates</h3>
          <ul style={ul}>{m.whatInvalidates.map((s, i) => <li key={i} style={li}>{s}</li>)}</ul>
        </section>
        <section style={card}>
          <h3 style={cardTitle}>Main Risk</h3>
          <p style={{ ...para, color: "#FCA5A5" }}>{m.mainRisk}</p>
        </section>
      </div>

      {/* Closing */}
      <section style={card}>
        <h3 style={cardTitle}>Closing</h3>
        <p style={para}>{m.closingParagraph}</p>
        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 10, fontStyle: "italic" }}>
          {m.disclaimer}
        </div>
      </section>

      {/* Diagnostics */}
      <section style={card}>
        <h3 style={cardTitle}>Data Diagnostics</h3>
        <div style={{ fontSize: 11, color: "#9CA3AF" }}>
          Benchmark: {snap.benchmark.ticker} · {snap.benchmark.status} · last bar {snap.benchmark.lastBarDate ?? "n/a"}<br />
          Missing classes: {snap.missingFields.join("; ") || "(none)"}<br />
          {snap.errors.length ? `Errors: ${snap.errors.join("; ")}` : null}
        </div>
      </section>
    </article>
  );
}

/* ───────── helpers ───────── */

function ratingColor(r: RiskRating | string): string {
  switch (r) {
    case "low": return "#10B981";
    case "moderate": return "#60A5FA";
    case "elevated": return "#F59E0B";
    case "high": return "#EF4444";
    case "extreme": return "#EC4899";
    default: return "#9CA3AF";
  }
}

function ScoreBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "#0B1220", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 10px", minWidth: 90 }}>
      <div style={{ fontSize: 10, color: "#9CA3AF" }}>{label}</div>
      <div style={{ fontSize: 16, color, fontWeight: 700 }}>{Math.round(value)}</div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "#0B1220", border: "1px solid #1F2937", borderRadius: 6, padding: 8, textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "#9CA3AF" }}>{label}</div>
      <div style={{ fontSize: 14, color, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #1F2937", fontSize: 12 }}>
      <span style={{ color: "#9CA3AF" }}>{k}</span>
      <span style={{ color: "#E5E7EB", textAlign: "right", maxWidth: "65%" }}>{v}</span>
    </div>
  );
}

function fmtPct(n: number | null): string { return n == null ? "n/a" : `${n.toFixed(1)}%`; }
function fmtNum(n: number | null): string { return n == null ? "n/a" : n.toFixed(2); }

const navLink: React.CSSProperties = { color: "#60A5FA", textDecoration: "none", padding: "6px 10px", borderRadius: 6, border: "1px solid #1F2937" };
const card: React.CSSProperties = { background: "#0F172A", border: "1px solid #1F2937", borderRadius: 12, padding: 14, marginBottom: 16 };
const cardTitle: React.CSSProperties = { margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: 0.4, textTransform: "uppercase" };
const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#9CA3AF" };
const lblTiny: React.CSSProperties = { fontSize: 11, color: "#9CA3AF", letterSpacing: 0.4, textTransform: "uppercase" };
const inp: React.CSSProperties = { padding: "7px 10px", background: "#0B1220", border: "1px solid #1F2937", borderRadius: 6, color: "#E5E7EB", fontSize: 13 };
const para: React.CSSProperties = { margin: "4px 0 0", fontSize: 12, color: "#E5E7EB", lineHeight: 1.55 };
const ul: React.CSSProperties = { listStyle: "none", padding: 0, margin: "4px 0 0" };
const li: React.CSSProperties = { padding: "3px 0", fontSize: 12, color: "#E5E7EB", borderBottom: "1px solid #1F2937" };
const th: React.CSSProperties = { padding: "6px 8px", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 };
const td: React.CSSProperties = { padding: "6px 8px", fontSize: 12, color: "#E5E7EB" };
const btnGhost: React.CSSProperties = { background: "transparent", border: "1px solid #1F2937", borderRadius: 6, padding: "4px 10px", color: "#9CA3AF", cursor: "pointer", fontSize: 12 };
