"use client";

/**
 * /admin/quant-screener
 *
 * Renaissance-style multi-factor quant screen. Operator-grade top-10
 * ranking with factor breakdown + sector distribution + watch list.
 */

import React, { useState } from "react";

interface FactorBreakdown {
  value: number | null;
  quality: number | null;
  momentum: number | null;
  growth: number | null;
  sentiment: null;
}
interface TopPick {
  rank: number;
  ticker: string;
  name: string | null;
  sector: string | null;
  marketCapBucket: string;
  compositeScore: number;
  factorBreakdown: FactorBreakdown;
  thesisOneLiner: string;
  primaryEdge: string;
  primaryConcern: string;
  invalidationLevel: string;
}
interface SectorDistRow {
  sector: string;
  countInTop10: number;
  pctOfTop10: number;
  flag: string;
}
interface WatchRow {
  ticker: string;
  name: string | null;
  sector: string | null;
  compositeScore: number | null;
  blockingFactor: string;
  trigger: string;
}
interface QuantMemo {
  generatedAt: string;
  decisionSummary: {
    headline: string;
    topPickTicker: string;
    sectorTilt: string;
    breadthRead: string;
    confidenceCall: string;
  };
  opportunityScore: number;
  evidenceQualityScore: number;
  personalExposureFlag: string;
  confidenceStatement: string;
  whatConfirms: string[];
  whatInvalidates: string[];
  mainRisk: string;
  universeRecap: {
    universeSize: number;
    okCount: number;
    failedCount: number;
    medianPE: number | null;
    medianEVToEBITDA: number | null;
    medianROE: number | null;
    medianRevGrowth: number | null;
  };
  topPicks: TopPick[];
  sectorDistribution: SectorDistRow[];
  concentrationVerdict: string;
  watchList: WatchRow[];
  backtestContext: { available: boolean; qualitativeRead: string; factorRegimeNote: string };
  sentimentFactorStatus: { available: boolean; note: string; missingComponents: string[] };
  implementationNotes: {
    sequencing: string;
    sizingFramework: string;
    rebalanceCadence: string;
    capacityCaveat: string;
  };
  closingParagraph: string;
  classification: string;
  disclaimer: string;
}
interface ApiResponse {
  data: { memo: QuantMemo | null; snapshot: unknown; aiError?: string };
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

const flagColor = (s: string): string => {
  if (s === "concentrated") return "#EF4444";
  if (s === "diversified") return "#10B981";
  return "#94A3B8";
};
const confColor = (s: string): string => {
  if (s === "high") return "#10B981";
  if (s === "moderate" || s === "medium") return "#F59E0B";
  if (s === "low") return "#EF4444";
  return "#94A3B8";
};
const fmtNum = (n: number | null | undefined, dp = 2): string =>
  n == null ? "n/a" : n.toFixed(dp);
const scoreColor = (n: number | null | undefined): string => {
  if (n == null) return "#475569";
  if (n >= 70) return "#10B981";
  if (n >= 50) return "#60A5FA";
  if (n >= 30) return "#F59E0B";
  return "#EF4444";
};

const DEFAULT_TICKERS = "AAPL,MSFT,GOOGL,AMZN,META,NVDA,TSLA,JPM,BAC,GS,MS,UNH,JNJ,LLY,PFE,XOM,CVX,CAT,GE,HON,WMT,PG,KO,NEE,AMT";

export default function QuantScreenerPage() {
  const [universeText, setUniverseText] = useState(DEFAULT_TICKERS);
  const [preferredSectors, setPreferredSectors] = useState("");
  const [marketCapRange, setMarketCapRange] = useState("");
  const [emphasisFactors, setEmphasisFactors] = useState("");
  const [excludeFactors, setExcludeFactors] = useState("");
  const [exposure, setExposure] = useState<"none" | "low" | "elevated" | "high">("none");
  const [operatorNotes, setOperatorNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resp, setResp] = useState<ApiResponse | null>(null);

  async function runScreen() {
    setLoading(true);
    setError(null);
    setResp(null);
    try {
      const universe = universeText
        .split(/[,\s\n]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const r = await fetch("/api/admin/quant-screener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          universe,
          preferredSectors,
          marketCapRange,
          emphasisFactors,
          excludeFactors,
          personalExposureFlag: exposure,
          operatorNotes,
        }),
      });
      const j = await r.json();
      const env = toEnvelope(j);
      setResp(env);
      if (!r.ok && env.data?.aiError) setError(env.data.aiError);
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setLoading(false);
    }
  }

  const memo = resp?.data?.memo ?? null;
  const meta = resp?.meta;

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", color: "#E2E8F0", padding: 24 }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>
          Renaissance Quant Screener
        </h1>
        <p style={{ color: "#94A3B8", marginBottom: 24, fontSize: 13 }}>
          Multi-factor screen (value · quality · momentum · growth) over a custom
          universe. Sentiment-factor inputs (insider / 13F / short interest /
          revisions) are NOT in AV free tier and are explicitly flagged
          unavailable. Quota footprint: 2× universe + 1 SPY = up to 51 AV calls.
        </p>

        {/* Inputs */}
        <div style={{ background: "#1E293B", padding: 20, borderRadius: 8, marginBottom: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: "#94A3B8", marginBottom: 6 }}>
              Universe (comma- or whitespace-separated tickers, max 30)
            </label>
            <textarea
              value={universeText}
              onChange={(e) => setUniverseText(e.target.value)}
              rows={3}
              style={{ width: "100%", padding: 10, borderRadius: 6, background: "#0F172A", color: "#E2E8F0", border: "1px solid #334155", fontFamily: "monospace", fontSize: 12 }}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#94A3B8", marginBottom: 4 }}>Preferred sectors</label>
              <input value={preferredSectors} onChange={(e) => setPreferredSectors(e.target.value)} placeholder="e.g. Industrials, Financials"
                style={{ width: "100%", padding: 8, borderRadius: 6, background: "#0F172A", color: "#E2E8F0", border: "1px solid #334155" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#94A3B8", marginBottom: 4 }}>Market cap range</label>
              <input value={marketCapRange} onChange={(e) => setMarketCapRange(e.target.value)} placeholder="e.g. $10B-$200B"
                style={{ width: "100%", padding: 8, borderRadius: 6, background: "#0F172A", color: "#E2E8F0", border: "1px solid #334155" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#94A3B8", marginBottom: 4 }}>Emphasise factors</label>
              <input value={emphasisFactors} onChange={(e) => setEmphasisFactors(e.target.value)} placeholder="e.g. quality + momentum"
                style={{ width: "100%", padding: 8, borderRadius: 6, background: "#0F172A", color: "#E2E8F0", border: "1px solid #334155" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#94A3B8", marginBottom: 4 }}>Exclude / down-weight</label>
              <input value={excludeFactors} onChange={(e) => setExcludeFactors(e.target.value)} placeholder="e.g. deep value, micro-cap"
                style={{ width: "100%", padding: 8, borderRadius: 6, background: "#0F172A", color: "#E2E8F0", border: "1px solid #334155" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#94A3B8", marginBottom: 4 }}>Personal exposure flag</label>
              <select value={exposure} onChange={(e) => setExposure(e.target.value as typeof exposure)}
                style={{ width: "100%", padding: 8, borderRadius: 6, background: "#0F172A", color: "#E2E8F0", border: "1px solid #334155" }}>
                <option value="none">none</option>
                <option value="low">low</option>
                <option value="elevated">elevated</option>
                <option value="high">high</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, color: "#94A3B8", marginBottom: 4 }}>Operator notes</label>
            <textarea value={operatorNotes} onChange={(e) => setOperatorNotes(e.target.value)} rows={2}
              placeholder="Hard constraints, dislikes, sectors avoided, etc."
              style={{ width: "100%", padding: 8, borderRadius: 6, background: "#0F172A", color: "#E2E8F0", border: "1px solid #334155" }} />
          </div>
          <button
            onClick={runScreen}
            disabled={loading}
            style={{ padding: "10px 20px", background: loading ? "#475569" : "#10B981", color: "#0F172A", border: "none", borderRadius: 6, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "Running screen…" : "Run quant screen"}
          </button>
        </div>

        {error && (
          <div style={{ background: "#7F1D1D", color: "#FECACA", padding: 12, borderRadius: 6, marginBottom: 16 }}>
            <strong>Validator / API error:</strong> {error}
          </div>
        )}

        {memo && meta && (
          <>
            {/* Decision summary */}
            <div style={{
              background: "#1E293B", padding: 18, borderRadius: 8, marginBottom: 16,
              borderLeft: `4px solid ${confColor(memo.decisionSummary.confidenceCall)}`,
            }}>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6, letterSpacing: 1 }}>DECISION SUMMARY</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
                {memo.decisionSummary.headline}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <Pill label="Top pick" value={memo.decisionSummary.topPickTicker} color="#10B981" />
                <Pill label="Sector tilt" value={memo.decisionSummary.sectorTilt} color="#60A5FA" />
                <Pill label="Confidence" value={memo.decisionSummary.confidenceCall} color={confColor(memo.decisionSummary.confidenceCall)} />
              </div>
              <div style={{ fontSize: 13, color: "#CBD5E1" }}>{memo.decisionSummary.breadthRead}</div>
            </div>

            {/* Score strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              <ScoreCard label="Opportunity" value={memo.opportunityScore} />
              <ScoreCard label="Evidence Quality" value={memo.evidenceQualityScore} />
              <Card title="Personal Exposure" value={memo.personalExposureFlag} color="#F59E0B" />
              <Card title="Meta confidence" value={meta.confidence} color={confColor(meta.confidence)} />
            </div>

            {/* Universe recap */}
            <Section title="Universe recap">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, fontSize: 13 }}>
                <RecapCell label="Size" value={String(memo.universeRecap.universeSize)} />
                <RecapCell label="OK" value={String(memo.universeRecap.okCount)} color="#10B981" />
                <RecapCell label="Failed" value={String(memo.universeRecap.failedCount)} color={memo.universeRecap.failedCount > 0 ? "#EF4444" : "#94A3B8"} />
                <RecapCell label="Median P/E" value={fmtNum(memo.universeRecap.medianPE)} />
                <RecapCell label="Median EV/EBITDA" value={fmtNum(memo.universeRecap.medianEVToEBITDA)} />
                <RecapCell label="Median ROE%" value={fmtNum(memo.universeRecap.medianROE)} />
              </div>
            </Section>

            {/* Top picks table */}
            <Section title={`Top ${memo.topPicks.length} picks — composite rank`}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#0F172A" }}>
                      {["#", "Ticker", "Name / Sector", "Cap", "Composite", "V", "Q", "M", "G", "Sent", "Edge", "Invalidation"].map((h) => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {memo.topPicks.map((p) => (
                      <tr key={p.ticker} style={{ borderTop: "1px solid #334155" }}>
                        <td style={td}>{p.rank}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{p.ticker}</td>
                        <td style={td}>
                          <div>{p.name ?? "—"}</div>
                          <div style={{ color: "#94A3B8", fontSize: 11 }}>{p.sector ?? "—"}</div>
                        </td>
                        <td style={td}><Pill value={p.marketCapBucket} color="#475569" /></td>
                        <td style={{ ...td, fontWeight: 700, color: scoreColor(p.compositeScore) }}>{fmtNum(p.compositeScore, 1)}</td>
                        <td style={{ ...td, color: scoreColor(p.factorBreakdown.value) }}>{fmtNum(p.factorBreakdown.value, 0)}</td>
                        <td style={{ ...td, color: scoreColor(p.factorBreakdown.quality) }}>{fmtNum(p.factorBreakdown.quality, 0)}</td>
                        <td style={{ ...td, color: scoreColor(p.factorBreakdown.momentum) }}>{fmtNum(p.factorBreakdown.momentum, 0)}</td>
                        <td style={{ ...td, color: scoreColor(p.factorBreakdown.growth) }}>{fmtNum(p.factorBreakdown.growth, 0)}</td>
                        <td style={{ ...td, color: "#475569", fontSize: 10 }}>n/a</td>
                        <td style={{ ...td, color: "#10B981", fontSize: 11 }}>{p.primaryEdge}</td>
                        <td style={{ ...td, color: "#FCA5A5", fontSize: 11 }}>{p.invalidationLevel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Thesis cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10, marginTop: 16 }}>
                {memo.topPicks.map((p) => (
                  <div key={`${p.ticker}-card`} style={{ background: "#0F172A", padding: 12, borderRadius: 6, borderLeft: `3px solid ${scoreColor(p.compositeScore)}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>#{p.rank} {p.ticker}</span>
                      <span style={{ fontSize: 11, color: scoreColor(p.compositeScore) }}>composite {fmtNum(p.compositeScore, 1)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#CBD5E1", marginBottom: 6 }}>{p.thesisOneLiner}</div>
                    <div style={{ fontSize: 11, color: "#FCA5A5", marginBottom: 4 }}>⚠ {p.primaryConcern}</div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Sector distribution */}
            <Section title="Sector distribution of top 10">
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#0F172A" }}>
                      {["Sector", "Count", "% of top 10", "Flag"].map((h) => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {memo.sectorDistribution.map((s) => (
                      <tr key={s.sector} style={{ borderTop: "1px solid #334155" }}>
                        <td style={td}>{s.sector}</td>
                        <td style={td}>{s.countInTop10}</td>
                        <td style={td}>{fmtNum(s.pctOfTop10, 1)}%</td>
                        <td style={td}><Pill value={s.flag} color={flagColor(s.flag)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, padding: 10, background: "#0F172A", borderRadius: 6, fontSize: 13 }}>
                <strong>Concentration verdict:</strong> {memo.concentrationVerdict}
              </div>
            </Section>

            {/* Watch list */}
            <Section title="Watch list — next 10 / what would push them in">
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#0F172A" }}>
                      {["Ticker", "Name / Sector", "Composite", "Blocking factor", "Trigger to promote"].map((h) => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {memo.watchList.map((w) => (
                      <tr key={w.ticker} style={{ borderTop: "1px solid #334155" }}>
                        <td style={{ ...td, fontWeight: 700 }}>{w.ticker}</td>
                        <td style={td}>
                          <div>{w.name ?? "—"}</div>
                          <div style={{ color: "#94A3B8", fontSize: 11 }}>{w.sector ?? "—"}</div>
                        </td>
                        <td style={{ ...td, color: scoreColor(w.compositeScore) }}>{fmtNum(w.compositeScore, 1)}</td>
                        <td style={{ ...td, color: "#FCA5A5" }}>{w.blockingFactor}</td>
                        <td style={{ ...td, color: "#10B981" }}>{w.trigger}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* Missing / unavailable sections */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <MissingCard title="Sentiment factor — UNAVAILABLE" reason={memo.sentimentFactorStatus.note}>
                <ul style={{ marginTop: 6, fontSize: 12, color: "#CBD5E1" }}>
                  {memo.sentimentFactorStatus.missingComponents.map((c) => <li key={c}>• {c}</li>)}
                </ul>
              </MissingCard>
              <MissingCard title="Historical backtest — QUALITATIVE ONLY" reason="No point-in-time PIT backtest is run server-side.">
                <div style={{ marginTop: 6, fontSize: 13, color: "#CBD5E1" }}>{memo.backtestContext.qualitativeRead}</div>
                <div style={{ marginTop: 6, fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>{memo.backtestContext.factorRegimeNote}</div>
              </MissingCard>
            </div>

            {/* Implementation */}
            <Section title="Implementation notes">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, fontSize: 13 }}>
                <div style={cardSub}>
                  <div style={subLabel}>Sequencing</div>
                  <div>{memo.implementationNotes.sequencing}</div>
                </div>
                <div style={cardSub}>
                  <div style={subLabel}>Sizing framework</div>
                  <div>{memo.implementationNotes.sizingFramework}</div>
                </div>
                <div style={cardSub}>
                  <div style={subLabel}>Rebalance cadence</div>
                  <div>{memo.implementationNotes.rebalanceCadence}</div>
                </div>
                <div style={cardSub}>
                  <div style={subLabel}>Capacity caveat</div>
                  <div>{memo.implementationNotes.capacityCaveat}</div>
                </div>
              </div>
            </Section>

            {/* Confirms / Invalidates / Risk */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
              <ListCard title="What confirms" items={memo.whatConfirms} color="#10B981" />
              <ListCard title="What invalidates" items={memo.whatInvalidates} color="#EF4444" />
              <Card title="Main risk" value={memo.mainRisk} color="#F59E0B" />
            </div>

            <Section title="Closing">
              <div style={{ fontSize: 14, color: "#CBD5E1", lineHeight: 1.55 }}>{memo.closingParagraph}</div>
            </Section>

            <div style={{ fontSize: 11, color: "#64748B", padding: 12, background: "#1E293B", borderRadius: 6, marginTop: 12 }}>
              <div><strong>Confidence:</strong> {meta.confidence} — {meta.confidenceReason}</div>
              <div><strong>Source:</strong> {meta.source} · <strong>Fetched:</strong> {meta.fetchedAt}</div>
              {meta.missingFields.length > 0 && (
                <div style={{ marginTop: 4 }}><strong>Universe-wide missing:</strong> {meta.missingFields.join(" · ")}</div>
              )}
              <div style={{ marginTop: 6, fontStyle: "italic" }}>{memo.disclaimer}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────── helpers ───────────── */

const th: React.CSSProperties = { padding: 8, textAlign: "left", color: "#94A3B8", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: 8, verticalAlign: "top" };
const cardSub: React.CSSProperties = { background: "#0F172A", padding: 10, borderRadius: 6 };
const subLabel: React.CSSProperties = { fontSize: 11, color: "#94A3B8", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 };

function Pill({ label, value, color }: { label?: string; value: string; color: string }) {
  return (
    <span style={{
      display: "inline-flex", gap: 6, alignItems: "center",
      padding: "3px 8px", borderRadius: 12, fontSize: 11,
      background: `${color}22`, color, border: `1px solid ${color}55`,
    }}>
      {label && <span style={{ opacity: 0.7 }}>{label}:</span>}
      <span style={{ fontWeight: 700 }}>{value}</span>
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#1E293B", padding: 16, borderRadius: 8, marginBottom: 16 }}>
      <h2 style={{ fontSize: 14, color: "#94A3B8", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>{title}</h2>
      {children}
    </div>
  );
}

function ScoreCard({ label, value }: { label: string; value: number | null | undefined }) {
  const color = scoreColor(value ?? null);
  return (
    <div style={{ background: "#1E293B", padding: 14, borderRadius: 8, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value ?? "—"}</div>
    </div>
  );
}

function Card({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div style={{ background: "#1E293B", padding: 14, borderRadius: 8, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{title}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color }}>{value}</div>
    </div>
  );
}

function ListCard({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div style={{ background: "#1E293B", padding: 14, borderRadius: 8, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>{title}</div>
      <ul style={{ fontSize: 13, color: "#CBD5E1", paddingLeft: 16 }}>
        {items.map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{x}</li>)}
      </ul>
    </div>
  );
}

function RecapCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "#0F172A", padding: 10, borderRadius: 6 }}>
      <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color ?? "#E2E8F0" }}>{value}</div>
    </div>
  );
}

function MissingCard({ title, reason, children }: { title: string; reason: string; children?: React.ReactNode }) {
  return (
    <div style={{ background: "#1E293B", padding: 14, borderRadius: 8, borderTop: "3px solid #EF4444" }}>
      <div style={{ fontSize: 11, color: "#FCA5A5", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 6 }}>{reason}</div>
      {children}
    </div>
  );
}
