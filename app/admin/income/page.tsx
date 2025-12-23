"use client";

import { useState, useEffect } from "react";

interface IncomeStats {
  summary: {
    grossRevenue: number;
    stripeFees: number;
    netRevenue: number;
    totalCosts: number;
    profit: number;
    profitMargin: number;
  };
  subscriptions: {
    pro: number;
    proTrader: number;
    total: number;
    newThisMonth: number;
    churnThisMonth: number;
  };
  costs: {
    fixed: Record<string, number>;
    totalFixed: number;
    ai: number;
    stripe: number;
    total: number;
  };
  aiUsage: {
    promptTokens: number;
    completionTokens: number;
    requests: number;
    cost: number;
  };
  pricing: {
    pro: number;
    pro_trader: number;
    free: number;
  };
  history: {
    month: string;
    pro: number;
    pro_trader: number;
    revenue: number;
  }[];
}

export default function AdminIncomePage() {
  const [stats, setStats] = useState<IncomeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const secret = sessionStorage.getItem("admin_secret");
    if (!secret) return;

    try {
      const res = await fetch("/api/admin/income", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      if (res.ok) {
        setStats(data);
      } else {
        setError(data.error || "Failed to fetch income data");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  if (loading) {
    return <div style={{ color: "#9CA3AF" }}>Loading income data...</div>;
  }

  if (error) {
    return <div style={{ color: "#F87171" }}>Error: {error}</div>;
  }

  if (!stats) return null;

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
        💵 Income & Expenses
      </h1>

      {/* Profit Summary */}
      <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#10B981", marginBottom: "1rem" }}>
          📈 This Month&apos;s Summary
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "1rem" }}>
          <div style={statBoxStyle}>
            <div style={{ color: "#9CA3AF", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
              Gross Revenue
            </div>
            <div style={{ color: "#10B981", fontSize: "1.5rem", fontWeight: 700 }}>
              {formatCurrency(stats.summary.grossRevenue)}
            </div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ color: "#9CA3AF", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
              Total Costs
            </div>
            <div style={{ color: "#EF4444", fontSize: "1.5rem", fontWeight: 700 }}>
              {formatCurrency(stats.summary.totalCosts)}
            </div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ color: "#9CA3AF", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
              Net Profit
            </div>
            <div style={{ 
              color: stats.summary.profit >= 0 ? "#10B981" : "#EF4444", 
              fontSize: "1.5rem", 
              fontWeight: 700 
            }}>
              {formatCurrency(stats.summary.profit)}
            </div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ color: "#9CA3AF", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
              Profit Margin
            </div>
            <div style={{ 
              color: stats.summary.profitMargin >= 0 ? "#10B981" : "#EF4444", 
              fontSize: "1.5rem", 
              fontWeight: 700 
            }}>
              {formatPercent(stats.summary.profitMargin)}
            </div>
          </div>
        </div>
      </div>

      {/* Two column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>
        
        {/* Revenue Section */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#10B981", marginBottom: "1rem" }}>
            💰 Revenue
          </h2>
          
          {/* Subscription breakdown */}
          <div style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ color: "#9CA3AF", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
              Active Subscriptions
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                padding: "0.75rem", 
                background: "rgba(59, 130, 246, 0.1)", 
                borderRadius: "0.5rem",
                border: "1px solid rgba(59, 130, 246, 0.2)"
              }}>
                <span style={{ color: "#3B82F6" }}>Pro ({stats.subscriptions.pro})</span>
                <span style={{ color: "#E5E7EB", fontWeight: 600 }}>
                  {formatCurrency(stats.subscriptions.pro * stats.pricing.pro)}/mo
                </span>
              </div>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                padding: "0.75rem", 
                background: "rgba(245, 158, 11, 0.1)", 
                borderRadius: "0.5rem",
                border: "1px solid rgba(245, 158, 11, 0.2)"
              }}>
                <span style={{ color: "#F59E0B" }}>Pro Trader ({stats.subscriptions.proTrader})</span>
                <span style={{ color: "#E5E7EB", fontWeight: 600 }}>
                  {formatCurrency(stats.subscriptions.proTrader * stats.pricing.pro_trader)}/mo
                </span>
              </div>
            </div>
          </div>

          {/* Revenue details */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span style={{ color: "#9CA3AF" }}>Gross Revenue</span>
              <span style={{ color: "#E5E7EB" }}>{formatCurrency(stats.summary.grossRevenue)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span style={{ color: "#9CA3AF" }}>Stripe Fees (2.9% + $0.30)</span>
              <span style={{ color: "#EF4444" }}>-{formatCurrency(stats.summary.stripeFees)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, paddingTop: "0.5rem", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <span style={{ color: "#E5E7EB" }}>Net Revenue</span>
              <span style={{ color: "#10B981" }}>{formatCurrency(stats.summary.netRevenue)}</span>
            </div>
          </div>

          {/* Subscription metrics */}
          <div style={{ marginTop: "1.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div style={{ ...statBoxStyle, textAlign: "left" }}>
              <div style={{ color: "#10B981", fontSize: "1.25rem", fontWeight: 600 }}>
                +{stats.subscriptions.newThisMonth}
              </div>
              <div style={{ color: "#9CA3AF", fontSize: "0.75rem" }}>New this month</div>
            </div>
            <div style={{ ...statBoxStyle, textAlign: "left" }}>
              <div style={{ color: "#EF4444", fontSize: "1.25rem", fontWeight: 600 }}>
                -{stats.subscriptions.churnThisMonth}
              </div>
              <div style={{ color: "#9CA3AF", fontSize: "0.75rem" }}>Churned</div>
            </div>
          </div>
        </div>

        {/* Expenses Section */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#EF4444", marginBottom: "1rem" }}>
            📤 Expenses
          </h2>
          
          {/* Fixed costs */}
          <div style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ color: "#9CA3AF", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
              Fixed Monthly Costs
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {Object.entries(stats.costs.fixed).map(([name, cost]) => (
                <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0" }}>
                  <span style={{ color: "#9CA3AF", textTransform: "capitalize" }}>
                    {name.replace(/_/g, " ")}
                  </span>
                  <span style={{ color: cost > 0 ? "#E5E7EB" : "#6B7280" }}>
                    {formatCurrency(cost)}
                  </span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderTop: "1px solid rgba(255,255,255,0.1)", fontWeight: 600 }}>
                <span style={{ color: "#E5E7EB" }}>Subtotal</span>
                <span style={{ color: "#E5E7EB" }}>{formatCurrency(stats.costs.totalFixed)}</span>
              </div>
            </div>
          </div>

          {/* Variable costs */}
          <div style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ color: "#9CA3AF", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
              Variable Costs (This Month)
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0" }}>
                <span style={{ color: "#9CA3AF" }}>OpenAI API</span>
                <span style={{ color: "#E5E7EB" }}>{formatCurrency(stats.costs.ai)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0" }}>
                <span style={{ color: "#9CA3AF" }}>Stripe Processing</span>
                <span style={{ color: "#E5E7EB" }}>{formatCurrency(stats.costs.stripe)}</span>
              </div>
            </div>
          </div>

          {/* Total costs */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span style={{ color: "#E5E7EB" }}>Total Expenses</span>
              <span style={{ color: "#EF4444" }}>{formatCurrency(stats.summary.totalCosts)}</span>
            </div>
          </div>

          {/* AI Usage details */}
          <div style={{ marginTop: "1.5rem", padding: "1rem", background: "rgba(0,0,0,0.3)", borderRadius: "0.5rem" }}>
            <h4 style={{ color: "#9CA3AF", fontSize: "0.75rem", marginBottom: "0.5rem" }}>
              OpenAI Usage This Month
            </h4>
            <div style={{ fontSize: "0.875rem", color: "#E5E7EB" }}>
              <div>{stats.aiUsage.requests.toLocaleString()} requests</div>
              <div style={{ color: "#9CA3AF", fontSize: "0.75rem" }}>
                {(stats.aiUsage.promptTokens / 1000).toFixed(0)}K input + {(stats.aiUsage.completionTokens / 1000).toFixed(0)}K output tokens
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Historical Data */}
      {stats.history.length > 0 && (
        <div style={{ ...cardStyle, marginTop: "1.5rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
            📊 Revenue History
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "#9CA3AF" }}>Month</th>
                  <th style={{ textAlign: "right", padding: "0.75rem", color: "#3B82F6" }}>Pro</th>
                  <th style={{ textAlign: "right", padding: "0.75rem", color: "#F59E0B" }}>Pro Trader</th>
                  <th style={{ textAlign: "right", padding: "0.75rem", color: "#10B981" }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {stats.history.map((row) => (
                  <tr key={row.month} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "0.75rem", color: "#E5E7EB" }}>
                      {new Date(row.month + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </td>
                    <td style={{ textAlign: "right", padding: "0.75rem", color: "#3B82F6" }}>{row.pro}</td>
                    <td style={{ textAlign: "right", padding: "0.75rem", color: "#F59E0B" }}>{row.pro_trader}</td>
                    <td style={{ textAlign: "right", padding: "0.75rem", color: "#10B981", fontWeight: 600 }}>
                      {formatCurrency(row.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pricing Reference */}
      <div style={{ ...cardStyle, marginTop: "1.5rem", opacity: 0.7 }}>
        <h3 style={{ fontSize: "0.875rem", color: "#9CA3AF", marginBottom: "0.5rem" }}>
          Pricing Reference
        </h3>
        <div style={{ fontSize: "0.75rem", color: "#6B7280" }}>
          Pro: ${stats.pricing.pro}/mo • Pro Trader: ${stats.pricing.pro_trader}/mo • 
          Stripe: 2.9% + $0.30/transaction • OpenAI: $2.50/1M input, $10/1M output tokens
        </div>
      </div>
    </div>
  );
}
