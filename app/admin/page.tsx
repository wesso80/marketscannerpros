"use client";

import { useState, useEffect } from "react";

interface Stats {
  overview: {
    totalWorkspaces: number;
    subscriptionsByTier: { tier: string; count: number }[];
    activeTrials: number;
    pendingDeleteRequests: number;
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
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processingLearning, setProcessingLearning] = useState(false);
  const [learningResult, setLearningResult] = useState<{ ok: boolean; processed: number; errors: string[] } | null>(null);

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
  }, []);

  const fetchStats = async () => {
    const secret = sessionStorage.getItem("admin_secret");
    if (!secret) return;

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

  const processLearningOutcomes = async () => {
    setProcessingLearning(true);
    setLearningResult(null);
    try {
      const res = await fetch("/api/jobs/learning-outcomes", { method: "POST" });
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

  return (
    <div>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#E5E7EB", marginBottom: "1.5rem" }}>
        📊 Dashboard Overview
      </h1>

      {/* Learning Machine Migration */}
      <div style={{
        background: "rgba(15, 23, 42, 0.8)",
        border: "1px solid rgba(59, 130, 246, 0.3)",
        borderRadius: "1rem",
        padding: "1.25rem",
        marginBottom: "1.5rem"
      }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "0.5rem" }}>
          🧠 Learning Machine — Neon Migration
        </h2>
        <p style={{ color: "#9CA3AF", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
          Run the SQL below in your Neon PostgreSQL console to enable prediction logging + learning outcomes.
        </p>
        <p style={{ color: "var(--msp-accent)", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
          Migration file: [migrations/015_learning_machine.sql](migrations/015_learning_machine.sql)
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <span style={{ color: "#94A3B8", fontSize: "0.8rem" }}>SQL (copy & run in Neon)</span>
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
      </div>

      {/* Key metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <div style={statBoxStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#10B981" }}>
            {stats?.overview.totalWorkspaces || 0}
          </div>
          <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Total Users</div>
        </div>
        <div style={statBoxStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--msp-accent)" }}>
            {stats?.aiUsage.today.totalQuestions || 0}
          </div>
          <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>AI Questions Today</div>
        </div>
        <div style={statBoxStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#F59E0B" }}>
            {stats?.overview.activeTrials || 0}
          </div>
          <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Active Trials</div>
        </div>
        <div style={statBoxStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#EF4444" }}>
            {stats?.overview.pendingDeleteRequests || 0}
          </div>
          <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Pending Deletions</div>
        </div>
      </div>

      <div className="grid-equal-2-col-responsive" style={{ gap: "1.5rem" }}>
        {/* Subscriptions by tier */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
            💳 Subscriptions by Tier
          </h2>
          {stats?.overview.subscriptionsByTier.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {stats.overview.subscriptionsByTier.map((sub) => (
                <div key={sub.tier} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                }}>
                  <span style={{ color: "#9CA3AF", textTransform: "capitalize" }}>
                    {sub.tier.replace("_", " ")}
                  </span>
                  <span style={{ color: "#10B981", fontWeight: 600 }}>{sub.count}</span>
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
            🤖 AI Usage (Last 7 Days)
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
            👤 New Users (Last 7 Days)
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
            🏆 Top AI Users Today
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
            🧠 Learning Machine Data
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {learningResult && (
              <span style={{ 
                color: learningResult.ok ? "#22C55E" : "#EF4444", 
                fontSize: "0.85rem" 
              }}>
                {learningResult.ok 
                  ? `✓ Processed ${learningResult.processed} predictions` 
                  : `✗ ${learningResult.errors.join(", ")}`}
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
              {processingLearning ? "⏳ Processing..." : "⚡ Process Now"}
            </button>
          </div>
        </div>

        {/* Learning Totals */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
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
              📊 Symbol Win Rates
            </h3>
            {stats?.learning?.stats?.length ? (
              <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                <table style={{ width: "100%", fontSize: "0.85rem" }}>
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
              🔮 Recent Predictions
            </h3>
            {stats?.learning?.recentPredictions?.length ? (
              <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                <table style={{ width: "100%", fontSize: "0.8rem" }}>
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
                          {p.prediction_direction === "bullish" ? "🟢" : p.prediction_direction === "bearish" ? "🔴" : "⚪"}
                        </td>
                        <td style={{ padding: "0.4rem", textAlign: "right", color: "#FBBF24" }}>{p.confidence}%</td>
                        <td style={{ padding: "0.4rem", textAlign: "center" }}>
                          {p.status === "pending" ? (
                            <span style={{ color: "#FBBF24" }}>⏳</span>
                          ) : p.hit_target ? (
                            <span style={{ color: "#10B981" }}>✅</span>
                          ) : p.hit_stop ? (
                            <span style={{ color: "#EF4444" }}>❌</span>
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
