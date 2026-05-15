"use client";

/**
 * Admin Equity Research Brief — Goldman-style daily research note.
 *
 * Boundary: research-only. NO order, NO size, NO execution language.
 * Personal exposure is operator-set and DOES NOT alter the verdict.
 */

import { useCallback, useState } from "react";
import Link from "next/link";

type ExposureFlag = "none" | "low" | "elevated" | "high";

interface BriefResponse {
  data?: {
    note?: ResearchNote;
    fundamentals?: {
      endpointStatus: Record<string, string>;
      missingFields: string[];
      errors: string[];
    };
  };
  source?: string;
  fetchedAt?: string;
  freshness?: string;
  confidence?: string;
  confidenceReason?: string;
  missingFields?: string[];
  error?: string;
  detail?: string;
}

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
  profitability: {
    grossMarginTrend: string;
    operatingMarginTrend: string;
    netMarginTrend: string;
  };
  balanceSheet: {
    debtToEquity: string;
    currentRatio: string;
    cashVsDebt: string;
  };
  freeCashFlow: {
    fcfYield: string;
    fcfGrowth: string;
    capitalAllocation: string;
  };
  moat: {
    pricingPower: number;
    brandStrength: number;
    switchingCosts: number;
    networkEffects: number;
  };
  management: string;
  valuation: {
    peVsHistory: string;
    psVsHistory: string;
    evEbitdaVsPeers: string;
  };
  bullCase: string;
  bearCase: string;
  verdictParagraph: string;
}

export default function EquityResearchPage() {
  const [ticker, setTicker] = useState("");
  const [notes, setNotes] = useState("");
  const [exposure, setExposure] = useState<ExposureFlag>("none");
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<BriefResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setResp(null);
    try {
      const r = await fetch("/api/admin/equity-research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.trim().toUpperCase(),
          operatorNotes: notes,
          personalExposureFlag: exposure,
        }),
      });
      const body = (await r.json()) as BriefResponse;
      if (!r.ok) {
        setErr(body.error || `HTTP ${r.status}`);
      } else {
        setResp(body);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, [ticker, notes, exposure]);

  const note = resp?.data?.note;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0B1220",
        color: "#E5E7EB",
        padding: 20,
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: "#F9FAFB" }}>
            Equity Research Brief
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9CA3AF" }}>
            Goldman-style fundamental analysis · research-only · no execution.
          </p>
        </div>
        <Link href="/admin" style={navLink}>← Command Home</Link>
      </header>

      <section
        style={{
          background: "#0F172A",
          border: "1px solid #1F2937",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <label style={lbl}>
            Ticker
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="AAPL"
              maxLength={10}
              style={inp}
            />
          </label>
          <label style={lbl}>
            Personal exposure (operator-set)
            <select
              value={exposure}
              onChange={(e) => setExposure(e.target.value as ExposureFlag)}
              style={inp}
            >
              <option value="none">none</option>
              <option value="low">low</option>
              <option value="elevated">elevated</option>
              <option value="high">high</option>
            </select>
          </label>
          <label style={lbl}>
            Operator notes (optional)
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. concerns about ad-tier traction"
              maxLength={1000}
              style={inp}
            />
          </label>
        </div>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
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
          <span style={{ fontSize: 12, color: "#6B7280" }}>
            Pulls Alpha Vantage OVERVIEW + INCOME + BALANCE + CASHFLOW, then runs gpt-4.1.
          </span>
        </div>
      </section>

      {err ? (
        <div
          style={{
            padding: 12,
            background: "#2A0B0B",
            border: "1px solid #7F1D1D",
            borderRadius: 8,
            color: "#FCA5A5",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          Error: {err}
        </div>
      ) : null}

      {note ? <ResearchNoteView note={note} truth={resp!} /> : null}
    </main>
  );
}

function ResearchNoteView({
  note,
  truth,
}: {
  note: ResearchNote;
  truth: BriefResponse;
}) {
  const verdictColor =
    note.rating.verdict === "buy"
      ? "#10B981"
      : note.rating.verdict === "avoid"
        ? "#EF4444"
        : "#F59E0B";
  return (
    <article style={{ display: "grid", gap: 16 }}>
      {/* Top rating box */}
      <section
        style={{
          padding: 16,
          background: "#0F172A",
          border: `2px solid ${verdictColor}55`,
          borderRadius: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "#9CA3AF", letterSpacing: 0.3, textTransform: "uppercase" }}>
              Research Verdict
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 4 }}>
              <h2 style={{ margin: 0, fontSize: 28, color: "#F9FAFB" }}>{note.ticker}</h2>
              <span
                style={{
                  padding: "4px 12px",
                  background: `${verdictColor}22`,
                  color: verdictColor,
                  borderRadius: 6,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  fontSize: 14,
                }}
              >
                {note.rating.verdict} · conviction {note.rating.conviction}/5
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 6 }}>
              {truth.source} · {truth.freshness} · confidence {truth.confidence}
              {truth.confidenceReason ? ` — ${truth.confidenceReason}` : ""}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: 12 }}>
            <ScoreBox label="Opportunity" value={note.opportunityScore} color="#10B981" />
            <ScoreBox label="Evidence" value={note.evidenceQualityScore} color="#60A5FA" />
            <ExposureBox flag={note.personalExposureFlag} />
          </div>
        </div>
        <div style={{ marginTop: 12, padding: 10, background: "#0B1220", border: "1px solid #1F2937", borderRadius: 6 }}>
          <strong style={{ color: "#E5E7EB" }}>Confidence: </strong>
          <span style={{ color: "#D1D5DB" }}>{note.confidenceStatement}</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#9CA3AF" }}>
          Bull target: {fmtTarget(note.rating.bullTarget)} · Bear target:{" "}
          {fmtTarget(note.rating.bearTarget)}
        </div>
      </section>

      {/* Note body */}
      <Card title="Business Model">
        <p style={paraStyle}>{note.businessModel}</p>
      </Card>

      <Card title="Revenue Streams">
        <table style={{ width: "100%", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "#9CA3AF", textAlign: "left" }}>
              <th style={th}>Segment</th>
              <th style={th}>Share</th>
              <th style={th}>Growth</th>
            </tr>
          </thead>
          <tbody>
            {note.revenueStreams.map((s, i) => (
              <tr key={i} style={{ borderTop: "1px solid #1F2937" }}>
                <td style={td}>{s.segment}</td>
                <td style={td}>{s.share}</td>
                <td style={td}>{s.growth}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div style={grid2}>
        <Card title="Profitability (5y trend)">
          <KV k="Gross margin" v={note.profitability.grossMarginTrend} />
          <KV k="Operating margin" v={note.profitability.operatingMarginTrend} />
          <KV k="Net margin" v={note.profitability.netMarginTrend} />
        </Card>
        <Card title="Balance Sheet Health">
          <KV k="Debt-to-equity" v={note.balanceSheet.debtToEquity} />
          <KV k="Current ratio" v={note.balanceSheet.currentRatio} />
          <KV k="Cash vs debt" v={note.balanceSheet.cashVsDebt} />
        </Card>
      </div>

      <div style={grid2}>
        <Card title="Free Cash Flow">
          <KV k="FCF yield" v={note.freeCashFlow.fcfYield} />
          <KV k="FCF growth" v={note.freeCashFlow.fcfGrowth} />
          <KV k="Capital allocation" v={note.freeCashFlow.capitalAllocation} />
        </Card>
        <Card title="Valuation">
          <KV k="P/E vs 5y avg" v={note.valuation.peVsHistory} />
          <KV k="P/S vs 5y avg" v={note.valuation.psVsHistory} />
          <KV k="EV/EBITDA vs peers" v={note.valuation.evEbitdaVsPeers} />
        </Card>
      </div>

      <Card title="Competitive Moat (1–10)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          <Pillar label="Pricing power" v={note.moat.pricingPower} />
          <Pillar label="Brand strength" v={note.moat.brandStrength} />
          <Pillar label="Switching costs" v={note.moat.switchingCosts} />
          <Pillar label="Network effects" v={note.moat.networkEffects} />
        </div>
      </Card>

      <Card title="Management">
        <p style={paraStyle}>{note.management}</p>
      </Card>

      <div style={grid2}>
        <Card title="Bull Case (12-mo target)">
          <p style={paraStyle}>{note.bullCase}</p>
          <div style={{ fontSize: 12, color: "#10B981", marginTop: 6 }}>
            Bull target: {fmtTarget(note.rating.bullTarget)}
          </div>
        </Card>
        <Card title="Bear Case (12-mo target)">
          <p style={paraStyle}>{note.bearCase}</p>
          <div style={{ fontSize: 12, color: "#EF4444", marginTop: 6 }}>
            Bear target: {fmtTarget(note.rating.bearTarget)}
          </div>
        </Card>
      </div>

      <div style={grid2}>
        <Card title="What Confirms">
          <ul style={ul}>
            {note.whatConfirms.map((s, i) => (
              <li key={i} style={li}>{s}</li>
            ))}
          </ul>
        </Card>
        <Card title="What Invalidates">
          <ul style={ul}>
            {note.whatInvalidates.map((s, i) => (
              <li key={i} style={li}>{s}</li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Main Risk">
        <p style={{ ...paraStyle, color: "#FCA5A5" }}>{note.mainRisk}</p>
      </Card>

      <Card title="Verdict">
        <p style={paraStyle}>{note.verdictParagraph}</p>
        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 10 }}>
          Classification: ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION ·
          Personal exposure ({note.personalExposureFlag}) does NOT alter this verdict.
          Generated {note.generatedAt}.
        </div>
      </Card>

      {truth.data?.fundamentals?.errors?.length ? (
        <Card title="Data Fetch Diagnostics">
          <pre style={{ fontSize: 11, color: "#FCD34D", whiteSpace: "pre-wrap" }}>
            {JSON.stringify(truth.data.fundamentals, null, 2)}
          </pre>
        </Card>
      ) : null}
    </article>
  );
}

/* ───── small helpers ───── */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "#0F172A",
        border: "1px solid #1F2937",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <h3
        style={{
          margin: "0 0 10px",
          fontSize: 12,
          fontWeight: 700,
          color: "#9CA3AF",
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function ScoreBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "#0B1220", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 10px", minWidth: 90 }}>
      <div style={{ fontSize: 10, color: "#9CA3AF" }}>{label}</div>
      <div style={{ fontSize: 18, color, fontWeight: 700 }}>{Math.round(value)}</div>
    </div>
  );
}

function ExposureBox({ flag }: { flag: ExposureFlag }) {
  const c = flag === "none" ? "#6B7280" : flag === "high" ? "#EC4899" : "#F59E0B";
  return (
    <div style={{ background: "#0B1220", border: `1px solid ${c}33`, borderRadius: 6, padding: "6px 10px", minWidth: 90 }}>
      <div style={{ fontSize: 10, color: "#9CA3AF" }}>Exposure</div>
      <div style={{ fontSize: 14, color: c, fontWeight: 700 }}>{flag}</div>
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
      <div style={{ fontSize: 20, color: c, fontWeight: 700 }}>{v}/10</div>
    </div>
  );
}

function fmtTarget(n: number | null): string {
  return n == null ? "n/a" : `$${n.toFixed(2)}`;
}

const navLink: React.CSSProperties = {
  color: "#60A5FA",
  textDecoration: "none",
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #1F2937",
};
const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#9CA3AF" };
const inp: React.CSSProperties = {
  padding: "8px 10px",
  background: "#0B1220",
  border: "1px solid #1F2937",
  borderRadius: 6,
  color: "#E5E7EB",
  fontSize: 13,
};
const paraStyle: React.CSSProperties = { margin: 0, fontSize: 13, color: "#E5E7EB", lineHeight: 1.6 };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 };
const th: React.CSSProperties = { padding: "6px 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 };
const td: React.CSSProperties = { padding: "6px 4px", fontSize: 13, color: "#E5E7EB" };
const ul: React.CSSProperties = { listStyle: "none", padding: 0, margin: 0 };
const li: React.CSSProperties = { padding: "4px 0", fontSize: 13, color: "#E5E7EB", borderBottom: "1px solid #1F2937" };
