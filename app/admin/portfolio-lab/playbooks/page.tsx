"use client";

/**
 * /admin/portfolio-lab/playbooks
 *
 * Per-playbook rollup of ARCA simulated trades — win rate, average R,
 * expectancy, total P&L, max drawdown, best/worst asset class. Powered by
 * arca_playbook_performance (recomputed each Run Sim Cycle).
 *
 * SIMULATED only. No broker.
 */
import React, { useCallback, useEffect, useState } from "react";

interface PlaybookRow {
  playbookId: string;
  setupCount: number;
  tradesTaken: number;
  wins: number;
  losses: number;
  winRate: number | null;
  averageR: number | null;
  totalPnl: number;
  maxDrawdown: number | null;
  expectancy: number | null;
  bestAssetClass: string | null;
  worstAssetClass: string | null;
  lastUpdated: string;
}

type SortKey =
  | "playbookId" | "tradesTaken" | "winRate" | "averageR"
  | "expectancy" | "totalPnl" | "maxDrawdown";

export default function PortfolioLabPlaybooksPage() {
  const [rows, setRows] = useState<PlaybookRow[]>([]);
  const [meta, setMeta] = useState<{ source: string; freshness: string; fetchedAt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("totalPnl");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [minTrades, setMinTrades] = useState(1);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/portfolio-lab/playbooks", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setRows((j?.data?.playbooks ?? []) as PlaybookRow[]);
      setMeta({ source: j?.source ?? "?", freshness: j?.freshness ?? "?", fetchedAt: j?.fetchedAt ?? "" });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const click = (k: SortKey) => {
    if (k === sortBy) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(k); setSortDir(k === "playbookId" ? "asc" : "desc"); }
  };

  const filtered = rows.filter((r) => r.tradesTaken >= minTrades);
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortBy], bv = b[sortBy];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.trades += r.tradesTaken;
      acc.pnl += r.totalPnl;
      acc.wins += r.wins;
      acc.losses += r.losses;
      return acc;
    },
    { trades: 0, pnl: 0, wins: 0, losses: 0 },
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", color: "#E2E8F0", padding: 24 }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={crumb}>SIMULATED · NO BROKER</div>
            <h1 style={h1}>ARCA Playbook Performance</h1>
            <div style={{ fontSize: 12, color: "#64748B" }}>
              {meta ? `${meta.source} · ${meta.freshness} · ${meta.fetchedAt ? new Date(meta.fetchedAt).toLocaleTimeString() : ""}` : "—"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "#94A3B8" }}>min trades</label>
            <input
              type="number"
              min={0}
              value={minTrades}
              onChange={(e) => setMinTrades(Math.max(0, Number(e.target.value || 0)))}
              style={input}
            />
            <button onClick={load} disabled={loading} style={btnGhost}>{loading ? "…" : "Reload"}</button>
          </div>
        </div>

        {/* totals strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 12 }}>
          <Kpi label="Playbooks" value={String(rows.length)} />
          <Kpi label="Total Trades" value={String(totals.trades)} />
          <Kpi label="Wins / Losses" value={`${totals.wins} / ${totals.losses}`} />
          <Kpi label="Total P&L" value={fmtUsd(totals.pnl)} tone={totals.pnl >= 0 ? "good" : "bad"} />
          <Kpi label="Lifetime Win Rate" value={lifetimeWinRate(totals)} />
        </div>

        {error && <div style={errBox}>Error: {error}</div>}

        {rows.length === 0 ? (
          <div style={emptyBox}>
            {loading
              ? "Loading…"
              : "No playbook stats yet. Once ARCA closes simulated trades they will roll up here at the end of each sim cycle."}
          </div>
        ) : (
          <div style={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 8, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <Th label="Playbook" k="playbookId" sortBy={sortBy} sortDir={sortDir} click={click} />
                  <Th label="Trades" k="tradesTaken" sortBy={sortBy} sortDir={sortDir} click={click} align="right" />
                  <th style={th}>W/L</th>
                  <Th label="Win Rate" k="winRate" sortBy={sortBy} sortDir={sortDir} click={click} align="right" />
                  <Th label="Avg R" k="averageR" sortBy={sortBy} sortDir={sortDir} click={click} align="right" />
                  <Th label="Expectancy" k="expectancy" sortBy={sortBy} sortDir={sortDir} click={click} align="right" />
                  <Th label="Total P&L" k="totalPnl" sortBy={sortBy} sortDir={sortDir} click={click} align="right" />
                  <Th label="Max DD %" k="maxDrawdown" sortBy={sortBy} sortDir={sortDir} click={click} align="right" />
                  <th style={th}>Best Asset</th>
                  <th style={th}>Worst Asset</th>
                  <th style={th}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.playbookId} style={{ borderTop: "1px solid #1F2937" }}>
                    <td style={td}><strong style={{ color: "#F8FAFC" }}>{r.playbookId}</strong></td>
                    <td style={tdR}>{r.tradesTaken}</td>
                    <td style={td}>
                      <span style={{ color: "#10B981" }}>{r.wins}</span>
                      <span style={{ color: "#475569" }}> / </span>
                      <span style={{ color: "#F87171" }}>{r.losses}</span>
                    </td>
                    <td style={tdR}>{r.winRate == null ? "—" : r.winRate.toFixed(1) + "%"}</td>
                    <td style={{ ...tdR, color: rTone(r.averageR) }}>{r.averageR == null ? "—" : r.averageR.toFixed(2) + "R"}</td>
                    <td style={{ ...tdR, color: rTone(r.expectancy) }}>{r.expectancy == null ? "—" : r.expectancy.toFixed(2) + "R"}</td>
                    <td style={{ ...tdR, color: r.totalPnl >= 0 ? "#10B981" : "#F87171" }}>{fmtUsd(r.totalPnl)}</td>
                    <td style={tdR}>{r.maxDrawdown == null ? "—" : r.maxDrawdown.toFixed(2) + "%"}</td>
                    <td style={td}>{r.bestAssetClass ?? "—"}</td>
                    <td style={td}>{r.worstAssetClass ?? "—"}</td>
                    <td style={{ ...td, color: "#64748B" }}>{r.lastUpdated ? new Date(r.lastUpdated).toLocaleString() : "—"}</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={11} style={{ ...td, color: "#64748B", textAlign: "center", padding: 20 }}>No playbooks match the current filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div style={discBox}>
          ARCA Autonomous Portfolio Lab is admin-only SIMULATED paper trading. No broker integration. Stats are recomputed
          each Run Sim Cycle from arca_trades.
        </div>
      </div>
    </div>
  );
}

function Th(props: {
  label: string;
  k: SortKey;
  sortBy: SortKey;
  sortDir: "asc" | "desc";
  click: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = props.sortBy === props.k;
  return (
    <th
      onClick={() => props.click(props.k)}
      style={{
        ...th,
        textAlign: props.align ?? "left",
        cursor: "pointer",
        color: active ? "#F8FAFC" : "#64748B",
      }}
    >
      {props.label}{active ? (props.sortDir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const c = tone === "good" ? "#10B981" : tone === "bad" ? "#F87171" : "#F8FAFC";
  return (
    <div style={kpi}>
      <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: c, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function rTone(v: number | null): string {
  if (v == null) return "#E2E8F0";
  if (v > 0) return "#10B981";
  if (v < 0) return "#F87171";
  return "#E2E8F0";
}
function fmtUsd(n: number): string {
  return "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function lifetimeWinRate(t: { wins: number; losses: number }): string {
  const dec = t.wins + t.losses;
  if (dec === 0) return "—";
  return ((t.wins / dec) * 100).toFixed(1) + "%";
}

const crumb: React.CSSProperties = { fontSize: 11, color: "#64748B", letterSpacing: 1.5, textTransform: "uppercase" };
const h1: React.CSSProperties = { fontSize: 22, color: "#F8FAFC", margin: "4px 0" };
const kpi: React.CSSProperties = { background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 14 };
const th: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #1F2937", color: "#64748B", fontWeight: 500, textAlign: "left" };
const td: React.CSSProperties = { padding: "8px 10px", color: "#E2E8F0" };
const tdR: React.CSSProperties = { ...td, textAlign: "right" };
const btnGhost: React.CSSProperties = { padding: "6px 12px", background: "transparent", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 6, cursor: "pointer", fontSize: 12 };
const input: React.CSSProperties = { padding: "5px 8px", background: "#0B1220", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 6, fontSize: 12, width: 70 };
const errBox: React.CSSProperties = { background: "#7F1D1D", color: "#FCA5A5", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 };
const emptyBox: React.CSSProperties = { background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 24, color: "#64748B", textAlign: "center", fontSize: 13 };
const discBox: React.CSSProperties = { marginTop: 16, padding: 10, background: "#0B1220", border: "1px solid #1F2937", borderRadius: 6, fontSize: 11, color: "#64748B", lineHeight: 1.5 };
