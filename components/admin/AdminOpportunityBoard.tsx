"use client";

import { useEffect, useMemo, useState } from "react";
import DataTruthBadge from "@/components/admin/shared/DataTruthBadge";
import WhyThisRankDrawer from "@/components/admin/WhyThisRankDrawer";
import { ScoreTypeBadge } from "@/components/ui";
import type { AdminOpportunityRow } from "@/lib/admin/adminTypes";
import type { AdminEdgePacket } from "@/lib/admin/edgePacket";

type Market = "CRYPTO" | "EQUITIES";

const SUPPRESSED_LIFECYCLES = new Set(["EXHAUSTED", "TRAPPED", "INVALIDATED", "NO_EDGE", "DATA_DEGRADED"]);

function lifecycleColor(lc: string): string {
  switch (lc) {
    case "READY": return "#10B981";
    case "FRESH": return "#3B82F6";
    case "TRIGGERED": return "#8B5CF6";
    case "DEVELOPING": return "#FBBF24";
    case "EXHAUSTED":
    case "TRAPPED": return "#F97316";
    case "INVALIDATED":
    case "NO_EDGE": return "#EF4444";
    case "DATA_DEGRADED": return "#6B7280";
    default: return "#9CA3AF";
  }
}

function biasColor(b: string): string {
  if (b === "LONG" || b === "BULLISH_RESEARCH") return "#10B981";
  if (b === "SHORT" || b === "BEARISH_RESEARCH") return "#EF4444";
  return "#9CA3AF";
}

function formatBias(b: string): string {
  if (b === "LONG" || b === "BULLISH_RESEARCH") return "Bullish Bias";
  if (b === "SHORT" || b === "BEARISH_RESEARCH") return "Bearish Bias";
  if (b === "NEUTRAL") return "Neutral";
  if (b === "MIXED") return "Mixed";
  return b;
}

export default function AdminOpportunityBoard() {
  const [market, setMarket] = useState<Market>("CRYPTO");
  const [timeframe, setTimeframe] = useState<string>("15m");
  const [minScore, setMinScore] = useState<number>(0);
  const [minTrust, setMinTrust] = useState<number>(0);
  const [showSuppressed, setShowSuppressed] = useState<boolean>(true);
  const [rows, setRows] = useState<AdminOpportunityRow[]>([]);
  const [edgeBySymbol, setEdgeBySymbol] = useState<Record<string, AdminEdgePacket>>({});
  const [changesBySymbol, setChangesBySymbol] = useState<Record<string, Array<{ eventType: string; severity: "critical" | "notable" | "info"; magnitude: number }>>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<AdminOpportunityRow | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/opportunities?market=${market}&timeframe=${timeframe}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setRows(json.rows ?? []);
      const map: Record<string, AdminEdgePacket> = {};
      for (const p of (json.edgePackets ?? []) as AdminEdgePacket[]) {
        map[p.symbol] = p;
      }
      setEdgeBySymbol(map);
      setChangesBySymbol(json.changesBySymbol ?? {});
      setTimestamp(json.timestamp ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load opportunities");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, timeframe]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!showSuppressed && SUPPRESSED_LIFECYCLES.has(r.score.lifecycle)) return false;
      if (r.score.score < minScore) return false;
      if (r.dataTruth.trustScore < minTrust) return false;
      return true;
    });
  }, [rows, minScore, minTrust, showSuppressed]);

  return (
    <div style={{ padding: "1rem 1.25rem", color: "#E5E7EB", maxWidth: 1400, margin: "0 auto" }}>
      {/* Why This Rank Drawer */}
      <WhyThisRankDrawer row={selectedRow} onClose={() => setSelectedRow(null)} />

      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0 }}>Opportunity Research Board</h1>
        <p style={{ fontSize: "0.75rem", color: "#9CA3AF", marginTop: 4 }}>
          Internal research ranking. No broker execution. No order routing. Review CTAs only.
        </p>
      </header>

      {/* Controls */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center",
        background: "rgba(17,24,39,0.6)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "0.75rem", padding: "0.75rem 1rem", marginBottom: "1rem",
      }}>
        <label style={{ display: "flex", flexDirection: "column", fontSize: "0.65rem", color: "#9CA3AF" }}>
          MARKET
          <select value={market} onChange={(e) => setMarket(e.target.value as Market)} style={selectStyle}>
            <option value="CRYPTO">Crypto</option>
            <option value="EQUITIES">Equities</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", fontSize: "0.65rem", color: "#9CA3AF" }}>
          TIMEFRAME
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} style={selectStyle}>
            <option value="5m">5m</option>
            <option value="15m">15m</option>
            <option value="1h">1h</option>
            <option value="4h">4h</option>
            <option value="1d">1d</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", fontSize: "0.65rem", color: "#9CA3AF" }}>
          MIN SCORE: {minScore}
          <input type="range" min={0} max={100} value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))} style={{ width: 140 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", fontSize: "0.65rem", color: "#9CA3AF" }}>
          MIN DATA TRUST: {minTrust}
          <input type="range" min={0} max={100} value={minTrust}
            onChange={(e) => setMinTrust(Number(e.target.value))} style={{ width: 140 }} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.7rem", color: "#9CA3AF", marginTop: 14 }}>
          <input type="checkbox" checked={showSuppressed}
            onChange={(e) => setShowSuppressed(e.target.checked)} />
          Show suppressed (degraded / no-edge / trapped)
        </label>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", marginTop: 14 }}>
          {(minScore > 0 || minTrust > 0 || !showSuppressed) && (
            <button
              onClick={() => { setMinScore(0); setMinTrust(0); setShowSuppressed(true); }}
              style={{
                padding: "0.5rem 0.9rem", borderRadius: "0.5rem",
                background: "rgba(239,68,68,0.12)", color: "#FCA5A5",
                border: "1px solid rgba(239,68,68,0.3)",
                fontWeight: 700, cursor: "pointer", fontSize: "0.8rem",
              }}>
              Reset Filters
            </button>
          )}
          <button onClick={load} disabled={loading}
            style={{
              padding: "0.5rem 1rem", borderRadius: "0.5rem",
              background: "#10B981", color: "#0F172A", border: "none",
              fontWeight: 700, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1,
            }}>
            {loading ? "Scanning…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: "0.75rem 1rem", borderRadius: "0.5rem",
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          color: "#FCA5A5", fontSize: "0.8rem", marginBottom: "1rem",
        }}>
          {error}
        </div>
      )}

      {/* Row count */}
      <div style={{ fontSize: "0.7rem", color: "#6B7280", marginBottom: 8 }}>
        {filtered.length} of {rows.length} rows
        {rows.length > 0 && (
          <> · scores {Math.min(...rows.map(r => r.score.score))}–{Math.max(...rows.map(r => r.score.score))}</>
        )}
        {timestamp && <> · scan {new Date(timestamp).toLocaleTimeString()}</>}
        {rows.length > 0 && filtered.length < rows.length && (
          <span style={{ color: "#F59E0B", marginLeft: 6 }}>
            ({rows.length - filtered.length} hidden by filters)
          </span>
        )}
      </div>

      {/* ── Results table ── */}
      <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "0.75rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
          <thead style={{ background: "rgba(17,24,39,0.8)" }}>
            <tr>
              {["#", "Symbol", "Bias", "Setup", "Score", "Type", "Lifecycle", "Entry", "Stop", "TP1", "TP2", "TP3", "R:R", "Changes", "Data Trust", ""].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.symbol} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <td style={tdStyle}>{row.rank}</td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{row.symbol}</td>
                <td style={tdStyle}>
                  <span style={{ color: biasColor(row.bias), fontWeight: 700 }}>{formatBias(row.bias)}</span>
                </td>
                <td style={tdStyle} title={row.setup.description}>{row.setup.label}</td>
                <td style={tdStyle}>
                  <span style={{
                    fontWeight: 800,
                    color: row.score.score >= 70 ? "#10B981" : row.score.score >= 50 ? "#FBBF24" : "#9CA3AF",
                  }}>
                    {row.score.score}
                  </span>
                  <span style={{ color: "#6B7280", marginLeft: 4 }}>/100</span>
                </td>
                <td style={tdStyle}><ScoreTypeBadge type="heuristic" compact /></td>
                <td style={tdStyle}>
                  <span style={{ color: lifecycleColor(row.score.lifecycle), fontWeight: 700, fontSize: "0.7rem" }}>
                    {row.score.lifecycle}
                  </span>
                </td>
                {(() => {
                  const ep = edgeBySymbol[row.symbol];
                  const fmt = (n: number | null | undefined) =>
                    n == null || !Number.isFinite(n) ? "—" : n >= 1000 ? n.toFixed(0) : n.toFixed(2);
                  const rrColor = (rr: number | null | undefined) =>
                    rr == null ? "#6B7280" : rr >= 2 ? "#10B981" : rr >= 1 ? "#FBBF24" : "#F97316";
                  const bestRR = ep?.riskReward?.rrToTp1 ?? null;
                  return (
                    <>
                      <td style={{ ...tdStyle, fontFamily: "monospace" }}>{fmt(ep?.entry?.trigger ?? null)}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", color: "#FCA5A5" }}>{fmt(ep?.stopLoss?.level ?? null)}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", color: "#86EFAC" }}>{fmt(ep?.takeProfit?.tp1 ?? null)}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", color: "#86EFAC" }}>{fmt(ep?.takeProfit?.tp2 ?? null)}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", color: "#86EFAC" }}>{fmt(ep?.takeProfit?.tp3 ?? null)}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", color: rrColor(bestRR), fontWeight: 700 }}>
                        {bestRR == null ? "—" : bestRR.toFixed(2) + "R"}
                      </td>
                    </>
                  );
                })()}
                <td style={tdStyle}>
                  {(() => {
                    const evs = changesBySymbol[row.symbol] ?? [];
                    if (evs.length === 0) return <span style={{ color: "#6B7280", fontSize: "0.7rem" }}>—</span>;
                    const sevColor = (s: string) =>
                      s === "critical" ? "#EF4444" : s === "notable" ? "#FBBF24" : "#6B7280";
                    return (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, maxWidth: 180 }}>
                        {evs.slice(0, 4).map((ev, i) => (
                          <span
                            key={i}
                            title={`${ev.eventType} (mag ${ev.magnitude})`}
                            style={{
                              padding: "1px 5px",
                              borderRadius: 3,
                              fontSize: "0.6rem",
                              fontWeight: 700,
                              background: "rgba(17,24,39,0.6)",
                              border: `1px solid ${sevColor(ev.severity)}`,
                              color: sevColor(ev.severity),
                              whiteSpace: "nowrap",
                            }}
                          >
                            {ev.eventType.replace(/_/g, " ")}
                          </span>
                        ))}
                        {evs.length > 4 && (
                          <span style={{ color: "#9CA3AF", fontSize: "0.6rem" }}>+{evs.length - 4}</span>
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td style={tdStyle}><DataTruthBadge truth={row.dataTruth} /></td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => setSelectedRow(row)}
                      style={{
                        padding: "0.3rem 0.6rem", borderRadius: "0.4rem",
                        background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)",
                        color: "#6EE7B7", fontSize: "0.7rem", fontWeight: 700,
                        cursor: "pointer", whiteSpace: "nowrap",
                      }}>
                      Why This Rank
                    </button>
                    <a href={`/admin/symbol/${row.symbol}?market=${row.market}&timeframe=${row.timeframe}`}
                      style={{
                        padding: "0.3rem 0.6rem", borderRadius: "0.4rem",
                        background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)",
                        color: "#93C5FD", fontSize: "0.7rem", fontWeight: 700,
                        textDecoration: "none", whiteSpace: "nowrap",
                      }}>
                      Review →
                    </a>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={16} style={{ ...tdStyle, textAlign: "center", color: "#6B7280", padding: "2rem" }}>
                  {rows.length === 0
                    ? "No opportunities loaded. Hit Refresh to run a scan."
                    : `All ${rows.length} rows hidden (minScore=${minScore}, minTrust=${minTrust}) — hit Reset Filters.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: "#0F172A", color: "#E5E7EB",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.4rem",
  padding: "0.4rem 0.6rem", fontSize: "0.8rem", marginTop: 4,
};

const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "0.55rem 0.75rem",
  fontSize: "0.65rem", color: "#9CA3AF", textTransform: "uppercase",
  letterSpacing: "0.05em", fontWeight: 700,
};

const tdStyle: React.CSSProperties = {
  padding: "0.6rem 0.75rem", verticalAlign: "middle",
};
