"use client";

import { useState, useEffect } from "react";

interface CostStats {
  pricing: { input: number; output: number };
  today: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    requests: number;
    cost: number;
  };
  last7Days: {
    date: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    requests: number;
    cost: number;
  }[];
  last30Days: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    requests: number;
    cost: number;
  };
  hourlyToday: { hour: number; tokens: number; requests: number }[];
  byTier: {
    tier: string;
    promptTokens: number;
    completionTokens: number;
    requests: number;
    cost: number;
  }[];
  topCostUsers: {
    workspaceId: string;
    tier: string;
    promptTokens: number;
    completionTokens: number;
    requests: number;
    cost: number;
  }[];
}

export default function AdminCostsPage() {
  const [stats, setStats] = useState<CostStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStats = async () => {
    const secret = sessionStorage.getItem("admin_secret");
    if (!secret) return;

    try {
      const res = await fetch("/api/admin/costs", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      if (res.ok) {
        setStats(data);
        setError("");
      } else {
        setError(data.error || "Failed to fetch costs");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      if (autoRefresh) fetchStats();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;
  const formatTokens = (tokens: number) => tokens.toLocaleString();

  if (loading) {
    return <div style={{ color: "#9CA3AF" }}>Loading cost data...</div>;
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

  // Calculate projected monthly cost
  const dayOfMonth = new Date().getDate();
  const projectedMonthly = stats ? (stats.last30Days.cost / 30) * 30 : 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#E5E7EB" }}>
          💰 AI Cost Tracker
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#9CA3AF", fontSize: "0.875rem" }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ accentColor: "#10B981" }}
            />
            Auto-refresh (30s)
          </label>
          <button
            onClick={fetchStats}
            style={{
              padding: "0.5rem 1rem",
              background: "rgba(16, 185, 129, 0.2)",
              border: "1px solid #10B981",
              borderRadius: "0.5rem",
              color: "#10B981",
              cursor: "pointer",
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Pricing info */}
      <div style={{ 
        background: "rgba(59, 130, 246, 0.1)", 
        border: "1px solid rgba(59, 130, 246, 0.3)",
        borderRadius: "0.5rem",
        padding: "0.75rem 1rem",
        marginBottom: "1.5rem",
        fontSize: "0.875rem",
        color: "var(--msp-accent)"
      }}>
        <strong>GPT-4o-mini Pricing:</strong> Input: $0.15/1M tokens • Output: $0.60/1M tokens
      </div>

      {/* Key cost metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <div style={statBoxStyle}>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#10B981" }}>
            {formatCost(stats?.today.cost || 0)}
          </div>
          <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Cost Today</div>
          <div style={{ color: "#6B7280", fontSize: "0.75rem", marginTop: "0.25rem" }}>
            {stats?.today.requests || 0} requests
          </div>
        </div>
        <div style={statBoxStyle}>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--msp-accent)" }}>
            {formatCost(stats?.last30Days.cost || 0)}
          </div>
          <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Last 30 Days</div>
          <div style={{ color: "#6B7280", fontSize: "0.75rem", marginTop: "0.25rem" }}>
            {stats?.last30Days.requests || 0} requests
          </div>
        </div>
        <div style={statBoxStyle}>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#F59E0B" }}>
            {formatTokens(stats?.today.totalTokens || 0)}
          </div>
          <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Tokens Today</div>
          <div style={{ color: "#6B7280", fontSize: "0.75rem", marginTop: "0.25rem" }}>
            {formatTokens(stats?.today.promptTokens || 0)} in / {formatTokens(stats?.today.completionTokens || 0)} out
          </div>
        </div>
        <div style={statBoxStyle}>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--msp-accent)" }}>
            ~{formatCost(projectedMonthly)}
          </div>
          <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Projected Monthly</div>
          <div style={{ color: "#6B7280", fontSize: "0.75rem", marginTop: "0.25rem" }}>
            Based on 30-day avg
          </div>
        </div>
      </div>

      <div className="grid-equal-2-col-responsive" style={{ gap: "1.5rem" }}>
        {/* Last 7 days breakdown */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
            📅 Last 7 Days
          </h2>
          {stats?.last7Days.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {stats.last7Days.map((day) => (
                <div key={day.date} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                }}>
                  <span style={{ color: "#9CA3AF" }}>
                    {new Date(day.date).toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ color: "#10B981", fontWeight: 600 }}>{formatCost(day.cost)}</span>
                    <span style={{ color: "#6B7280", fontSize: "0.75rem", marginLeft: "0.5rem" }}>
                      ({day.requests} req)
                    </span>
                  </div>
                </div>
              ))}
              <div style={{ 
                marginTop: "0.5rem", 
                paddingTop: "0.5rem", 
                borderTop: "2px solid rgba(16, 185, 129, 0.3)",
                display: "flex",
                justifyContent: "space-between"
              }}>
                <span style={{ color: "#E5E7EB", fontWeight: 600 }}>7-Day Total</span>
                <span style={{ color: "#10B981", fontWeight: 700 }}>
                  {formatCost(stats.last7Days.reduce((sum, d) => sum + d.cost, 0))}
                </span>
              </div>
            </div>
          ) : (
            <p style={{ color: "#6B7280" }}>No data yet (token tracking just enabled)</p>
          )}
        </div>

        {/* Cost by tier */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
            👥 Cost by Tier (30 Days)
          </h2>
          {stats?.byTier.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {stats.byTier.map((tier) => (
                <div key={tier.tier} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.75rem",
                  background: "rgba(0,0,0,0.2)",
                  borderRadius: "0.5rem",
                }}>
                  <div>
                    <span style={{
                      padding: "0.25rem 0.5rem",
                      background: tier.tier === "pro_trader" ? "rgba(245, 158, 11, 0.2)" : 
                                  tier.tier === "pro" ? "rgba(59, 130, 246, 0.2)" : "rgba(107, 114, 128, 0.2)",
                      borderRadius: "0.25rem",
                      fontSize: "0.875rem",
                      color: tier.tier === "pro_trader" ? "#F59E0B" : 
                             tier.tier === "pro" ? "var(--msp-accent)" : "#9CA3AF",
                      textTransform: "capitalize",
                    }}>
                      {tier.tier.replace("_", " ")}
                    </span>
                    <span style={{ color: "#6B7280", fontSize: "0.75rem", marginLeft: "0.5rem" }}>
                      {tier.requests} requests
                    </span>
                  </div>
                  <span style={{ color: "#10B981", fontWeight: 600 }}>{formatCost(tier.cost)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "#6B7280" }}>No tier data yet</p>
          )}
        </div>

        {/* Top cost users */}
        <div style={{ ...cardStyle, gridColumn: "span 2" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
            🏆 Top Cost Users (30 Days)
          </h2>
          {stats?.topCostUsers.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
              {stats.topCostUsers.map((user, i) => (
                <div key={user.workspaceId} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.75rem",
                  background: "rgba(0,0,0,0.2)",
                  borderRadius: "0.5rem",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ 
                      color: i < 3 ? "#F59E0B" : "#6B7280",
                      fontWeight: i < 3 ? 700 : 400,
                      width: "1.5rem"
                    }}>
                      {i + 1}.
                    </span>
                    <div>
                      <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>
                        {user.workspaceId.slice(0, 8)}...
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#6B7280" }}>
                        {user.requests} req • {formatTokens(user.promptTokens + user.completionTokens)} tokens
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#10B981", fontWeight: 600 }}>{formatCost(user.cost)}</div>
                    <span style={{
                      padding: "0.125rem 0.375rem",
                      background: user.tier === "pro_trader" ? "rgba(245, 158, 11, 0.2)" : 
                                  user.tier === "pro" ? "rgba(59, 130, 246, 0.2)" : "rgba(107, 114, 128, 0.2)",
                      borderRadius: "0.25rem",
                      fontSize: "0.625rem",
                      color: user.tier === "pro_trader" ? "#F59E0B" : 
                             user.tier === "pro" ? "var(--msp-accent)" : "#9CA3AF",
                    }}>
                      {user.tier}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "#6B7280" }}>No user data yet</p>
          )}
        </div>
      </div>

      {/* Token breakdown info */}
      <div style={{ 
        marginTop: "2rem",
        padding: "1rem",
        background: "rgba(0,0,0,0.3)",
        borderRadius: "0.5rem",
        fontSize: "0.875rem",
        color: "#6B7280"
      }}>
        <strong style={{ color: "#9CA3AF" }}>📊 30-Day Token Breakdown:</strong>
        <div style={{ marginTop: "0.5rem", display: "flex", gap: "2rem" }}>
          <span>Input: {formatTokens(stats?.last30Days.promptTokens || 0)} tokens</span>
          <span>Output: {formatTokens(stats?.last30Days.completionTokens || 0)} tokens</span>
          <span>Total: {formatTokens(stats?.last30Days.totalTokens || 0)} tokens</span>
        </div>
      </div>
    </div>
  );
}
