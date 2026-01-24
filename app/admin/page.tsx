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
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        <p style={{ color: "#93C5FD", fontSize: "0.9rem" }}>
          Migration file: [migrations/015_learning_machine.sql](migrations/015_learning_machine.sql)
        </p>
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
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#3B82F6" }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
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
                  <span style={{ color: "#3B82F6", fontWeight: 600 }}>{day.count} questions</span>
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
                             user.tier === "pro" ? "#3B82F6" : "#9CA3AF",
                    }}>
                      {user.tier}
                    </span>
                  </span>
                  <span style={{ color: "#3B82F6", fontWeight: 600 }}>{user.questions}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "#6B7280" }}>No AI usage today</p>
          )}
        </div>
      </div>
    </div>
  );
}
