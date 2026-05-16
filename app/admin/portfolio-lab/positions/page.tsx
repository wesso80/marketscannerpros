"use client";

/**
 * /admin/portfolio-lab/positions
 *
 * Full open-positions table with SL/TP proximity, mark-to-market P&L
 * and unrealised R-multiple. SIMULATED only.
 */
import React, { useCallback, useEffect, useState } from "react";

interface Position {
  id: string; symbol: string; assetClass: string; side: "LONG" | "SHORT";
  quantity: number; averageEntry: number; currentPrice: number | null;
  stopLoss: number | null; takeProfit1: number | null; takeProfit2: number | null; takeProfit3: number | null;
  unrealisedPnl: number; openRisk: number; currentRMultiple: number | null;
  status: string; openedAt: string; sourceOrderId: string | null;
}

export default function PortfolioLabPositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/portfolio-lab/positions", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setPositions(j?.data?.positions ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const close = async (id: string) => {
    const px = prompt("Manual sim exit price:");
    if (!px) return;
    const n = Number(px);
    if (!Number.isFinite(n) || n <= 0) { alert("Bad price"); return; }
    const r = await fetch("/api/admin/portfolio-lab/positions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId: id, exitPrice: n, reason: "manual_sim_close" }),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j?.error || `HTTP ${r.status}`); return; }
    await load();
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", color: "#E2E8F0", padding: 24 }}>
      <div style={{ maxWidth: 1440, margin: "0 auto" }}>
        <Header title="ARCA Open Positions (SIMULATED)" subtitle="Mark-to-market view. No broker." onReload={load} loading={loading} />
        {error && <ErrorBox text={error} />}
        {positions.length === 0 ? (
          <Empty text={loading ? "Loading…" : "No open positions."} />
        ) : (
          <table style={tbl}>
            <thead>
              <tr>
                {["Symbol", "Class", "Side", "Qty", "Entry", "Mark", "SL", "TP1", "TP2", "TP3", "Unrealised", "Open Risk", "R", "Status", ""].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} style={tr}>
                  <td style={td}><b>{p.symbol}</b></td>
                  <td style={td}>{p.assetClass}</td>
                  <td style={{ ...td, color: p.side === "LONG" ? "#10B981" : "#F87171" }}>{p.side}</td>
                  <td style={td}>{p.quantity}</td>
                  <td style={td}>{fmt(p.averageEntry)}</td>
                  <td style={td}>{fmt(p.currentPrice)}</td>
                  <td style={td}>{fmt(p.stopLoss)}</td>
                  <td style={td}>{fmt(p.takeProfit1)}</td>
                  <td style={td}>{fmt(p.takeProfit2)}</td>
                  <td style={td}>{fmt(p.takeProfit3)}</td>
                  <td style={{ ...td, color: p.unrealisedPnl >= 0 ? "#10B981" : "#F87171" }}>{fmtUsd(p.unrealisedPnl)}</td>
                  <td style={td}>{fmtUsd(p.openRisk)}</td>
                  <td style={td}>{p.currentRMultiple == null ? "—" : p.currentRMultiple.toFixed(2) + "R"}</td>
                  <td style={td}>{p.status}</td>
                  <td style={td}><button onClick={() => close(p.id)} style={btnTiny}>Close (sim)</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Shared stylish helpers
const tbl: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12, background: "#111827", border: "1px solid #1F2937", borderRadius: 8 };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #1F2937", color: "#64748B", fontWeight: 500 };
const td: React.CSSProperties = { padding: "6px 10px", color: "#E2E8F0", borderBottom: "1px solid #1F2937" };
const tr: React.CSSProperties = {};
const btnTiny: React.CSSProperties = { padding: "3px 8px", background: "#1F2937", color: "#F87171", border: "1px solid #334155", borderRadius: 4, cursor: "pointer", fontSize: 11 };

function Header({ title, subtitle, onReload, loading }: { title: string; subtitle: string; onReload: () => void; loading: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <div>
        <div style={{ fontSize: 11, color: "#64748B", letterSpacing: 1.5, textTransform: "uppercase" }}>SIMULATED · NO BROKER</div>
        <h1 style={{ fontSize: 22, color: "#F8FAFC", margin: "4px 0" }}>{title}</h1>
        <div style={{ fontSize: 12, color: "#64748B" }}>{subtitle}</div>
      </div>
      <button onClick={onReload} disabled={loading} style={{ padding: "8px 14px", background: "transparent", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>{loading ? "Loading…" : "Reload"}</button>
    </div>
  );
}
function ErrorBox({ text }: { text: string }) { return <div style={{ background: "#7F1D1D", border: "1px solid #F87171", color: "#FCA5A5", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>Error: {text}</div>; }
function Empty({ text }: { text: string }) { return <div style={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 24, color: "#64748B", textAlign: "center" as const, fontSize: 13 }}>{text}</div>; }
function fmt(n: number | null | undefined): string { if (n == null || !Number.isFinite(n)) return "—"; return Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 }); }
function fmtUsd(n: number | null | undefined): string { if (n == null || !Number.isFinite(n)) return "—"; return "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
