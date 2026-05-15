"use client";

/**
 * Admin Daily Brief — Goldman fundamental + Morgan Stanley technical
 * combined research note. Research-only. No execution.
 */

import { useCallback, useState } from "react";
import Link from "next/link";

type ExposureFlag = "none" | "low" | "elevated" | "high";
type Position = "long" | "short" | "watching";

interface ResearchNote {
  ticker: string;
  generatedAt: string;
  rating: {
    verdict: "buy" | "hold" | "avoid";
    conviction: number;
    bullTarget: number | null;
    bearTarget: number | null;
  };
  opportunityScore: number;
  evidenceQualityScore: number;
  personalExposureFlag: ExposureFlag;
  confidenceStatement: string;
  whatConfirms: string[];
  whatInvalidates: string[];
  mainRisk: string;
  businessModel: string;
  revenueStreams: Array<{ segment: string; share: string; growth: string }>;
  profitability: { grossMarginTrend: string; operatingMarginTrend: string; netMarginTrend: string };
  balanceSheet: { debtToEquity: string; currentRatio: string; cashVsDebt: string };
  freeCashFlow: { fcfYield: string; fcfGrowth: string; capitalAllocation: string };
  moat: { pricingPower: number; brandStrength: number; switchingCosts: number; networkEffects: number };
  management: string;
  valuation: { peVsHistory: string; psVsHistory: string; evEbitdaVsPeers: string };
  bullCase: string;
  bearCase: string;
  verdictParagraph: string;
}

interface TechnicalNote {
  ticker: string;
  generatedAt: string;
  position: Position;
  tradePlanSummary: {
    bias: "bullish" | "bearish" | "neutral";
    setupQuality: number;
    entryLevel: number | null;
    stopLevel: number | null;
    target1: number | null;
    target2: number | null;
    riskRewardRatio: string;
    timeframe: string;
  };
  opportunityScore: number;
  evidenceQualityScore: number;
  personalExposureFlag: ExposureFlag;
  confidenceStatement: string;
  whatConfirms: string[];
  whatInvalidates: string[];
  mainRisk: string;
  trendAnalysis: { daily: string; weekly: string; monthly: string };
  supportResistance: { keySupport: string; keyResistance: string; commentary: string };
  movingAverages: string;
  rsi: string;
  macd: string;
  bbands: string;
  volume: string;
  fibonacci: string;
  chartPattern: string;
  verdictParagraph: string;
  classification: string;
  disclaimer: string;
}

interface BriefResponse {
  data?: {
    ticker: string;
    position: Position;
    fundamentalsNote: ResearchNote | null;
    technicalNote: TechnicalNote | null;
    synthesis: {
      alignment: "aligned-bullish" | "aligned-bearish" | "conflicting" | "insufficient-data";
      summary: string;
    };
    diagnostics: {
      fundamentals: {
        endpointStatus: Record<string, string>;
        missingFields: string[];
        errors: string[];
      } | null;
      technical: {
        status: string;
        error: string | null;
        missingFields: string[];
        lastBarDate: string | null;
      } | null;
      aiErrors: string[];
    };
  };
  source?: string;
  fetchedAt?: string;
  freshness?: string;
  confidence?: string;
  confidenceReason?: string;
  error?: string;
  detail?: string;
}

export default function DailyBriefPage() {
  const [ticker, setTicker] = useState("");
  const [position, setPosition] = useState<Position>("watching");
  const [exposure, setExposure] = useState<ExposureFlag>("none");
  const [notes, setNotes] = useState("");
  const [skipFund, setSkipFund] = useState(false);
  const [skipTech, setSkipTech] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<BriefResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setResp(null);
    try {
      const r = await fetch("/api/admin/daily-brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.trim().toUpperCase(),
          position,
          personalExposureFlag: exposure,
          operatorNotes: notes,
          skipFundamentals: skipFund,
          skipTechnical: skipTech,
        }),
      });
      const body = (await r.json()) as BriefResponse;
      if (!r.ok) setErr(body.error || `HTTP ${r.status}`);
      else setResp(body);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, [ticker, position, exposure, notes, skipFund, skipTech]);

  return (
    <main style={{ minHeight: "100vh", background: "#0B1220", color: "#E5E7EB", padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: "#F9FAFB" }}>Daily Brief</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9CA3AF" }}>
            Goldman fundamentals + Morgan Stanley technicals · research-only · no execution.
          </p>
        </div>
        <Link href="/admin" style={navLink}>← Command Home</Link>
      </header>

      {/* Controls */}
      <section style={{ background: "#0F172A", border: "1px solid #1F2937", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          <label style={lbl}>
            Ticker
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="AAPL" maxLength={10} style={inp} />
          </label>
          <label style={lbl}>
            Position interest
            <select value={position} onChange={(e) => setPosition(e.target.value as Position)} style={inp}>
              <option value="watching">watching</option>
              <option value="long">long bias</option>
              <option value="short">short bias</option>
            </select>
          </label>
          <label style={lbl}>
            Personal exposure (operator-set)
            <select value={exposure} onChange={(e) => setExposure(e.target.value as ExposureFlag)} style={inp}>
              <option value="none">none</option>
              <option value="low">low</option>
              <option value="elevated">elevated</option>
              <option value="high">high</option>
            </select>
          </label>
          <label style={lbl}>
            Operator notes (optional)
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="context to bias the brief" maxLength={1000} style={inp} />
          </label>
        </div>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={run}
            disabled={loading || !ticker.trim()}
            style={{
              padding: "8px 16px",
              background: loading ? "#1F2937" : "#10B981",
              color: "#0B1220",
              border: "none",
              borderRadius: 6,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Generating…" : "Generate brief"}
          </button>
          <label style={{ fontSize: 12, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={skipFund} onChange={(e) => setSkipFund(e.target.checked)} /> Skip fundamentals
          </label>
          <label style={{ fontSize: 12, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={skipTech} onChange={(e) => setSkipTech(e.target.checked)} /> Skip technical
          </label>
          <span style={{ fontSize: 12, color: "#6B7280" }}>
            One AV fundamentals bundle + one TIME_SERIES_DAILY → indicators computed locally → gpt-4.1.
          </span>
        </div>
      </section>

      {err ? (
        <div style={{ padding: 12, background: "#2A0B0B", border: "1px solid #7F1D1D", borderRadius: 8, color: "#FCA5A5", fontSize: 13, marginBottom: 16 }}>
          Error: {err}
        </div>
      ) : null}

      {resp?.data ? <BriefView resp={resp} /> : null}
    </main>
  );
}

/* ───────── Brief view ───────── */

function BriefView({ resp }: { resp: BriefResponse }) {
  const d = resp.data!;
  const synth = d.synthesis;
  const synthColor =
    synth.alignment === "aligned-bullish" ? "#10B981" :
    synth.alignment === "aligned-bearish" ? "#EF4444" :
    synth.alignment === "conflicting" ? "#F59E0B" : "#6B7280";

  return (
    <article style={{ display: "grid", gap: 16 }}>
      {/* Header strip */}
      <section style={{ padding: 14, background: "#0F172A", border: `2px solid ${synthColor}55`, borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#9CA3AF", letterSpacing: 0.4, textTransform: "uppercase" }}>Combined Synthesis</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 4 }}>
              <h2 style={{ margin: 0, fontSize: 28, color: "#F9FAFB" }}>{d.ticker}</h2>
              <span style={{
                padding: "4px 12px",
                background: `${synthColor}22`,
                color: synthColor,
                borderRadius: 6,
                fontWeight: 700,
                textTransform: "uppercase",
                fontSize: 13,
              }}>
                {synth.alignment.replace("-", " ")}
              </span>
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>position interest: {d.position}</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: "#E5E7EB" }}>{synth.summary}</div>
            <div style={{ marginTop: 8, fontSize: 11, color: "#6B7280" }}>
              {resp.source} · {resp.freshness} · confidence {resp.confidence}
              {resp.confidenceReason ? ` — ${resp.confidenceReason}` : ""}
            </div>
          </div>
        </div>
      </section>

      {/* Trade plan summary (technical) */}
      {d.technicalNote ? <TradePlanCard note={d.technicalNote} /> : null}

      {/* Two-column main brief */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ display: "grid", gap: 16 }}>
          <SectionHeader title="Fundamental view (Goldman-style)" />
          {d.fundamentalsNote ? <FundamentalsBlock note={d.fundamentalsNote} /> : <SkippedCard label="Fundamentals not generated." />}
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          <SectionHeader title="Technical view (Morgan Stanley-style)" />
          {d.technicalNote ? <TechnicalBlock note={d.technicalNote} /> : <SkippedCard label="Technical not generated." />}
        </div>
      </div>

      {/* Diagnostics */}
      <Card title="Data Diagnostics">
        <pre style={{ fontSize: 11, color: "#9CA3AF", whiteSpace: "pre-wrap", margin: 0 }}>
          {JSON.stringify(d.diagnostics, null, 2)}
        </pre>
      </Card>
    </article>
  );
}

/* ───────── Trade plan ───────── */

function TradePlanCard({ note }: { note: TechnicalNote }) {
  const t = note.tradePlanSummary;
  const biasColor = t.bias === "bullish" ? "#10B981" : t.bias === "bearish" ? "#EF4444" : "#F59E0B";
  return (
    <section style={{ padding: 14, background: "#0F172A", border: "1px solid #1F2937", borderRadius: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#9CA3AF", letterSpacing: 0.4, textTransform: "uppercase" }}>
          Analytical Levels (NOT orders)
        </div>
        <span style={{ padding: "3px 10px", background: `${biasColor}22`, color: biasColor, borderRadius: 5, fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>
          {t.bias} · setup {t.setupQuality}/5
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
        <Stat label="Entry ref" value={fmtNum(t.entryLevel)} color="#60A5FA" />
        <Stat label="Stop ref" value={fmtNum(t.stopLevel)} color="#EF4444" />
        <Stat label="Target 1" value={fmtNum(t.target1)} color="#10B981" />
        <Stat label="Target 2" value={fmtNum(t.target2)} color="#10B981" />
        <Stat label="R:R" value={t.riskRewardRatio || "n/a"} color="#E5E7EB" />
        <Stat label="Timeframe" value={t.timeframe || "n/a"} color="#E5E7EB" />
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: "#6B7280", fontStyle: "italic" }}>
        {note.disclaimer}
      </div>
    </section>
  );
}

/* ───────── Fundamentals block ───────── */

function FundamentalsBlock({ note }: { note: ResearchNote }) {
  const verdictColor =
    note.rating.verdict === "buy" ? "#10B981" :
    note.rating.verdict === "avoid" ? "#EF4444" : "#F59E0B";
  return (
    <>
      <section style={{ padding: 14, background: "#0F172A", border: `2px solid ${verdictColor}55`, borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <span style={{
              padding: "3px 10px",
              background: `${verdictColor}22`,
              color: verdictColor,
              borderRadius: 5,
              fontWeight: 700,
              textTransform: "uppercase",
              fontSize: 13,
            }}>
              {note.rating.verdict} · conviction {note.rating.conviction}/5
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, auto)", gap: 8 }}>
            <ScoreBox label="Opp" value={note.opportunityScore} color="#10B981" />
            <ScoreBox label="Evidence" value={note.evidenceQualityScore} color="#60A5FA" />
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#D1D5DB" }}>
          <strong>Confidence: </strong>{note.confidenceStatement}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: "#9CA3AF" }}>
          Bull: {fmtTarget(note.rating.bullTarget)} · Bear: {fmtTarget(note.rating.bearTarget)}
        </div>
      </section>

      <Card title="Business Model"><p style={para}>{note.businessModel}</p></Card>

      <Card title="Profitability">
        <KV k="Gross margin" v={note.profitability.grossMarginTrend} />
        <KV k="Operating margin" v={note.profitability.operatingMarginTrend} />
        <KV k="Net margin" v={note.profitability.netMarginTrend} />
      </Card>

      <Card title="Balance Sheet">
        <KV k="Debt-to-equity" v={note.balanceSheet.debtToEquity} />
        <KV k="Current ratio" v={note.balanceSheet.currentRatio} />
        <KV k="Cash vs debt" v={note.balanceSheet.cashVsDebt} />
      </Card>

      <Card title="Free Cash Flow">
        <KV k="FCF yield" v={note.freeCashFlow.fcfYield} />
        <KV k="FCF growth" v={note.freeCashFlow.fcfGrowth} />
        <KV k="Capital allocation" v={note.freeCashFlow.capitalAllocation} />
      </Card>

      <Card title="Valuation">
        <KV k="P/E vs 5y" v={note.valuation.peVsHistory} />
        <KV k="P/S vs 5y" v={note.valuation.psVsHistory} />
        <KV k="EV/EBITDA vs peers" v={note.valuation.evEbitdaVsPeers} />
      </Card>

      <Card title="Moat (1–10)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          <Pillar label="Pricing power" v={note.moat.pricingPower} />
          <Pillar label="Brand strength" v={note.moat.brandStrength} />
          <Pillar label="Switching costs" v={note.moat.switchingCosts} />
          <Pillar label="Network effects" v={note.moat.networkEffects} />
        </div>
      </Card>

      <Card title="Bull / Bear Case">
        <div style={{ marginBottom: 8 }}>
          <strong style={{ color: "#10B981", fontSize: 12 }}>Bull:</strong>
          <p style={para}>{note.bullCase}</p>
        </div>
        <div>
          <strong style={{ color: "#EF4444", fontSize: 12 }}>Bear:</strong>
          <p style={para}>{note.bearCase}</p>
        </div>
      </Card>

      <Card title="Fundamental Verdict">
        <p style={para}>{note.verdictParagraph}</p>
      </Card>
    </>
  );
}

/* ───────── Technical block ───────── */

function TechnicalBlock({ note }: { note: TechnicalNote }) {
  return (
    <>
      <Card title="Trend (multi-timeframe)">
        <KV k="Daily" v={note.trendAnalysis.daily} />
        <KV k="Weekly" v={note.trendAnalysis.weekly} />
        <KV k="Monthly" v={note.trendAnalysis.monthly} />
      </Card>

      <Card title="Support / Resistance">
        <KV k="Key support" v={note.supportResistance.keySupport} />
        <KV k="Key resistance" v={note.supportResistance.keyResistance} />
        <p style={para}>{note.supportResistance.commentary}</p>
      </Card>

      <Card title="Moving Averages"><p style={para}>{note.movingAverages}</p></Card>
      <Card title="RSI"><p style={para}>{note.rsi}</p></Card>
      <Card title="MACD"><p style={para}>{note.macd}</p></Card>
      <Card title="Bollinger Bands"><p style={para}>{note.bbands}</p></Card>
      <Card title="Volume"><p style={para}>{note.volume}</p></Card>
      <Card title="Fibonacci"><p style={para}>{note.fibonacci}</p></Card>
      <Card title="Chart Pattern"><p style={para}>{note.chartPattern}</p></Card>

      <Card title="What Confirms / Invalidates">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <strong style={{ color: "#10B981", fontSize: 12 }}>Confirms:</strong>
            <ul style={ul}>{note.whatConfirms.map((s, i) => <li key={i} style={li}>{s}</li>)}</ul>
          </div>
          <div>
            <strong style={{ color: "#EF4444", fontSize: 12 }}>Invalidates:</strong>
            <ul style={ul}>{note.whatInvalidates.map((s, i) => <li key={i} style={li}>{s}</li>)}</ul>
          </div>
        </div>
      </Card>

      <Card title="Main Risk">
        <p style={{ ...para, color: "#FCA5A5" }}>{note.mainRisk}</p>
      </Card>

      <Card title="Technical Verdict">
        <p style={para}>{note.verdictParagraph}</p>
        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 8 }}>
          {note.classification} · personal exposure ({note.personalExposureFlag}) does NOT alter this verdict.
        </div>
      </Card>
    </>
  );
}

/* ───────── Helpers ───────── */

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 11, color: "#60A5FA", letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "1px solid #1F2937", paddingBottom: 6 }}>
      {title}
    </div>
  );
}

function SkippedCard({ label }: { label: string }) {
  return (
    <section style={{ padding: 16, background: "#0F172A", border: "1px dashed #1F2937", borderRadius: 12, color: "#6B7280", fontSize: 13 }}>
      {label}
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "#0F172A", border: "1px solid #1F2937", borderRadius: 12, padding: 14 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: 0.4, textTransform: "uppercase" }}>{title}</h3>
      {children}
    </section>
  );
}

function ScoreBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "#0B1220", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 10px", minWidth: 70 }}>
      <div style={{ fontSize: 10, color: "#9CA3AF" }}>{label}</div>
      <div style={{ fontSize: 16, color, fontWeight: 700 }}>{Math.round(value)}</div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "#0B1220", border: "1px solid #1F2937", borderRadius: 6, padding: 8, textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 14, color, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1F2937", fontSize: 13 }}>
      <span style={{ color: "#9CA3AF" }}>{k}</span>
      <span style={{ color: "#E5E7EB", textAlign: "right", maxWidth: "60%" }}>{v}</span>
    </div>
  );
}

function Pillar({ label, v }: { label: string; v: number }) {
  const c = v >= 8 ? "#10B981" : v >= 5 ? "#60A5FA" : "#F59E0B";
  return (
    <div style={{ background: "#0B1220", border: "1px solid #1F2937", borderRadius: 6, padding: 8, textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "#9CA3AF" }}>{label}</div>
      <div style={{ fontSize: 18, color: c, fontWeight: 700 }}>{v}/10</div>
    </div>
  );
}

function fmtTarget(n: number | null): string { return n == null ? "n/a" : `$${n.toFixed(2)}`; }
function fmtNum(n: number | null): string { return n == null ? "n/a" : n < 1 ? n.toFixed(4) : n.toFixed(2); }

const navLink: React.CSSProperties = { color: "#60A5FA", textDecoration: "none", padding: "6px 10px", borderRadius: 6, border: "1px solid #1F2937" };
const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#9CA3AF" };
const inp: React.CSSProperties = { padding: "8px 10px", background: "#0B1220", border: "1px solid #1F2937", borderRadius: 6, color: "#E5E7EB", fontSize: 13 };
const para: React.CSSProperties = { margin: "4px 0 0", fontSize: 13, color: "#E5E7EB", lineHeight: 1.55 };
const ul: React.CSSProperties = { listStyle: "none", padding: 0, margin: "4px 0 0" };
const li: React.CSSProperties = { padding: "3px 0", fontSize: 12, color: "#E5E7EB", borderBottom: "1px solid #1F2937" };
