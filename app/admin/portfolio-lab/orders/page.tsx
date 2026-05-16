"use client";

/**
 * /admin/portfolio-lab/orders
 *
 * Full simulated-order ledger with status filter and cancel action.
 */
import React, { useCallback, useEffect, useState } from "react";

interface SimOrder {
  id: string; symbol: string; assetClass: string; side: string; orderType: string;
  plannedEntry: number | null; triggerPrice: number | null; filledPrice: number | null;
  quantity: number; notional: number | null; stopLoss: number | null;
  takeProfit1: number | null; status: string; sourceEdgePacketId: string | null;
  playbookId: string | null; createdReason: string | null; createdAt: string;
  triggeredAt: string | null; filledAt: string | null; cancelledAt: string | null;
}

const STATUSES = ["", "WAITING_FOR_TRIGGER", "PLANNED", "TRIGGERED", "FILLED_SIM", "CANCELLED", "EXPIRED", "INVALIDATED_BEFORE_FILL"];

export default function PortfolioLabOrdersPage() {
  const [orders, setOrders] = useState<SimOrder[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const url = "/api/admin/portfolio-lab/orders" + (status ? `?status=${status}` : "");
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setOrders(j?.data?.orders ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { void load(); }, [load]);

  const cancel = async (id: string) => {
    if (!confirm("Cancel this sim order?")) return;
    const r = await fetch("/api/admin/portfolio-lab/orders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: id, reason: "manual_cancel" }),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j?.error || `HTTP ${r.status}`); return; }
    await load();
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", color: "#E2E8F0", padding: 24 }}>
      <div style={{ maxWidth: 1440, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", letterSpacing: 1.5, textTransform: "uppercase" }}>SIMULATED · NO BROKER</div>
            <h1 style={{ fontSize: 22, color: "#F8FAFC", margin: "4px 0" }}>ARCA Simulated Orders</h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ background: "#111827", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}>
              {STATUSES.map((s) => <option key={s} value={s}>{s || "all statuses"}</option>)}
            </select>
            <button onClick={load} disabled={loading} style={{ padding: "8px 14px", background: "transparent", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>{loading ? "Loading…" : "Reload"}</button>
          </div>
        </div>
        {error && <div style={{ background: "#7F1D1D", color: "#FCA5A5", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>Error: {error}</div>}
        {orders.length === 0 ? (
          <div style={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 24, color: "#64748B", textAlign: "center", fontSize: 13 }}>{loading ? "Loading…" : "No orders match."}</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: "#111827", border: "1px solid #1F2937", borderRadius: 8 }}>
            <thead>
              <tr>
                {["Created", "Symbol", "Side", "Type", "Trigger", "Filled", "Qty", "Notional", "SL", "TP1", "Status", "Playbook", "Reason", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #1F2937", color: "#64748B", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} style={{ borderBottom: "1px solid #1F2937" }}>
                  <td style={td}>{new Date(o.createdAt).toLocaleString()}</td>
                  <td style={td}><b>{o.symbol}</b></td>
                  <td style={{ ...td, color: o.side === "BUY" || o.side === "LONG" ? "#10B981" : "#F87171" }}>{o.side}</td>
                  <td style={td}>{o.orderType}</td>
                  <td style={td}>{fmt(o.triggerPrice)}</td>
                  <td style={td}>{fmt(o.filledPrice)}</td>
                  <td style={td}>{o.quantity}</td>
                  <td style={td}>{fmtUsd(o.notional)}</td>
                  <td style={td}>{fmt(o.stopLoss)}</td>
                  <td style={td}>{fmt(o.takeProfit1)}</td>
                  <td style={td}><b style={{ color: statusColor(o.status) }}>{o.status}</b></td>
                  <td style={td}>{o.playbookId || "—"}</td>
                  <td style={{ ...td, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.createdReason || "—"}</td>
                  <td style={td}>{o.status === "WAITING_FOR_TRIGGER" || o.status === "PLANNED" ? <button onClick={() => cancel(o.id)} style={{ padding: "3px 8px", background: "#1F2937", color: "#F87171", border: "1px solid #334155", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>Cancel</button> : null}</td>
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
function fmt(n: number | null | undefined): string { if (n == null || !Number.isFinite(n)) return "—"; return Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 }); }
function fmtUsd(n: number | null | undefined): string { if (n == null || !Number.isFinite(n)) return "—"; return "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
function statusColor(s: string): string {
  if (s === "FILLED_SIM") return "#10B981";
  if (s === "CANCELLED" || s === "EXPIRED" || s === "INVALIDATED_BEFORE_FILL") return "#94A3B8";
  if (s === "TRIGGERED") return "#FACC15";
  return "#60A5FA";
}
