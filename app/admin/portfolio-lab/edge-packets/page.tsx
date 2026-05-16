/**
 * /admin/portfolio-lab/edge-packets
 *
 * ARCA Edge Packet Inspector — see exactly what the decision
 * engine is reading and why each packet does or doesn't pass
 * the SIMULATED entry gates.
 *
 * Admin-only. SIMULATED context.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type InspectedPacket = {
  packetId: string;
  symbol: string;
  market: string;
  timeframe: string;
  assetClass: string;
  adminState: string;
  thesisStatus: string;
  setupType: string;
  bias: string;
  freshness: string;
  doNothing: boolean;
  simulated: boolean;
  opportunityRankScore: number;
  evidenceQualityScore: number;
  trapRiskScore: number;
  trustAdjustedScore: number;
  entry: number | null;
  stop: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  currentPrice: number | null;
  rrToTp1: number | null;
  gatePassed: boolean;
  gateReasons: string[];
  generatedAt: string;
  ageMinutes: number;
};

type Summary = {
  scanned: number;
  passing: number;
  gated: number;
  byAssetClass: Record<string, number>;
  byThesisStatus: Record<string, number>;
  byFreshness: Record<string, number>;
  topRejectionReasons: Array<{ reason: string; count: number }>;
  sinceMinutes: number;
  thresholds: {
    minEdgePacketRankScore: number;
    minEvidenceQualityScore: number;
    maxTrapRiskScore: number;
    allowedThesis: string[];
  };
};

type Resp = { data: { packets: InspectedPacket[]; summary: Summary; disclaimer: string } };

const COLORS = {
  bg: "#0F172A",
  card: "#1E293B",
  border: "#334155",
  text: "#F1F5F9",
  dim: "#94A3B8",
  green: "#10B981",
  red: "#EF4444",
  amber: "#F59E0B",
  blue: "#3B82F6",
  purple: "#8B5CF6",
};

export default function EdgePacketsInspectorPage() {
  const [data, setData] = useState<Resp["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinceMinutes, setSinceMinutes] = useState(720);
  const [filterMode, setFilterMode] = useState<"all" | "pass" | "reject">("all");
  const [assetClass, setAssetClass] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<keyof InspectedPacket>("generatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sinceMinutes: String(sinceMinutes), limit: "300" });
      if (filterMode === "pass") params.set("passOnly", "1");
      if (filterMode === "reject") params.set("rejectedOnly", "1");
      if (assetClass) params.set("assetClass", assetClass);
      const r = await fetch(`/api/admin/portfolio-lab/edge-packets?${params.toString()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j: Resp = await r.json();
      setData(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sinceMinutes, filterMode, assetClass]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => {
    if (!data) return [];
    const arr = [...data.packets];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const setSort = (key: keyof InspectedPacket) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const th = (key: keyof InspectedPacket, label: string) => (
    <th
      onClick={() => setSort(key)}
      style={{ padding: "8px 6px", textAlign: "left", cursor: "pointer", color: COLORS.dim, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, userSelect: "none" }}
    >
      {label}{sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div style={{ padding: 24, color: COLORS.text, background: COLORS.bg, minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, margin: 0, marginBottom: 6 }}>ARCA Edge Packet Inspector</h1>
        <div style={{ color: COLORS.dim, fontSize: 13 }}>
          Live view of every AdminEdgePacket the decision engine can see, with per-row gate evaluation.
          SIMULATED context only — no broker, no order routing.
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16, padding: 12, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>
        <label style={{ fontSize: 12, color: COLORS.dim }}>Window
          <select value={sinceMinutes} onChange={(e) => setSinceMinutes(Number(e.target.value))}
            style={{ marginLeft: 6, background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: "4px 8px" }}>
            <option value={60}>1h</option>
            <option value={240}>4h</option>
            <option value={720}>12h</option>
            <option value={1440}>24h</option>
            <option value={4320}>3d</option>
            <option value={10080}>7d</option>
          </select>
        </label>
        <label style={{ fontSize: 12, color: COLORS.dim }}>Filter
          <select value={filterMode} onChange={(e) => setFilterMode(e.target.value as "all" | "pass" | "reject")}
            style={{ marginLeft: 6, background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: "4px 8px" }}>
            <option value="all">All</option>
            <option value="pass">Passing gates only</option>
            <option value="reject">Rejected only</option>
          </select>
        </label>
        <label style={{ fontSize: 12, color: COLORS.dim }}>Asset class
          <select value={assetClass} onChange={(e) => setAssetClass(e.target.value)}
            style={{ marginLeft: 6, background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: "4px 8px" }}>
            <option value="">All</option>
            <option value="equity">Equity</option>
            <option value="crypto">Crypto</option>
            <option value="commodity">Commodity</option>
            <option value="options">Options</option>
            <option value="futures">Futures</option>
          </select>
        </label>
        <button onClick={() => void load()}
          style={{ marginLeft: "auto", background: COLORS.green, color: "#0B1220", border: "none", padding: "6px 14px", borderRadius: 4, fontWeight: 600, cursor: "pointer" }}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, marginBottom: 16, background: "#7F1D1D", color: "#FECACA", borderRadius: 6 }}>
          Error: {error}
        </div>
      )}

      {/* KPI summary */}
      {data?.summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 16 }}>
          <Kpi label="Scanned" value={data.summary.scanned} />
          <Kpi label="Passing gates" value={data.summary.passing} color={COLORS.green} />
          <Kpi label="Gated out" value={data.summary.gated} color={COLORS.red} />
          <Kpi label="Rank ≥" value={data.summary.thresholds.minEdgePacketRankScore} color={COLORS.blue} />
          <Kpi label="Evidence ≥" value={data.summary.thresholds.minEvidenceQualityScore} color={COLORS.blue} />
          <Kpi label="Trap ≤" value={data.summary.thresholds.maxTrapRiskScore} color={COLORS.amber} />
        </div>
      )}

      {/* Aggregations */}
      {data?.summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 16 }}>
          <AggCard title="By asset class" data={data.summary.byAssetClass} />
          <AggCard title="By thesis status" data={data.summary.byThesisStatus} />
          <AggCard title="By freshness" data={data.summary.byFreshness} />
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12 }}>
            <div style={{ color: COLORS.dim, fontSize: 11, textTransform: "uppercase", marginBottom: 8, letterSpacing: 0.5 }}>Top rejection reasons</div>
            {data.summary.topRejectionReasons.length === 0 ? (
              <div style={{ color: COLORS.green, fontSize: 13 }}>No rejections in window 🎯</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {data.summary.topRejectionReasons.map((r) => (
                  <div key={r.reason} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
                    <span style={{ color: COLORS.text }}>{r.reason}</span>
                    <span style={{ color: COLORS.red, fontWeight: 600 }}>{r.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Packets table */}
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "auto" }}>
        {sorted.length === 0 && !loading ? (
          <div style={{ padding: 32, textAlign: "center", color: COLORS.dim }}>
            No packets in the selected window. Wait for the next admin-radar cron cycle, or widen the window.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}`, position: "sticky", top: 0 }}>
              <tr>
                {th("symbol", "Symbol")}
                {th("assetClass", "Class")}
                {th("thesisStatus", "Thesis")}
                {th("adminState", "State")}
                {th("freshness", "Fresh")}
                {th("opportunityRankScore", "Rank")}
                {th("evidenceQualityScore", "Evid")}
                {th("trapRiskScore", "Trap")}
                {th("trustAdjustedScore", "Trust")}
                {th("bias", "Bias")}
                {th("gatePassed", "Gate")}
                {th("ageMinutes", "Age")}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const isOpen = expanded === p.packetId;
                return (
                  <Row key={p.packetId} p={p} isOpen={isOpen} onToggle={() => setExpanded(isOpen ? null : p.packetId)} />
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: 16, padding: 12, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 11, color: COLORS.dim }}>
        {data?.disclaimer ?? "ARCA is admin-only and SIMULATED."}
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12 }}>
      <div style={{ color: COLORS.dim, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? COLORS.text, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function AggCard({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12 }}>
      <div style={{ color: COLORS.dim, fontSize: 11, textTransform: "uppercase", marginBottom: 8, letterSpacing: 0.5 }}>{title}</div>
      {entries.length === 0 ? (
        <div style={{ color: COLORS.dim, fontSize: 12 }}>—</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {entries.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: COLORS.text }}>{k}</span>
              <span style={{ color: COLORS.dim, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ p, isOpen, onToggle }: { p: InspectedPacket; isOpen: boolean; onToggle: () => void }) {
  const rankColor = p.opportunityRankScore >= 65 ? COLORS.green : COLORS.red;
  const evidColor = p.evidenceQualityScore >= 60 ? COLORS.green : COLORS.red;
  const trapColor = p.trapRiskScore > 70 ? COLORS.red : COLORS.green;
  const freshColor = p.freshness === "fresh" ? COLORS.green : p.freshness === "stale" ? COLORS.red : COLORS.amber;

  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer", borderBottom: `1px solid ${COLORS.border}`, background: isOpen ? "rgba(59,130,246,0.05)" : undefined }}>
        <td style={td}><strong style={{ color: COLORS.text }}>{p.symbol}</strong></td>
        <td style={td}>{p.assetClass}</td>
        <td style={td}>{p.thesisStatus}</td>
        <td style={td}>{p.adminState}</td>
        <td style={{ ...td, color: freshColor }}>{p.freshness}{p.doNothing ? " ⊘" : ""}</td>
        <td style={{ ...td, color: rankColor, fontWeight: 600, fontFamily: "ui-monospace, monospace" }}>{p.opportunityRankScore.toFixed(1)}</td>
        <td style={{ ...td, color: evidColor, fontFamily: "ui-monospace, monospace" }}>{p.evidenceQualityScore.toFixed(1)}</td>
        <td style={{ ...td, color: trapColor, fontFamily: "ui-monospace, monospace" }}>{p.trapRiskScore.toFixed(1)}</td>
        <td style={{ ...td, fontFamily: "ui-monospace, monospace", color: COLORS.dim }}>{p.trustAdjustedScore.toFixed(1)}</td>
        <td style={td}>{p.bias}</td>
        <td style={td}>
          {p.gatePassed
            ? <span style={{ color: COLORS.green, fontWeight: 600 }}>✓ pass</span>
            : <span style={{ color: COLORS.red, fontWeight: 600 }}>✗ {p.gateReasons.length}</span>}
        </td>
        <td style={{ ...td, color: COLORS.dim }}>{p.ageMinutes}m</td>
      </tr>
      {isOpen && (
        <tr style={{ background: "rgba(15,23,42,0.5)" }}>
          <td colSpan={12} style={{ padding: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, fontSize: 12 }}>
              <Detail label="Entry" value={fmt(p.entry)} />
              <Detail label="Stop" value={fmt(p.stop)} />
              <Detail label="TP1 / TP2 / TP3" value={`${fmt(p.tp1)} / ${fmt(p.tp2)} / ${fmt(p.tp3)}`} />
              <Detail label="Current price" value={fmt(p.currentPrice)} />
              <Detail label="RR → TP1" value={p.rrToTp1 != null ? p.rrToTp1.toFixed(2) : "—"} />
              <Detail label="Setup type" value={p.setupType || "—"} />
              <Detail label="Timeframe" value={p.timeframe} />
              <Detail label="Generated" value={new Date(p.generatedAt).toLocaleString()} />
              <Detail label="Packet ID" value={p.packetId} mono />
            </div>
            {p.gateReasons.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ color: COLORS.dim, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                  Gate rejection reasons
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {p.gateReasons.map((r) => (
                    <span key={r} style={{ padding: "3px 8px", background: "#7F1D1D", color: "#FECACA", borderRadius: 4, fontSize: 11, fontFamily: "ui-monospace, monospace" }}>
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

const td: React.CSSProperties = { padding: "8px 6px", color: COLORS.text };

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ color: COLORS.dim, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: COLORS.text, fontFamily: mono ? "ui-monospace, monospace" : undefined, fontSize: 12 }}>{value}</div>
    </div>
  );
}

function fmt(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 100) return n.toFixed(2);
  if (Math.abs(n) >= 1) return n.toFixed(3);
  return n.toFixed(5);
}
