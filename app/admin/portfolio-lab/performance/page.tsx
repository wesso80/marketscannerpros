"use client";

/**
 * /admin/portfolio-lab/performance
 *
 * Risk-adjusted metrics, equity curve vs benchmark, drawdown, and
 * playbook performance rollup. Admin-only. SIMULATED only.
 */
import React, { useCallback, useEffect, useState } from "react";

interface PerfPayload {
  portfolio: { id: string; name: string; startingBalance: number; totalEquity: number; realisedPnl: number; unrealisedPnl: number } | null;
  performance: {
    totalReturnPct: number; maxDrawdownPct: number; currentDrawdownPct: number;
    sharpe: number | null; sortino: number | null; volAnnualisedPct: number | null;
    closedTrades: number; wins: number; losses: number; winRatePct: number | null;
    avgR: number | null; avgWinR: number | null; avgLossR: number | null;
    expectancyR: number | null; profitFactor: number | null;
    largestWin: number; largestLoss: number;
    currentWinStreak: number; currentLossStreak: number;
    longestWinStreak: number; longestLossStreak: number;
    basedOnSnapshots: number; basedOnTrades: number; computedAt: string;
  };
  benchmark: Array<{ snapshotAt: string; benchmarkSymbol: string; benchmarkValue: number; benchmarkReturnPct: number | null; arcaReturnPct: number | null; relativePerformancePct: number | null }>;
  playbooks: Array<{ playbookId: string; tradesTaken: number; wins: number; losses: number; winRate: number | null; averageR: number | null; totalPnl: number; expectancy: number | null; bestAssetClass: string | null; worstAssetClass: string | null; lastUpdated: string }>;
  equityCurve: Array<{ at: string; equity: number; drawdownPct: number | null }>;
  disclaimer?: string;
}

export default function PortfolioLabPerformancePage() {
  const [data, setData] = useState<PerfPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/portfolio-lab/performance", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j?.data ?? j);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", color: "#E2E8F0", padding: 24 }}>
      <div style={{ maxWidth: 1440, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", letterSpacing: 1.5, textTransform: "uppercase" }}>SIMULATED · NO BROKER</div>
            <h1 style={{ fontSize: 22, color: "#F8FAFC", margin: "4px 0" }}>ARCA Performance</h1>
          </div>
          <button onClick={load} disabled={loading} style={btnGhost}>{loading ? "Loading…" : "Reload"}</button>
        </div>

        {error && <div style={errBox}>Error: {error}</div>}
        {!data?.portfolio && !loading && (
          <div style={emptyBox}>No ARCA portfolio. Initialise from the dashboard.</div>
        )}

        {data?.portfolio && data.performance && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 12 }}>
              <Kpi label="Equity" value={fmtUsd(data.portfolio.totalEquity)} sub={`from ${fmtUsd(data.portfolio.startingBalance)}`} />
              <Kpi label="Total Return" value={signPct(data.performance.totalReturnPct)} tone={data.performance.totalReturnPct >= 0 ? "good" : "bad"} />
              <Kpi label="Max Drawdown" value={data.performance.maxDrawdownPct.toFixed(2) + "%"} tone={data.performance.maxDrawdownPct > 10 ? "bad" : "neutral"} sub={`now ${data.performance.currentDrawdownPct.toFixed(2)}%`} />
              <Kpi label="Sharpe" value={data.performance.sharpe == null ? "n/a" : data.performance.sharpe.toFixed(2)} />
              <Kpi label="Sortino" value={data.performance.sortino == null ? "n/a" : data.performance.sortino.toFixed(2)} />
              <Kpi label="Vol (ann)" value={data.performance.volAnnualisedPct == null ? "n/a" : data.performance.volAnnualisedPct.toFixed(2) + "%"} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 16 }}>
              <Kpi label="Trades" value={String(data.performance.closedTrades)} sub={`${data.performance.wins}W / ${data.performance.losses}L`} />
              <Kpi label="Win Rate" value={data.performance.winRatePct == null ? "n/a" : data.performance.winRatePct.toFixed(1) + "%"} tone={(data.performance.winRatePct ?? 0) >= 50 ? "good" : "neutral"} />
              <Kpi label="Avg R" value={data.performance.avgR == null ? "n/a" : data.performance.avgR.toFixed(2) + "R"} tone={(data.performance.avgR ?? 0) >= 0 ? "good" : "bad"} />
              <Kpi label="Expectancy" value={data.performance.expectancyR == null ? "n/a" : data.performance.expectancyR.toFixed(2) + "R"} tone={(data.performance.expectancyR ?? 0) >= 0 ? "good" : "bad"} sub={`avgW ${data.performance.avgWinR?.toFixed(2) ?? "?"} / avgL ${data.performance.avgLossR?.toFixed(2) ?? "?"}`} />
              <Kpi label="Profit Factor" value={data.performance.profitFactor == null ? "n/a" : data.performance.profitFactor.toFixed(2)} />
              <Kpi label="Streak" value={`${data.performance.currentWinStreak}W / ${data.performance.currentLossStreak}L`} sub={`max ${data.performance.longestWinStreak}W / ${data.performance.longestLossStreak}L`} />
            </div>

            <section style={card}>
              <h2 style={h2}>Equity Curve</h2>
              <EquitySpark points={data.equityCurve.map((p) => p.equity)} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748B", marginTop: 6 }}>
                <span>{data.equityCurve[0]?.at?.slice(0, 10) ?? "—"}</span>
                <span>{data.performance.basedOnSnapshots} snapshots · computed {new Date(data.performance.computedAt).toLocaleString()}</span>
                <span>{data.equityCurve[data.equityCurve.length - 1]?.at?.slice(0, 10) ?? "—"}</span>
              </div>
            </section>

            <section style={card}>
              <h2 style={h2}>vs Benchmark ({data.benchmark[0]?.benchmarkSymbol ?? "SPY"})</h2>
              {data.benchmark.length === 0 ? (
                <div style={{ color: "#64748B", fontSize: 12 }}>No benchmark snapshots yet — first cycle will capture one.</div>
              ) : (
                <table style={table}>
                  <thead><tr>{["Snapshot", "Benchmark $", "Benchmark %", "ARCA %", "Relative"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.benchmark.slice(0, 20).map((b, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #1F2937" }}>
                        <td style={td}>{new Date(b.snapshotAt).toLocaleString()}</td>
                        <td style={td}>${b.benchmarkValue.toFixed(2)}</td>
                        <td style={td}>{b.benchmarkReturnPct == null ? "—" : signPct(b.benchmarkReturnPct)}</td>
                        <td style={td}>{b.arcaReturnPct == null ? "—" : signPct(b.arcaReturnPct)}</td>
                        <td style={{ ...td, color: (b.relativePerformancePct ?? 0) >= 0 ? "#10B981" : "#EF4444" }}>{b.relativePerformancePct == null ? "—" : signPct(b.relativePerformancePct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section style={card}>
              <h2 style={h2}>Playbook Performance</h2>
              {data.playbooks.length === 0 ? (
                <div style={{ color: "#64748B", fontSize: 12 }}>No playbook rollups yet — first complete cycle will populate.</div>
              ) : (
                <table style={table}>
                  <thead><tr>{["Playbook", "Trades", "WR", "Avg R", "Exp R", "Total P&L", "Best Class", "Worst Class"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.playbooks.map((p) => (
                      <tr key={p.playbookId} style={{ borderTop: "1px solid #1F2937" }}>
                        <td style={{ ...td, fontWeight: 600 }}>{p.playbookId}</td>
                        <td style={td}>{p.tradesTaken} ({p.wins}W/{p.losses}L)</td>
                        <td style={td}>{p.winRate == null ? "—" : p.winRate.toFixed(1) + "%"}</td>
                        <td style={td}>{p.averageR == null ? "—" : p.averageR.toFixed(2)}</td>
                        <td style={td}>{p.expectancy == null ? "—" : p.expectancy.toFixed(2)}</td>
                        <td style={{ ...td, color: p.totalPnl >= 0 ? "#10B981" : "#EF4444" }}>{fmtUsd(p.totalPnl)}</td>
                        <td style={td}>{p.bestAssetClass ?? "—"}</td>
                        <td style={td}>{p.worstAssetClass ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {data.disclaimer && (
              <div style={{ fontSize: 11, color: "#64748B", padding: "12px 4px", lineHeight: 1.5 }}>{data.disclaimer}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "neutral" }) {
  const colour = tone === "good" ? "#10B981" : tone === "bad" ? "#EF4444" : "#F8FAFC";
  return (
    <div style={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 10, color: "#64748B", letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 18, color: colour, fontWeight: 600, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function EquitySpark({ points }: { points: number[] }) {
  if (points.length < 2) return <div style={{ color: "#64748B", fontSize: 12 }}>Not enough snapshots to render.</div>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 1200, h = 160;
  const step = w / (points.length - 1);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(h - ((p - min) / range) * h).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const colour = last >= first ? "#10B981" : "#EF4444";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 160, background: "#0B1220", borderRadius: 6 }}>
      <path d={path} fill="none" stroke={colour} strokeWidth={2} />
    </svg>
  );
}

const card: React.CSSProperties = { background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 16, marginBottom: 12 };
const h2: React.CSSProperties = { fontSize: 14, color: "#F8FAFC", margin: "0 0 10px 0" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", color: "#64748B", fontWeight: 500, borderBottom: "1px solid #1F2937" };
const td: React.CSSProperties = { padding: "8px 10px", color: "#E2E8F0" };
const btnGhost: React.CSSProperties = { padding: "8px 14px", background: "transparent", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 6, cursor: "pointer", fontSize: 13 };
const errBox: React.CSSProperties = { background: "#7F1D1D", color: "#FCA5A5", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 };
const emptyBox: React.CSSProperties = { background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 24, color: "#64748B", textAlign: "center", fontSize: 13 };

function fmtUsd(n: number) { return "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
function signPct(n: number) { return (n >= 0 ? "+" : "") + n.toFixed(2) + "%"; }
