"use client";

import { useEffect, useMemo, useState } from "react";
import DataTruthBadge from "@/components/admin/shared/DataTruthBadge";
import type { AdminOpportunityRow } from "@/lib/admin/adminTypes";

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
  if (b === "LONG") return "#10B981";
  if (b === "SHORT") return "#EF4444";
  return "#9CA3AF";
}

export default function AdminOpportunityBoard() {
  const [market, setMarket] = useState<Market>("CRYPTO");
  const [timeframe, setTimeframe] = useState<string>("15m");
  const [minScore, setMinScore] = useState<number>(0);
  const [minTrust, setMinTrust] = useState<number>(0);
  const [showSuppressed, setShowSuppressed] = useState<boolean>(false);
  const [rows, setRows] = useState<AdminOpportunityRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
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
        <button onClick={load} disabled={loading}
          style={{
            marginLeft: "auto", marginTop: 14,
            padding: "0.5rem 1rem", borderRadius: "0.5rem",
            background: "#10B981", color: "#0F172A", border: "none",
            fontWeight: 700, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1,
          }}>
          {loading ? "Scanning…" : "Refresh"}
        </button>
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

      <div style={{ fontSize: "0.7rem", color: "#6B7280", marginBottom: 8 }}>
        {filtered.length} of {rows.length} rows
        {timestamp && <> · scan {new Date(timestamp).toLocaleTimeString()}</>}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "0.75rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
          <thead style={{ background: "rgba(17,24,39,0.8)" }}>
            <tr>
              {["#", "Symbol", "Bias", "Setup", "Score", "Lifecycle", "Dominant Axis", "Data Trust", "Penalties", "Boosts", ""].map((h) => (
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
                  <span style={{ color: biasColor(row.bias), fontWeight: 700 }}>{row.bias}</span>
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
                <td style={tdStyle}>
                  <span style={{ color: lifecycleColor(row.score.lifecycle), fontWeight: 700, fontSize: "0.7rem" }}>
                    {row.score.lifecycle}
                  </span>
                </td>
                <td style={{ ...tdStyle, color: "#9CA3AF" }}>{row.score.dominantAxis ?? "—"}</td>
                <td style={tdStyle}><DataTruthBadge truth={row.dataTruth} /></td>
                <td style={{ ...tdStyle, color: "#FCA5A5", fontSize: "0.7rem" }}>
                  {row.score.penalties.length > 0 ? row.score.penalties.length : "—"}
                </td>
                <td style={{ ...tdStyle, color: "#86EFAC", fontSize: "0.7rem" }}>
                  {row.score.boosts.length > 0 ? row.score.boosts.length : "—"}
                </td>
                <td style={tdStyle}>
                  <a href={`/admin/symbol/${row.symbol}?market=${row.market}&timeframe=${row.timeframe}`}
                    style={{
                      padding: "0.3rem 0.6rem", borderRadius: "0.4rem",
                      background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)",
                      color: "#93C5FD", fontSize: "0.7rem", fontWeight: 700,
                      textDecoration: "none", whiteSpace: "nowrap",
                    }}>
                    Review →
                  </a>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={11} style={{ ...tdStyle, textAlign: "center", color: "#6B7280", padding: "2rem" }}>
                  No rows match filters.
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
