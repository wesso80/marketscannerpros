"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AdminDailyResearchBrief from "@/components/admin/AdminDailyResearchBrief";
import AdminBiasCheckPanel from "@/components/admin/AdminBiasCheckPanel";

interface Stats {
  overview: {
    totalWorkspaces: number;
    subscriptionsByTier: { tier: string; status: string; count: number }[];
    paidSubscriptions: number;
    trialSubscriptions: number;
    activeTrials: number;
    pendingDeleteRequests: number;
    financials: {
      monthlyRevenue: number;
      yearlyRevenue: number;
      monthlyCosts: number;
      yearlyCosts: number;
      monthlyProfit: number;
      yearlyProfit: number;
    };
  };
  aiUsage: {
    today: { totalQuestions: number; uniqueUsers: number };
    last7Days: { date: string; count: number }[];
    topUsersToday: { workspace_id: string; tier: string; questions: number }[];
  };
  signups: {
    last7Days: { date: string; count: number }[];
  };
  learning: {
    totals: { total_predictions: number; pending: number; processed: number; wins: number; stops: number };
    stats: { symbol: string; total_predictions: number; win_rate: number; avg_move_pct: number; avg_time_to_move_mins: number; last_updated: string }[];
    recentPredictions: { symbol: string; prediction_direction: string; confidence: number; current_price: number; created_at: string; status: string; move_pct: number | null; hit_target: boolean | null; hit_stop: boolean | null; outcome_direction: string | null }[];
  };
  meta?: {
    degraded: boolean;
    failedQueries: string[];
    warnings: string[];
  };
}

interface AdminRiskState {
  openExposure: number;
  dailyDrawdown: number;
  correlationRisk: number;
  maxPositions: number;
  activePositions: number;
  killSwitchActive: boolean;
  permission: string;
  sizeMultiplier: number;
}

interface AdminScannerHit {
  symbol: string;
  bias: string;
  regime: string;
  permission: string;
  confidence: number;
  symbolTrust: number;
  sizeMultiplier: number;
  playbook?: string;
  blockReasons?: string[];
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processingLearning, setProcessingLearning] = useState(false);
  const [symbolJump, setSymbolJump] = useState("ADA");
  const [learningResult, setLearningResult] = useState<{ ok: boolean; processed: number; errors: string[] } | null>(null);
  const [systemHealth, setSystemHealth] = useState<{
    feed?: string;
    websocket?: string;
    scanner?: string;
    cache?: string;
    api?: string;
    lastScanAt?: string | null;
    errorsCount?: number;
    dbConnected?: boolean;
  } | null>(null);
  const [riskState, setRiskState] = useState<AdminRiskState | null>(null);
  const [scannerHits, setScannerHits] = useState<AdminScannerHit[]>([]);
  const [liveUsers, setLiveUsers] = useState<{
    totalOnline: number; loggedIn: number; anonymous: number;
    pages: { path: string; count: number; section: string }[];
    sections: { section: string; count: number }[];
  } | null>(null);

  const learningMigrationSql = `-- Learning Machine tables
-- Run this migration in your Neon PostgreSQL console

CREATE TABLE IF NOT EXISTS learning_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(20) NOT NULL,
    asset_type VARCHAR(20) NOT NULL DEFAULT 'crypto',
    mode VARCHAR(20) NOT NULL DEFAULT 'forecast',

    -- Prediction snapshot
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_price DECIMAL(20, 8) NOT NULL,
    prediction_direction VARCHAR(20) NOT NULL,
    confidence INT NOT NULL,
    expected_decomp_mins INT,
    target_price DECIMAL(20, 8),
    stop_loss DECIMAL(20, 8),

    -- Context
    stack INT NOT NULL DEFAULT 0,
    active_tfs JSONB,
    hot_zone BOOLEAN NOT NULL DEFAULT false,
    hot_zone_tfs JSONB,
    clusters INT NOT NULL DEFAULT 0,
    mid50_levels JSONB,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_learning_predictions_symbol ON learning_predictions(symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_predictions_status ON learning_predictions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS learning_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id UUID NOT NULL REFERENCES learning_predictions(id) ON DELETE CASCADE,

    measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    minutes_since_prediction INT NOT NULL,
    price_at_measure DECIMAL(20, 8) NOT NULL,
    move_pct DECIMAL(8, 4) NOT NULL,
    direction VARCHAR(10) NOT NULL, -- up/down/flat

    hit_target BOOLEAN NOT NULL DEFAULT false,
    hit_stop BOOLEAN NOT NULL DEFAULT false,
    outcome_window_mins INT NOT NULL DEFAULT 60
);

CREATE INDEX IF NOT EXISTS idx_learning_outcomes_prediction ON learning_outcomes(prediction_id);
CREATE INDEX IF NOT EXISTS idx_learning_outcomes_measured ON learning_outcomes(measured_at DESC);

CREATE TABLE IF NOT EXISTS learning_stats (
    symbol VARCHAR(20) PRIMARY KEY,
    total_predictions INT NOT NULL DEFAULT 0,
    win_rate DECIMAL(6, 2) NOT NULL DEFAULT 0,
    avg_move_pct DECIMAL(8, 4) NOT NULL DEFAULT 0,
    avg_time_to_move_mins DECIMAL(8, 2) NOT NULL DEFAULT 0,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE learning_predictions IS 'Prediction snapshots for learning outcomes';
COMMENT ON TABLE learning_outcomes IS 'Measured outcomes for predictions';
COMMENT ON TABLE learning_stats IS 'Rolling learning stats per symbol';
`;

  useEffect(() => {
    fetchStats();
    fetchLiveUsers();
    fetchSystemHealth();
    fetchRiskState();
    fetchScannerFeed();
    const liveInterval = setInterval(fetchLiveUsers, 30_000);
    return () => clearInterval(liveInterval);
  }, []);

  const fetchStats = async () => {
    const secret = sessionStorage.getItem("admin_secret");

    try {
      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      if (res.ok) {
        setStats(data);
      } else {
        setError(data.error || "Failed to fetch stats");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveUsers = async () => {
    const secret = sessionStorage.getItem("admin_secret");
    try {
      const res = await fetch("/api/analytics/online", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (res.ok) setLiveUsers(await res.json());
    } catch { /* ignore */ }
  };

  const fetchSystemHealth = async () => {
    const secret = sessionStorage.getItem("admin_secret");
    try {
      const res = await fetch("/api/admin/system/health", {
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      });
      if (res.ok) setSystemHealth(await res.json());
    } catch { /* ignore */ }
  };

  const fetchRiskState = async () => {
    const secret = sessionStorage.getItem("admin_secret");
    try {
      const res = await fetch("/api/admin/risk/state", {
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      });
      if (res.ok) setRiskState(await res.json());
    } catch { /* ignore */ }
  };

  const fetchScannerFeed = async () => {
    const secret = sessionStorage.getItem("admin_secret");
    try {
      const params = new URLSearchParams({ market: "CRYPTO", timeframe: "15m" });
      const res = await fetch(`/api/admin/scanner/live?${params}`, {
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setScannerHits(data.hits || []);
      }
    } catch { /* ignore */ }
  };

  const processLearningOutcomes = async () => {
    setProcessingLearning(true);
    setLearningResult(null);
    try {
      const secret = sessionStorage.getItem("admin_secret");
      const res = await fetch("/api/jobs/learning-outcomes", {
        method: "POST",
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      });
      const data = await res.json();
      setLearningResult(data);
      // Refresh stats after processing
      fetchStats();
    } catch (err) {
      setLearningResult({ ok: false, processed: 0, errors: ["Network error"] });
    } finally {
      setProcessingLearning(false);
    }
  };

  const openSymbolTerminal = () => {
    const symbol = symbolJump.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
    if (!symbol) return;
    window.location.href = `/admin/terminal/${encodeURIComponent(symbol)}`;
  };

  if (loading) {
    return <div style={{ color: "#9CA3AF" }}>Loading stats...</div>;
  }

  if (error) {
    return <div style={{ color: "#F87171" }}>Error: {error}</div>;
  }

  const cardStyle: React.CSSProperties = {
    background: "rgba(17, 24, 39, 0.8)",
    border: "1px solid rgba(16, 185, 129, 0.2)",
    borderRadius: "1rem",
    padding: "1.5rem",
  };

  const statBoxStyle: React.CSSProperties = {
    background: "rgba(0,0,0,0.3)",
    borderRadius: "0.5rem",
    padding: "1rem",
    textAlign: "center",
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    }).format(value);

  const financials = stats?.overview.financials;
  const learningTotals = stats?.learning?.totals;
  const learningOutcomes = Number(learningTotals?.wins || 0) + Number(learningTotals?.stops || 0);
  const learningWinRate = learningOutcomes > 0 ? (Number(learningTotals?.wins || 0) / learningOutcomes) * 100 : 0;
  const pendingLearning = Number(learningTotals?.pending || 0);
  const bestSymbols = [...(stats?.learning?.stats || [])]
    .filter((item) => Number(item.total_predictions || 0) > 0)
    .sort((a, b) => Number(b.win_rate || 0) - Number(a.win_rate || 0))
    .slice(0, 5);
  const pendingPredictions = (stats?.learning?.recentPredictions || [])
    .filter((item) => item.status === "pending")
    .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
    .slice(0, 5);
  const riskPermission = riskState?.killSwitchActive ? "KILL" : riskState?.permission || "WAIT";
  const riskAllowsTrading = ["ALLOW", "GO", "ALLOW_REDUCED"].includes(riskPermission);
  const topScannerHits = [...scannerHits]
    .sort((a, b) => (Number(b.confidence || 0) + Number(b.symbolTrust || 0)) - (Number(a.confidence || 0) + Number(a.symbolTrust || 0)))
    .slice(0, 5);
  const operatorScore = Math.max(0, Math.min(100, Math.round(
    (riskAllowsTrading ? 25 : riskPermission === "KILL" || riskPermission === "BLOCK" ? 0 : 10) +
    (financials && financials.monthlyProfit >= 0 ? 15 : 0) +
    (pendingLearning === 0 ? 20 : 8) +
    (learningWinRate >= 55 ? 20 : learningWinRate >= 45 ? 12 : 5) +
    (systemHealth?.dbConnected ? 15 : 3) +
    ((stats?.overview.pendingDeleteRequests || 0) === 0 ? 5 : 2)
  )));
  const operatorState = operatorScore >= 75 ? "READY" : operatorScore >= 50 ? "WATCH" : "CHECK";
  const actionQueue = [
    riskPermission === "KILL" ? "Research alerts paused — suppress notifications" : riskAllowsTrading ? `Risk governor ${riskPermission}` : `Risk governor says ${riskPermission}`,
    topScannerHits.length > 0 ? `${topScannerHits.length} live scanner candidates ranked` : "No live scanner candidates",
    systemHealth?.dbConnected === false ? "Database health check failed" : "Database connected",
    pendingLearning > 0 ? `${pendingLearning} learning predictions need processing` : "Learning queue clear",
    (stats?.overview.pendingDeleteRequests || 0) > 0 ? `${stats?.overview.pendingDeleteRequests} delete requests pending` : "No deletion backlog",
    financials && financials.monthlyProfit < 0 ? `Monthly burn ${formatCurrency(Math.abs(financials.monthlyProfit))}` : "Monthly P/L stable",
    pendingPredictions.length > 0 ? `${pendingPredictions.length} pending high-confidence predictions` : "No pending prediction cluster",
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#E5E7EB" }}>
          Operator Command Center
        </h1>
        <span style={{ color: "#9CA3AF", fontSize: "0.9rem" }}>
          {new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>

      {stats?.meta?.degraded && (
        <div style={{
          marginBottom: "1rem",
          border: "1px solid rgba(245,158,11,0.35)",
          background: "rgba(245,158,11,0.12)",
          borderRadius: "0.75rem",
          padding: "0.85rem 1rem",
          color: "#FCD34D",
          fontSize: "0.82rem",
          fontWeight: 700,
        }}>
          Analytics degraded: {stats.meta.failedQueries.length} query{stats.meta.failedQueries.length === 1 ? "" : "ies"} failed. Do not treat empty dashboard values as confirmed zero activity.
          <div style={{ color: "#FDE68A", fontSize: "0.74rem", fontWeight: 500, marginTop: "0.35rem" }}>
            {stats.meta.failedQueries.slice(0, 6).join(", ")}{stats.meta.failedQueries.length > 6 ? " ..." : ""}
          </div>
        </div>
      )}

      <div style={{ marginBottom: "1rem" }}>
        <AdminDailyResearchBrief />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <AdminBiasCheckPanel />
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))",
        gap: "1rem",
        marginBottom: "1.25rem",
      }}>
        <section style={{
          ...cardStyle,
          border: operatorState === "READY" ? "1px solid rgba(16,185,129,0.45)" : operatorState === "WATCH" ? "1px solid rgba(245,158,11,0.45)" : "1px solid rgba(239,68,68,0.45)",
          background: "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(17,24,39,0.88))",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start", marginBottom: "1rem" }}>
            <div>
              <div style={{ color: "#94A3B8", fontSize: "0.75rem", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: "0.35rem" }}>Private operator state</div>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ color: operatorState === "READY" ? "#10B981" : operatorState === "WATCH" ? "#F59E0B" : "#EF4444", fontSize: "2.4rem", fontWeight: 800, lineHeight: 1 }}>{operatorState}</span>
                <span style={{ color: "#CBD5E1", fontSize: "1rem" }}>{operatorScore}/100 readiness</span>
              </div>
            </div>
            <button
              onClick={() => { fetchStats(); fetchLiveUsers(); fetchSystemHealth(); fetchRiskState(); fetchScannerFeed(); }}
              style={{
                background: "rgba(16,185,129,0.12)",
                border: "1px solid rgba(16,185,129,0.35)",
                color: "#10B981",
                padding: "0.55rem 0.8rem",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: "0.8rem",
                fontWeight: 700,
              }}
            >
              Refresh Desk
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={statBoxStyle}>
              <div style={{ color: riskAllowsTrading ? "#10B981" : riskPermission === "KILL" || riskPermission === "BLOCK" ? "#EF4444" : "#F59E0B", fontSize: "1.35rem", fontWeight: 800 }}>
                {riskPermission}
              </div>
              <div style={{ color: "#94A3B8", fontSize: "0.75rem" }}>Risk Permission</div>
            </div>
            <div style={statBoxStyle}>
              <div style={{ color: financials && financials.monthlyProfit >= 0 ? "#10B981" : "#EF4444", fontSize: "1.35rem", fontWeight: 800 }}>
                {financials ? formatCurrency(financials.monthlyProfit) : "$0"}
              </div>
              <div style={{ color: "#94A3B8", fontSize: "0.75rem" }}>Monthly P/L</div>
            </div>
            <div style={statBoxStyle}>
              <div style={{ color: pendingLearning > 0 ? "#F59E0B" : "#10B981", fontSize: "1.35rem", fontWeight: 800 }}>{pendingLearning}</div>
              <div style={{ color: "#94A3B8", fontSize: "0.75rem" }}>Learning Queue</div>
            </div>
            <div style={statBoxStyle}>
              <div style={{ color: learningWinRate >= 55 ? "#10B981" : learningWinRate >= 45 ? "#F59E0B" : "#EF4444", fontSize: "1.35rem", fontWeight: 800 }}>
                {learningOutcomes ? `${learningWinRate.toFixed(1)}%` : "No data"}
              </div>
              <div style={{ color: "#94A3B8", fontSize: "0.75rem" }}>Hit Rate</div>
            </div>
            <div style={statBoxStyle}>
              <div style={{ color: systemHealth?.dbConnected ? "#10B981" : "#EF4444", fontSize: "1.35rem", fontWeight: 800 }}>
                {systemHealth?.dbConnected ? "ONLINE" : "CHECK"}
              </div>
              <div style={{ color: "#94A3B8", fontSize: "0.75rem" }}>System Health</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(120px, 100%), 1fr))", gap: "0.5rem", marginBottom: "1rem" }}>
            {[
              ["Feed", systemHealth?.feed || "UNKNOWN"],
              ["Scanner", systemHealth?.scanner || "UNKNOWN"],
              ["Cache", systemHealth?.cache || "UNKNOWN"],
              ["API", systemHealth?.api || "UNKNOWN"],
            ].map(([label, value]) => (
              <div key={label} style={{
                border: "1px solid rgba(148,163,184,0.13)",
                background: "rgba(15,23,42,0.45)",
                borderRadius: 8,
                padding: "0.55rem 0.65rem",
              }}>
                <div style={{ color: "#64748B", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</div>
                <div style={{ color: String(value).includes("ERROR") || String(value).includes("DEGRADED") ? "#EF4444" : "#CBD5E1", fontSize: "0.78rem", fontWeight: 800, marginTop: "0.2rem" }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: "0.75rem" }}>
            {actionQueue.map((item, index) => (
              <div key={item} style={{
                border: "1px solid rgba(148,163,184,0.16)",
                background: "rgba(2,6,23,0.35)",
                borderRadius: 8,
                padding: "0.75rem",
                color: "#CBD5E1",
                fontSize: "0.85rem",
              }}>
                <span style={{ color: index === 0 && pendingLearning > 0 ? "#F59E0B" : "#10B981", fontWeight: 800, marginRight: "0.45rem" }}>{String(index + 1).padStart(2, "0")}</span>
                {item}
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...cardStyle, border: "1px solid rgba(59,130,246,0.32)" }}>
          <div style={{ color: "#94A3B8", fontSize: "0.75rem", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: "0.6rem" }}>Launch deck</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.55rem", marginBottom: "1rem" }}>
            {[
              ["/admin/live-scanner", "Live Scanner"],
              ["/admin/operator-terminal", "Operator Terminal"],
              ["/admin/risk", "Risk Governor"],
              ["/admin/outcomes", "Signal Outcomes"],
              ["/admin/quant", "Quant Terminal"],
              ["/admin/system", "System Health"],
            ].map(([href, label]) => (
              <Link key={href} href={href} style={{
                border: "1px solid rgba(148,163,184,0.18)",
                background: "rgba(15,23,42,0.65)",
                color: "#E5E7EB",
                borderRadius: 8,
                padding: "0.7rem",
                textDecoration: "none",
                fontSize: "0.85rem",
                fontWeight: 700,
              }}>
                {label}
              </Link>
            ))}
          </div>
          <div style={{ borderTop: "1px solid rgba(148,163,184,0.14)", paddingTop: "1rem", marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.55rem" }}>
              <span style={{ color: "#94A3B8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.12em" }}>Live candidates</span>
              <span style={{ color: "#64748B", fontSize: "0.75rem" }}>15m crypto</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {(topScannerHits.length ? topScannerHits : ([{ symbol: "No candidates", bias: "WAIT", permission: "WAIT", confidence: 0, symbolTrust: 0, regime: "—" }] as AdminScannerHit[])).slice(0, 4).map((hit) => (
                <button
                  key={hit.symbol}
                  onClick={() => hit.symbol !== "No candidates" && (window.location.href = `/admin/terminal/${encodeURIComponent(hit.symbol)}`)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "64px 58px 1fr 68px",
                    gap: "0.45rem",
                    alignItems: "center",
                    border: "1px solid rgba(148,163,184,0.14)",
                    background: "rgba(2,6,23,0.38)",
                    borderRadius: 8,
                    padding: "0.5rem 0.6rem",
                    color: "#E5E7EB",
                    cursor: hit.symbol === "No candidates" ? "default" : "pointer",
                    textAlign: "left",
                    fontSize: "0.78rem",
                  }}
                >
                  <span style={{ fontWeight: 900 }}>{hit.symbol}</span>
                  <span style={{ color: hit.bias === "LONG" ? "#10B981" : hit.bias === "SHORT" ? "#EF4444" : "#94A3B8", fontWeight: 800 }}>{hit.bias}</span>
                  <span style={{ color: hit.permission === "GO" ? "#10B981" : hit.permission === "BLOCK" ? "#EF4444" : "#F59E0B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {hit.playbook || hit.regime || "—"}
                  </span>
                  <span style={{ color: "#CBD5E1", textAlign: "right", fontWeight: 800 }}>{Number(hit.confidence || 0).toFixed(0)}%</span>
                </button>
              ))}
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(148,163,184,0.14)", paddingTop: "1rem" }}>
            <label style={{ display: "block", color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.45rem" }}>Symbol terminal jump</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                value={symbolJump}
                onChange={(event) => setSymbolJump(event.target.value.toUpperCase())}
                onKeyDown={(event) => { if (event.key === "Enter") openSymbolTerminal(); }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "rgba(2,6,23,0.75)",
                  border: "1px solid rgba(148,163,184,0.22)",
                  color: "#E5E7EB",
                  borderRadius: 8,
                  padding: "0.65rem 0.75rem",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                }}
              />
              <button
                onClick={openSymbolTerminal}
                style={{
                  background: "#10B981",
                  border: "none",
                  color: "#03130D",
                  borderRadius: 8,
                  padding: "0.65rem 0.85rem",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Open
              </button>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(148,163,184,0.14)", marginTop: "1rem", paddingTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.55rem" }}>
              <span style={{ color: "#94A3B8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.12em" }}>Edge watchlist</span>
              <span style={{ color: "#64748B", fontSize: "0.75rem" }}>{bestSymbols.length} ranked</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {(bestSymbols.length ? bestSymbols : [{ symbol: "No edge data", win_rate: 0, total_predictions: 0, avg_move_pct: 0 }]).slice(0, 4).map((item) => (
                <button
                  key={item.symbol}
                  onClick={() => item.symbol !== "No edge data" && (window.location.href = `/admin/terminal/${encodeURIComponent(item.symbol)}`)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    border: "1px solid rgba(148,163,184,0.14)",
                    background: "rgba(2,6,23,0.38)",
                    borderRadius: 8,
                    padding: "0.5rem 0.6rem",
                    color: "#E5E7EB",
                    cursor: item.symbol === "No edge data" ? "default" : "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontWeight: 800 }}>{item.symbol}</span>
                  <span style={{ color: Number(item.win_rate) >= 50 ? "#10B981" : "#F59E0B", fontSize: "0.78rem", fontWeight: 800 }}>
                    {Number(item.win_rate).toFixed(1)}% / {Number(item.total_predictions)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <details style={{
        background: "rgba(15, 23, 42, 0.72)",
        border: "1px solid rgba(59, 130, 246, 0.22)",
        borderRadius: "0.75rem",
        padding: "0.9rem 1rem",
        marginBottom: "1.5rem"
      }}>
        <summary style={{ color: "#93C5FD", cursor: "pointer", fontWeight: 700 }}>
          Maintenance drawer: Learning Machine migration SQL
        </summary>
        <p style={{ color: "#9CA3AF", fontSize: "0.85rem", marginTop: "0.85rem", marginBottom: "0.75rem" }}>
          Use this only when the learning tables need to be created or restored.
        </p>
        <p style={{ color: "var(--msp-accent)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
          Migration file: migrations/015_learning_machine.sql
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <span style={{ color: "#94A3B8", fontSize: "0.8rem" }}>SQL</span>
          <button
            onClick={() => navigator.clipboard.writeText(learningMigrationSql)}
            style={{
              background: "var(--msp-panel)",
              border: "1px solid var(--msp-border)",
              color: "var(--msp-accent)",
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: "0.8rem",
              cursor: "pointer"
            }}
          >
            Copy SQL
          </button>
        </div>
        <textarea
          readOnly
          value={learningMigrationSql}
          style={{
            width: "100%",
            minHeight: 220,
            background: "rgba(2,6,23,0.8)",
            border: "1px solid rgba(148,163,184,0.2)",
            borderRadius: 10,
            color: "#E2E8F0",
            padding: "12px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
            fontSize: 12
          }}
        />
      </details>

      {/* Key metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <div style={statBoxStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#10B981" }}>
            {stats?.overview.totalWorkspaces || 0}
          </div>
          <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Total Users</div>
        </div>
        <div style={statBoxStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--msp-accent)" }}>
            {stats?.overview.paidSubscriptions || 0}
          </div>
          <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Paid Subscribers</div>
        </div>
        <div style={statBoxStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#F59E0B" }}>
            {stats?.overview.trialSubscriptions || 0}
          </div>
          <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Active Trials</div>
        </div>
        <div style={statBoxStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--msp-accent)" }}>
            {stats?.aiUsage.today.totalQuestions || 0}
          </div>
          <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>AI Questions Today</div>
        </div>
        <div style={statBoxStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#EF4444" }}>
            {stats?.overview.pendingDeleteRequests || 0}
          </div>
          <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Pending Deletions</div>
        </div>
      </div>

      {/* Live Users Online */}
      <div style={{
        ...cardStyle,
        marginBottom: "2rem",
        border: "1px solid rgba(59, 130, 246, 0.3)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#E5E7EB" }}>
            Live Users Online
          </h2>
          <span style={{ color: "#6B7280", fontSize: "0.75rem" }}>Auto-refreshes every 30s</span>
        </div>
        {liveUsers ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.25rem" }}>
              <div style={statBoxStyle}>
                <div style={{ fontSize: "2rem", fontWeight: 700, color: "#3B82F6" }}>
                  {liveUsers.totalOnline}
                </div>
                <div style={{ color: "#9CA3AF", fontSize: "0.8rem" }}>Total Online</div>
              </div>
              <div style={statBoxStyle}>
                <div style={{ fontSize: "2rem", fontWeight: 700, color: "#10B981" }}>
                  {liveUsers.loggedIn}
                </div>
                <div style={{ color: "#9CA3AF", fontSize: "0.8rem" }}>Logged In</div>
              </div>
              <div style={statBoxStyle}>
                <div style={{ fontSize: "2rem", fontWeight: 700, color: "#9CA3AF" }}>
                  {liveUsers.anonymous}
                </div>
                <div style={{ color: "#9CA3AF", fontSize: "0.8rem" }}>Anonymous</div>
              </div>
            </div>
            {liveUsers.sections.length > 0 && (
              <div>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#94A3B8", marginBottom: "0.5rem" }}>
                  Active by Section

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
            gap: "0.5rem",
            marginBottom: "1rem",
          }}>
            {[
              ["Exposure", riskState ? `$${Number(riskState.openExposure || 0).toLocaleString()}` : "—"],
              ["Drawdown", riskState ? `${(Number(riskState.dailyDrawdown || 0) * 100).toFixed(2)}%` : "—"],
              ["Correlation", riskState ? `${(Number(riskState.correlationRisk || 0) * 100).toFixed(0)}%` : "—"],
              ["Positions", riskState ? `${riskState.activePositions} / ${riskState.maxPositions}` : "—"],
            ].map(([label, value]) => (
              <div key={label} style={{
                border: "1px solid rgba(148,163,184,0.13)",
                background: "rgba(2,6,23,0.32)",
                borderRadius: 8,
                padding: "0.55rem 0.65rem",
              }}>
                <div style={{ color: "#64748B", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</div>
                <div style={{ color: label === "Drawdown" && Number(riskState?.dailyDrawdown || 0) > 0.015 ? "#EF4444" : "#CBD5E1", fontSize: "0.86rem", fontWeight: 800, marginTop: "0.2rem" }}>{value}</div>
              </div>
            ))}
          </div>
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {liveUsers.sections.map((s) => (
                    <span
                      key={s.section}
                      style={{
                        background: "rgba(59, 130, 246, 0.15)",
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                        borderRadius: "0.5rem",
                        padding: "0.35rem 0.75rem",
                        fontSize: "0.8rem",
                        color: "#93C5FD",
                      }}
                    >
                      {s.section} <strong style={{ color: "#3B82F6" }}>{s.count}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {liveUsers.pages.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#94A3B8", marginBottom: "0.5rem" }}>
                  Top Pages
                </h3>
                <div style={{ maxHeight: "180px", overflowY: "auto" }}>
                  <table style={{ width: "100%", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                        <th style={{ textAlign: "left", padding: "0.3rem", color: "#6B7280" }}>Path</th>
                        <th style={{ textAlign: "left", padding: "0.3rem", color: "#6B7280" }}>Section</th>
                        <th style={{ textAlign: "right", padding: "0.3rem", color: "#6B7280" }}>Users</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveUsers.pages.map((p, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <td style={{ padding: "0.3rem", color: "#CBD5E1", fontFamily: "monospace", fontSize: "0.75rem" }}>{p.path}</td>
                          <td style={{ padding: "0.3rem", color: "#94A3B8" }}>{p.section}</td>
                          <td style={{ padding: "0.3rem", color: "#3B82F6", textAlign: "right", fontWeight: 600 }}>{p.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <p style={{ color: "#6B7280", fontSize: "0.875rem" }}>Loading live user data...</p>
        )}
      </div>

      {/* Financial Summary */}
      {stats?.overview.financials && (
        <div style={{
          ...cardStyle,
          marginBottom: "2rem",
          border: "1px solid rgba(16, 185, 129, 0.3)",
        }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
            Financial Summary
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            {/* Monthly */}
            <div>
              <h3 style={{ color: "#9CA3AF", fontSize: "0.8rem", textTransform: "uppercase", marginBottom: "0.75rem" }}>Monthly</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#9CA3AF" }}>Revenue (Paid Only)</span>
                  <span style={{ color: "#10B981", fontWeight: 600 }}>${stats.overview.financials.monthlyRevenue.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#9CA3AF" }}>Fixed Costs</span>
                  <span style={{ color: "#EF4444", fontWeight: 600 }}>-${stats.overview.financials.monthlyCosts.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "0.5rem" }}>
                  <span style={{ color: "#E5E7EB", fontWeight: 600 }}>Profit/Loss</span>
                  <span style={{ color: stats.overview.financials.monthlyProfit >= 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                    {stats.overview.financials.monthlyProfit >= 0 ? '+' : ''}${stats.overview.financials.monthlyProfit.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
            {/* Yearly */}
            <div>
              <h3 style={{ color: "#9CA3AF", fontSize: "0.8rem", textTransform: "uppercase", marginBottom: "0.75rem" }}>Yearly (Projected)</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#9CA3AF" }}>Revenue</span>
                  <span style={{ color: "#10B981", fontWeight: 600 }}>${stats.overview.financials.yearlyRevenue.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#9CA3AF" }}>Fixed Costs</span>
                  <span style={{ color: "#EF4444", fontWeight: 600 }}>-${stats.overview.financials.yearlyCosts.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "0.5rem" }}>
                  <span style={{ color: "#E5E7EB", fontWeight: 600 }}>Profit/Loss</span>
                  <span style={{ color: stats.overview.financials.yearlyProfit >= 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                    {stats.overview.financials.yearlyProfit >= 0 ? '+' : ''}${stats.overview.financials.yearlyProfit.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid-equal-2-col-responsive" style={{ gap: "1.5rem" }}>
        {/* Subscriptions by tier */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
            Subscriptions by Tier
          </h2>
          {stats?.overview.subscriptionsByTier.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {stats.overview.subscriptionsByTier.map((sub, i) => (
                <div key={`${sub.tier}-${sub.status}`} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                }}>
                  <span style={{ color: "#9CA3AF", textTransform: "capitalize" }}>
                    {sub.tier.replace("_", " ")}
                    <span style={{
                      marginLeft: "0.5rem",
                      padding: "0.125rem 0.375rem",
                      borderRadius: "0.25rem",
                      fontSize: "0.7rem",
                      background: sub.status === 'trialing' ? "rgba(245,158,11,0.2)" : "rgba(16,185,129,0.2)",
                      color: sub.status === 'trialing' ? "#F59E0B" : "#10B981",
                    }}>
                      {sub.status === 'trialing' ? 'trial' : 'paid'}
                    </span>
                  </span>
                  <span style={{ color: sub.status === 'trialing' ? "#F59E0B" : "#10B981", fontWeight: 600 }}>{sub.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "#6B7280" }}>No subscriptions yet</p>
          )}
        </div>

        {/* AI Usage (last 7 days) */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
            AI Usage (Last 7 Days)
          </h2>
          {stats?.aiUsage.last7Days.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {stats.aiUsage.last7Days.map((day) => (
                <div key={day.date} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                }}>
                  <span style={{ color: "#9CA3AF" }}>
                    {new Date(day.date).toLocaleDateString()}
                  </span>
                  <span style={{ color: "var(--msp-accent)", fontWeight: 600 }}>{day.count} questions</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "#6B7280" }}>No AI usage recorded</p>
          )}
        </div>

        {/* Recent signups */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
            New Users (Last 7 Days)
          </h2>
          {stats?.signups.last7Days.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {stats.signups.last7Days.map((day) => (
                <div key={day.date} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                }}>
                  <span style={{ color: "#9CA3AF" }}>
                    {new Date(day.date).toLocaleDateString()}
                  </span>
                  <span style={{ color: "#10B981", fontWeight: 600 }}>{day.count} users</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "#6B7280" }}>No new signups</p>
          )}
        </div>

        {/* Top AI users */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
            Top AI Users Today
          </h2>
          {stats?.aiUsage.topUsersToday.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {stats.aiUsage.topUsersToday.slice(0, 5).map((user, i) => (
                <div key={user.workspace_id} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                }}>
                  <span style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>
                    {i + 1}. {user.workspace_id.slice(0, 12)}...
                    <span style={{
                      marginLeft: "0.5rem",
                      padding: "0.125rem 0.5rem",
                      background: user.tier === "pro_trader" ? "rgba(245, 158, 11, 0.2)" : 
                                  user.tier === "pro" ? "rgba(59, 130, 246, 0.2)" : "rgba(107, 114, 128, 0.2)",
                      borderRadius: "0.25rem",
                      fontSize: "0.75rem",
                      color: user.tier === "pro_trader" ? "#F59E0B" : 
                             user.tier === "pro" ? "var(--msp-accent)" : "#9CA3AF",
                    }}>
                      {user.tier}
                    </span>
                  </span>
                  <span style={{ color: "var(--msp-accent)", fontWeight: 600 }}>{user.questions}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "#6B7280" }}>No AI usage today</p>
          )}
        </div>
      </div>

      {/* Learning Machine Section */}
      <div style={{ marginTop: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#E5E7EB" }}>
            Learning Machine Data
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {learningResult && (
              <span style={{ 
                color: learningResult.ok ? "#22C55E" : "#EF4444", 
                fontSize: "0.85rem" 
              }}>
                {learningResult.ok 
                  ? `✓ Processed ${learningResult.processed} predictions` 
                  : `✗ ${(learningResult.errors || ['Unknown error']).join(", ")}`}
              </span>
            )}
            <button
              onClick={processLearningOutcomes}
              disabled={processingLearning}
              style={{
                background: processingLearning ? "rgba(107,114,128,0.3)" : "rgba(16,185,129,0.2)",
                border: "1px solid rgba(16,185,129,0.4)",
                color: processingLearning ? "#9CA3AF" : "#10B981",
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: "0.9rem",
                cursor: processingLearning ? "not-allowed" : "pointer",
                fontWeight: 600
              }}
            >
              {processingLearning ? "Processing..." : "Process Now"}
            </button>
          </div>
        </div>

        {/* Learning Totals */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
          <div style={statBoxStyle}>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#A855F7" }}>
              {stats?.learning?.totals?.total_predictions || 0}
            </div>
            <div style={{ color: "#9CA3AF", fontSize: "0.8rem" }}>Total Predictions</div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#FBBF24" }}>
              {stats?.learning?.totals?.pending || 0}
            </div>
            <div style={{ color: "#9CA3AF", fontSize: "0.8rem" }}>Pending</div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#10B981" }}>
              {stats?.learning?.totals?.processed || 0}
            </div>
            <div style={{ color: "#9CA3AF", fontSize: "0.8rem" }}>Processed</div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#22C55E" }}>
              {stats?.learning?.totals?.wins || 0}
            </div>
            <div style={{ color: "#9CA3AF", fontSize: "0.8rem" }}>Wins (Hit Target)</div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#EF4444" }}>
              {stats?.learning?.totals?.stops || 0}
            </div>
            <div style={{ color: "#9CA3AF", fontSize: "0.8rem" }}>Stops (Hit Stop)</div>
          </div>
        </div>

        <div className="grid-equal-2-col-responsive" style={{ gap: "1.5rem" }}>
          {/* Per-Symbol Stats */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
              Symbol Win Rates
            </h3>
            {stats?.learning?.stats?.length ? (
              <div style={{ maxHeight: "300px", overflowY: "auto", overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: "0.85rem", minWidth: 400 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                      <th style={{ textAlign: "left", padding: "0.5rem", color: "#9CA3AF" }}>Symbol</th>
                      <th style={{ textAlign: "right", padding: "0.5rem", color: "#9CA3AF" }}>Predictions</th>
                      <th style={{ textAlign: "right", padding: "0.5rem", color: "#9CA3AF" }}>Win Rate</th>
                      <th style={{ textAlign: "right", padding: "0.5rem", color: "#9CA3AF" }}>Avg Move</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.learning.stats.map((s) => (
                      <tr key={s.symbol} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: "0.5rem", color: "#E5E7EB", fontWeight: 600 }}>{s.symbol}</td>
                        <td style={{ padding: "0.5rem", textAlign: "right", color: "#9CA3AF" }}>{s.total_predictions}</td>
                        <td style={{ 
                          padding: "0.5rem", 
                          textAlign: "right", 
                          color: Number(s.win_rate) >= 50 ? "#10B981" : "#EF4444",
                          fontWeight: 600
                        }}>
                          {Number(s.win_rate).toFixed(1)}%
                        </td>
                        <td style={{ padding: "0.5rem", textAlign: "right", color: "var(--msp-accent)" }}>
                          {Number(s.avg_move_pct).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: "#6B7280" }}>No learning data yet. Run the migration first.</p>
            )}
          </div>

          {/* Recent Predictions */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
              Recent Predictions
            </h3>
            {stats?.learning?.recentPredictions?.length ? (
              <div style={{ maxHeight: "300px", overflowY: "auto", overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: "0.8rem", minWidth: 420 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                      <th style={{ textAlign: "left", padding: "0.4rem", color: "#9CA3AF" }}>Symbol</th>
                      <th style={{ textAlign: "center", padding: "0.4rem", color: "#9CA3AF" }}>Direction</th>
                      <th style={{ textAlign: "right", padding: "0.4rem", color: "#9CA3AF" }}>Conf</th>
                      <th style={{ textAlign: "center", padding: "0.4rem", color: "#9CA3AF" }}>Outcome</th>
                      <th style={{ textAlign: "right", padding: "0.4rem", color: "#9CA3AF" }}>Move</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.learning.recentPredictions.map((p, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: "0.4rem", color: "#E5E7EB", fontWeight: 500 }}>{p.symbol}</td>
                        <td style={{ 
                          padding: "0.4rem", 
                          textAlign: "center",
                          color: p.prediction_direction === "bullish" ? "#10B981" : p.prediction_direction === "bearish" ? "#EF4444" : "#9CA3AF"
                        }}>
                          {p.prediction_direction === "bullish" ? "BULL" : p.prediction_direction === "bearish" ? "BEAR" : "NEUT"}
                        </td>
                        <td style={{ padding: "0.4rem", textAlign: "right", color: "#FBBF24" }}>{p.confidence}%</td>
                        <td style={{ padding: "0.4rem", textAlign: "center" }}>
                          {p.status === "pending" ? (
                            <span style={{ color: "#FBBF24" }}>PENDING</span>
                          ) : p.hit_target ? (
                            <span style={{ color: "#10B981" }}>TARGET</span>
                          ) : p.hit_stop ? (
                            <span style={{ color: "#EF4444" }}>STOP</span>
                          ) : (
                            <span style={{ color: "#9CA3AF" }}>—</span>
                          )}
                        </td>
                        <td style={{ 
                          padding: "0.4rem", 
                          textAlign: "right",
                          color: p.move_pct ? (Number(p.move_pct) >= 0 ? "#10B981" : "#EF4444") : "#6B7280"
                        }}>
                          {p.move_pct ? `${Number(p.move_pct) >= 0 ? "+" : ""}${Number(p.move_pct).toFixed(2)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: "#6B7280" }}>No predictions yet. Run the migration first.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
