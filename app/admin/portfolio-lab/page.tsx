"use client";

/**
 * /admin/portfolio-lab
 *
 * ARCA Autonomous Portfolio Lab — admin-only SIMULATED paper trading.
 * One-screen dashboard: portfolio header, equity sparkline, open
 * positions, pending sim orders, recent risk events, recent journal.
 *
 * NO broker integration. NO order routing. Pure ledger.
 */

import React, { useCallback, useEffect, useState } from "react";

interface Portfolio {
  id: string;
  name: string;
  mode: "SIMULATED";
  startingBalance: number;
  currentCash: number;
  realisedPnl: number;
  unrealisedPnl: number;
  totalEquity: number;
  status: string;
}
interface Position {
  id: string;
  symbol: string;
  assetClass: string;
  side: "LONG" | "SHORT";
  quantity: number;
  averageEntry: number;
  currentPrice: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  unrealisedPnl: number;
  openRisk: number;
  currentRMultiple: number | null;
  status: string;
}
interface SimOrder {
  id: string;
  symbol: string;
  side: string;
  orderType: string;
  plannedEntry: number | null;
  triggerPrice: number | null;
  quantity: number;
  stopLoss: number | null;
  takeProfit1: number | null;
  status: string;
  createdReason: string | null;
}
interface JournalEntry {
  id: string;
  createdAt: string;
  journalType: string;
  title: string;
  symbol: string | null;
  arcaReasoning: string | null;
}
interface RiskEvent {
  id: string;
  createdAt: string;
  eventType: string;
  severity: string;
  message: string;
  acknowledged: boolean;
}
interface Snapshot {
  createdAt: string;
  totalEquity: number;
  realisedPnl: number;
  unrealisedPnl: number;
  drawdownPct: number | null;
  openPositionsCount: number;
  openRiskPct: number | null;
}
interface SummaryPayload {
  portfolio: Portfolio | null;
  positions?: Position[];
  orders?: SimOrder[];
  journal?: JournalEntry[];
  risk?: RiskEvent[];
  snapshots?: Snapshot[];
  disclaimer?: string;
}

export default function PortfolioLabPage() {
  const [data, setData] = useState<SummaryPayload | null>(null);
  const [meta, setMeta] = useState<{ source: string; freshness: string; fetchedAt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [cycling, setCycling] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cycleResult, setCycleResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/portfolio-lab/summary", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j?.data ?? null);
      setMeta({ source: j?.source ?? "?", freshness: j?.freshness ?? "?", fetchedAt: j?.fetchedAt ?? "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const initialise = async () => {
    setCreating(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/portfolio-lab/create-default", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const runCycle = async () => {
    setCycling(true);
    setCycleResult(null);
    setError(null);
    try {
      const r = await fetch("/api/admin/portfolio-lab/simulate-cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxNewIdeas: 5, sinceMinutes: 720 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      const res = j?.data;
      const baseLine =
        `Cycle ok — marked ${res?.positionsMarked ?? 0}, triggered ${res?.ordersTriggered ?? 0}, ` +
        `opened ${res?.positionsOpened ?? 0}, closed ${res?.positionsClosed ?? 0}, ` +
        `new orders ${res?.ordersCreated ?? 0}, rejections ${res?.rejections ?? 0}.`;
      const gateHist: Record<string, number> | undefined = res?.gateRejectionReasons;
      let gateLine = "";
      if (gateHist && Object.keys(gateHist).length > 0) {
        const top = Object.entries(gateHist).sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([k, v]) => `${k} ×${v}`).join(" · ");
        gateLine = `\nTop gate rejections: ${top}`;
      }
      const scanned = res?.candidatesScanned != null ? `\nScanned ${res.candidatesScanned} edge packets across ${res?.uniqueSymbolsSeen ?? "?"} unique symbols (${res?.gateRejections ?? 0} gated, ${res?.candidatesSelected ?? 0} selected).` : "";
      setCycleResult(baseLine + scanned + gateLine);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCycling(false);
    }
  };

  const closePos = async (positionId: string) => {
    const exitPrice = prompt("Manual exit price (SIMULATED):");
    if (!exitPrice) return;
    const px = Number(exitPrice);
    if (!Number.isFinite(px) || px <= 0) { alert("Bad price"); return; }
    try {
      const r = await fetch("/api/admin/portfolio-lab/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionId, exitPrice: px, reason: "manual_sim_close" }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const cancelOrder = async (orderId: string) => {
    if (!confirm("Cancel this sim order?")) return;
    try {
      const r = await fetch("/api/admin/portfolio-lab/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reason: "manual_cancel" }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const portfolio = data?.portfolio;
  const equityChangePct = portfolio
    ? ((portfolio.totalEquity - portfolio.startingBalance) / portfolio.startingBalance) * 100
    : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", color: "#E2E8F0", padding: 24 }}>
      <div style={{ maxWidth: 1440, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "#64748B", letterSpacing: 1.5, textTransform: "uppercase" }}>
              ARCA Autonomous Portfolio Lab · SIMULATED PAPER · NO BROKER
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "#F8FAFC", margin: "4px 0" }}>
              {portfolio?.name ?? "ARCA Internal Fund"}
            </h1>
            <div style={{ fontSize: 12, color: "#64748B" }}>
              {meta ? `${meta.source} · ${meta.freshness} · ${new Date(meta.fetchedAt).toLocaleTimeString()}` : "—"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!portfolio && (
              <button
                onClick={initialise}
                disabled={creating}
                style={btnPrimary}
              >
                {creating ? "Creating…" : "Initialise ARCA ($200,000)"}
              </button>
            )}
            {portfolio && (
              <>
                <button onClick={load} disabled={loading} style={btnGhost}>
                  {loading ? "Loading…" : "Reload"}
                </button>
                <button onClick={runCycle} disabled={cycling} style={btnPrimary}>
                  {cycling ? "Running cycle…" : "Run Sim Cycle"}
                </button>
              </>
            )}
          </div>
        </div>

        {error && <ErrorBox text={error} />}
        {cycleResult && (
          <div style={{ background: "#064E3B", border: "1px solid #10B981", color: "#A7F3D0", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
            {cycleResult}
          </div>
        )}

        {!portfolio && !loading && !error && (
          <div style={panel}>
            <div style={{ fontSize: 14, color: "#94A3B8", lineHeight: 1.6 }}>
              No ARCA portfolio yet for this workspace. Click <b style={{ color: "#F8FAFC" }}>Initialise ARCA</b> above to create
              the default <b>$200,000</b> simulated paper portfolio.
              <br /><br />
              <i style={{ color: "#64748B" }}>
                {data?.disclaimer || "ARCA is SIMULATED only. No broker integration exists."}
              </i>
            </div>
          </div>
        )}

        {portfolio && (
          <>
            {/* KPI strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 16 }}>
              <Kpi label="Total Equity" value={fmtUsd(portfolio.totalEquity)} sub={`${pct(equityChangePct)} since start`} tone={equityChangePct >= 0 ? "good" : "bad"} />
              <Kpi label="Cash" value={fmtUsd(portfolio.currentCash)} />
              <Kpi label="Realised P&L" value={fmtUsd(portfolio.realisedPnl)} tone={portfolio.realisedPnl >= 0 ? "good" : "bad"} />
              <Kpi label="Unrealised P&L" value={fmtUsd(portfolio.unrealisedPnl)} tone={portfolio.unrealisedPnl >= 0 ? "good" : "bad"} />
              <Kpi label="Open Positions" value={String(data?.positions?.length ?? 0)} />
              <Kpi label="Pending Orders" value={String(data?.orders?.length ?? 0)} />
            </div>

            {/* Equity sparkline */}
            <Spark snapshots={data?.snapshots ?? []} startingBalance={portfolio.startingBalance} />

            {/* Open Positions */}
            <Section title={`Open Positions (${data?.positions?.length ?? 0})`}>
              {(data?.positions?.length ?? 0) === 0 ? (
                <Empty text="No open positions." />
              ) : (
                <Table
                  head={["Symbol", "Side", "Qty", "Avg Entry", "Current", "SL", "TP1", "Unrealised", "Open Risk", "R", ""]}
                  rows={(data?.positions ?? []).map((p) => [
                    p.symbol,
                    p.side,
                    p.quantity,
                    fmt(p.averageEntry),
                    fmt(p.currentPrice),
                    fmt(p.stopLoss),
                    fmt(p.takeProfit1),
                    fmtTone(p.unrealisedPnl),
                    fmtUsd(p.openRisk),
                    p.currentRMultiple == null ? "—" : p.currentRMultiple.toFixed(2) + "R",
                    <button key={p.id} onClick={() => closePos(p.id)} style={btnTiny}>Close (sim)</button>,
                  ])}
                />
              )}
            </Section>

            {/* Pending Orders */}
            <Section title={`Pending Sim Orders (${data?.orders?.length ?? 0})`}>
              {(data?.orders?.length ?? 0) === 0 ? (
                <Empty text="No pending orders." />
              ) : (
                <Table
                  head={["Symbol", "Side", "Type", "Trigger", "Qty", "SL", "TP1", "Status", "Reason", ""]}
                  rows={(data?.orders ?? []).map((o) => [
                    o.symbol,
                    o.side,
                    o.orderType,
                    fmt(o.triggerPrice),
                    o.quantity,
                    fmt(o.stopLoss),
                    fmt(o.takeProfit1),
                    o.status,
                    truncate(o.createdReason, 60),
                    <button key={o.id} onClick={() => cancelOrder(o.id)} style={btnTiny}>Cancel</button>,
                  ])}
                />
              )}
            </Section>

            {/* Risk Events */}
            <Section title={`Risk Events (${data?.risk?.length ?? 0})`}>
              {(data?.risk?.length ?? 0) === 0 ? (
                <Empty text="No risk events." />
              ) : (
                <Table
                  head={["When", "Severity", "Type", "Message", "Ack?"]}
                  rows={(data?.risk ?? []).map((r) => [
                    new Date(r.createdAt).toLocaleString(),
                    <span key="sev" style={{ color: severityColor(r.severity), fontWeight: 600 }}>{r.severity}</span>,
                    r.eventType,
                    r.message,
                    r.acknowledged ? "✓" : "—",
                  ])}
                />
              )}
            </Section>

            {/* Journal */}
            <Section title={`Recent Journal (${data?.journal?.length ?? 0})`}>
              {(data?.journal?.length ?? 0) === 0 ? (
                <Empty text="No journal entries." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(data?.journal ?? []).map((j) => (
                    <div key={j.id} style={{ border: "1px solid #1F2937", borderRadius: 6, padding: 10, background: "#111827" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: "#64748B" }}>
                        <span><b style={{ color: journalColor(j.journalType) }}>{j.journalType}</b>{j.symbol ? ` · ${j.symbol}` : ""}</span>
                        <span>{new Date(j.createdAt).toLocaleString()}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#E2E8F0", marginTop: 4 }}>{j.title}</div>
                      {j.arcaReasoning && (
                        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{j.arcaReasoning}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <div style={{ marginTop: 16, padding: 10, background: "#0B1220", border: "1px solid #1F2937", borderRadius: 6, fontSize: 11, color: "#64748B", lineHeight: 1.5 }}>
              {data?.disclaimer || "ARCA is SIMULATED only. No broker integration exists."}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---- helpers + tiny components (kept inline to avoid file sprawl) ---- */

const panel: React.CSSProperties = { background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 16, marginBottom: 12 };
const btnPrimary: React.CSSProperties = { padding: "8px 14px", background: "#10B981", color: "#022C22", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnGhost: React.CSSProperties = { padding: "8px 14px", background: "transparent", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 6, cursor: "pointer", fontSize: 13 };
const btnTiny: React.CSSProperties = { padding: "3px 8px", background: "#1F2937", color: "#F87171", border: "1px solid #334155", borderRadius: 4, cursor: "pointer", fontSize: 11 };

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  const c = tone === "good" ? "#10B981" : tone === "bad" ? "#F87171" : "#F8FAFC";
  return (
    <div style={panel}>
      <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: c, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...panel, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "6px 10px", borderBottom: "1px solid #1F2937", color: "#64748B", fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #1F2937" }}>
              {row.map((c, j) => (
                <td key={j} style={{ padding: "6px 10px", color: "#E2E8F0" }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Spark({ snapshots, startingBalance }: { snapshots: Snapshot[]; startingBalance: number }) {
  if (snapshots.length < 2) {
    return (
      <div style={{ ...panel, height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B", fontSize: 12 }}>
        Equity curve will appear once snapshots accumulate.
      </div>
    );
  }
  const ordered = [...snapshots].reverse(); // oldest → newest
  const ys = ordered.map((s) => s.totalEquity);
  const min = Math.min(startingBalance, ...ys);
  const max = Math.max(startingBalance, ...ys);
  const range = Math.max(1, max - min);
  const w = 1000;
  const h = 100;
  const pts = ys.map((y, i) => {
    const x = (i / (ys.length - 1)) * w;
    const ny = h - ((y - min) / range) * (h - 10) - 5;
    return `${x.toFixed(1)},${ny.toFixed(1)}`;
  }).join(" ");
  const baselineY = h - ((startingBalance - min) / range) * (h - 10) - 5;
  return (
    <div style={panel}>
      <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Equity Curve (last {ordered.length} snapshots)</div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 100 }}>
        <line x1={0} x2={w} y1={baselineY} y2={baselineY} stroke="#334155" strokeWidth={1} strokeDasharray="3 3" />
        <polyline points={pts} fill="none" stroke="#10B981" strokeWidth={2} />
      </svg>
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{ background: "#7F1D1D", border: "1px solid #F87171", color: "#FCA5A5", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
      Error: {text}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 12, color: "#64748B", padding: 8 }}>{text}</div>;
}

function severityColor(s: string): string {
  if (s === "kill_switch") return "#F87171";
  if (s === "critical") return "#FB923C";
  if (s === "warning") return "#FACC15";
  return "#94A3B8";
}
function journalColor(t: string): string {
  if (t === "ENTRY") return "#10B981";
  if (t === "EXIT") return "#3B82F6";
  if (t === "REJECTED") return "#FB923C";
  if (t === "RISK_BLOCK") return "#F87171";
  if (t === "ERROR") return "#F87171";
  return "#94A3B8";
}

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 });
}
function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function fmtTone(n: number): React.ReactNode {
  const c = n >= 0 ? "#10B981" : "#F87171";
  return <span style={{ color: c }}>{fmtUsd(n)}</span>;
}
function pct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return sign + n.toFixed(2) + "%";
}
function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
