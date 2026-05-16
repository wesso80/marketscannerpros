"use client";

/**
 * /admin/portfolio-lab/trades
 *
 * Closed-trade ledger with outcome + R-multiple distribution.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";

interface Trade {
  id: string; symbol: string; assetClass: string; side: string; quantity: number;
  entryPrice: number; exitPrice: number; entryTime: string; exitTime: string;
  realisedPnl: number; rMultiple: number | null; feesEstimate: number;
  slippageEstimate: number; outcome: string; exitReason: string;
  playbookId: string | null; sourceEdgePacketId: string | null;
}

export default function PortfolioLabTradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/portfolio-lab/trades?limit=200", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setTrades(j?.data?.trades ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => {
    if (trades.length === 0) return null;
    const wins = trades.filter((t) => t.outcome === "WIN").length;
    const losses = trades.filter((t) => t.outcome === "LOSS").length;
    const breakeven = trades.filter((t) => t.outcome === "BREAKEVEN").length;
    const totalPnl = trades.reduce((s, t) => s + t.realisedPnl, 0);
    const rs = trades.map((t) => t.rMultiple).filter((r): r is number => r != null);
    const avgR = rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : 0;
    const winRate = (wins / Math.max(1, wins + losses)) * 100;
    return { count: trades.length, wins, losses, breakeven, totalPnl, avgR, winRate };
  }, [trades]);

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", color: "#E2E8F0", padding: 24 }}>
      <div style={{ maxWidth: 1440, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", letterSpacing: 1.5, textTransform: "uppercase" }}>SIMULATED · NO BROKER</div>
            <h1 style={{ fontSize: 22, color: "#F8FAFC", margin: "4px 0" }}>ARCA Closed Trades</h1>
          </div>
          <button onClick={load} disabled={loading} style={{ padding: "8px 14px", background: "transparent", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>{loading ? "Loading…" : "Reload"}</button>
        </div>
        {error && <div style={{ background: "#7F1D1D", color: "#FCA5A5", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>Error: {error}</div>}

        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 12 }}>
            <Kpi label="Closed Trades" value={String(stats.count)} />
            <Kpi label="Wins" value={String(stats.wins)} tone="good" />
            <Kpi label="Losses" value={String(stats.losses)} tone="bad" />
            <Kpi label="Breakeven" value={String(stats.breakeven)} />
            <Kpi label="Win Rate" value={stats.winRate.toFixed(1) + "%"} tone={stats.winRate >= 50 ? "good" : "bad"} />
            <Kpi label="Avg R" value={stats.avgR.toFixed(2) + "R"} tone={stats.avgR >= 0 ? "good" : "bad"} sub={fmtUsd(stats.totalPnl) + " total"} />
          </div>
        )}

        {trades.length === 0 ? (
          <div style={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 24, color: "#64748B", textAlign: "center", fontSize: 13 }}>{loading ? "Loading…" : "No closed trades."}</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: "#111827", border: "1px solid #1F2937", borderRadius: 8 }}>
            <thead>
              <tr>
                {["Exit Time", "Symbol", "Class", "Side", "Qty", "Entry", "Exit", "P&L", "R", "Outcome", "Exit Reason", "Playbook"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #1F2937", color: "#64748B", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid #1F2937" }}>
                  <td style={td}>{new Date(t.exitTime).toLocaleString()}</td>
                  <td style={td}><b>{t.symbol}</b></td>
                  <td style={td}>{t.assetClass}</td>
                  <td style={{ ...td, color: t.side === "LONG" || t.side === "BUY" ? "#10B981" : "#F87171" }}>{t.side}</td>
                  <td style={td}>{t.quantity}</td>
                  <td style={td}>{fmt(t.entryPrice)}</td>
                  <td style={td}>{fmt(t.exitPrice)}</td>
                  <td style={{ ...td, color: t.realisedPnl >= 0 ? "#10B981" : "#F87171" }}>{fmtUsd(t.realisedPnl)}</td>
                  <td style={td}>{t.rMultiple == null ? "—" : t.rMultiple.toFixed(2) + "R"}</td>
                  <td style={{ ...td, color: outcomeColor(t.outcome), fontWeight: 600 }}>{t.outcome}</td>
                  <td style={td}>{t.exitReason}</td>
                  <td style={td}>{t.playbookId || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
const td: React.CSSProperties = { padding: "6px 10px", color: "#E2E8F0" };
function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  const c = tone === "good" ? "#10B981" : tone === "bad" ? "#F87171" : "#F8FAFC";
  return (
    <div style={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: c, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function outcomeColor(o: string): string {
  if (o === "WIN") return "#10B981";
  if (o === "LOSS") return "#F87171";
  if (o === "BREAKEVEN") return "#FACC15";
  return "#94A3B8";
}
function fmt(n: number | null | undefined): string { if (n == null || !Number.isFinite(n)) return "—"; return Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 }); }
function fmtUsd(n: number | null | undefined): string { if (n == null || !Number.isFinite(n)) return "—"; return "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
