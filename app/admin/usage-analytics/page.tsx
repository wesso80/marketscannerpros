"use client";

import { useState, useEffect } from "react";

interface ActiveUsers { dau: number; wau: number; mau: number; online_now: number }
interface SignupFunnel { signups_30d: number; trials_30d: number; paid_30d: number; active_pro: number; active_pro_trader: number; churned_total: number }
interface DailyScan { date: string; scans: number; unique_scanners: number }
interface FeatureAdoption { journal_users: number; portfolio_users: number; ai_users: number; scanner_users: number; trade_outcome_users: number; total_active_users: number }
interface TradeActivity { trades_30d: number; trades_7d: number; trades_today: number; avg_win_rate: number; avg_r_multiple: number }
interface TierRow { tier: string; status: string; count: number }
interface RetentionWeek { week: string; active_users: number }
interface TopWorkspace { workspace_id: string; email: string; tier: string; scans_7d: number; trades_7d: number; ai_questions_7d: number; journal_entries_7d: number; activity_score: number }
interface AnalyticsMeta { degraded: boolean; failedQueries: string[]; warnings: string[] }

export default function UsageAnalyticsPage() {
  const [activeUsers, setActiveUsers] = useState<ActiveUsers>({ dau: 0, wau: 0, mau: 0, online_now: 0 });
  const [funnel, setFunnel] = useState<SignupFunnel>({ signups_30d: 0, trials_30d: 0, paid_30d: 0, active_pro: 0, active_pro_trader: 0, churned_total: 0 });
  const [dailyScans, setDailyScans] = useState<DailyScan[]>([]);
  const [adoption, setAdoption] = useState<FeatureAdoption>({ journal_users: 0, portfolio_users: 0, ai_users: 0, scanner_users: 0, trade_outcome_users: 0, total_active_users: 0 });
  const [tradeActivity, setTradeActivity] = useState<TradeActivity>({ trades_30d: 0, trades_7d: 0, trades_today: 0, avg_win_rate: 0, avg_r_multiple: 0 });
  const [tierDist, setTierDist] = useState<TierRow[]>([]);
  const [retention, setRetention] = useState<RetentionWeek[]>([]);
  const [topWorkspaces, setTopWorkspaces] = useState<TopWorkspace[]>([]);
  const [meta, setMeta] = useState<AnalyticsMeta>({ degraded: false, failedQueries: [], warnings: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const secret = sessionStorage.getItem("admin_secret");
    try {
      const res = await fetch("/api/admin/usage-analytics", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      if (res.ok) {
        setActiveUsers(data.activeUsers);
        setFunnel(data.signupFunnel);
        setDailyScans(data.dailyScans || []);
        setAdoption(data.featureAdoption);
        setTradeActivity(data.tradeActivity);
        setTierDist(data.tierDistribution || []);
        setRetention(data.retentionCohorts || []);
        setTopWorkspaces(data.topActiveWorkspaces || []);
        setMeta(data.meta || { degraded: false, failedQueries: [], warnings: [] });
      } else {
        setError(data.error || "Failed to fetch");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const card: React.CSSProperties = {
    background: "rgba(17, 24, 39, 0.8)",
    border: "1px solid rgba(16, 185, 129, 0.2)",
    borderRadius: "1rem",
    padding: "1.5rem",
  };

  const statNum: React.CSSProperties = {
    fontSize: "2rem",
    fontWeight: 700,
    color: "#10B981",
  };

  const statLabel: React.CSSProperties = {
    fontSize: "0.8rem",
    color: "#9CA3AF",
    marginTop: "0.25rem",
  };

  const tierColor = (tier: string) => {
    if (tier === "pro_trader") return "#F59E0B";
    if (tier === "pro") return "#10B981";
    return "#6B7280";
  };

  const tierBadge = (tier: string) => (
    <span style={{
      padding: "0.125rem 0.5rem",
      background: tier === "pro_trader" ? "rgba(245,158,11,0.2)" : tier === "pro" ? "rgba(16,185,129,0.15)" : "rgba(107,114,128,0.2)",
      color: tierColor(tier),
      borderRadius: "0.25rem",
      fontSize: "0.7rem",
      fontWeight: 600,
    }}>
      {tier}
    </span>
  );

  if (loading) return <div style={{ color: "#9CA3AF", padding: "2rem" }}>Loading usage analytics...</div>;

  // Compute funnel conversion rates
  const trialRate = funnel.signups_30d > 0 ? ((funnel.trials_30d / funnel.signups_30d) * 100).toFixed(1) : "0";
  const paidRate = funnel.trials_30d > 0 ? ((funnel.paid_30d / funnel.trials_30d) * 100).toFixed(1) : "0";
  const totalActive = Number(adoption.total_active_users) || 1;

  // Ensure numeric values for adoption (prevent NaN)
  const safeAdoption = {
    scanner_users: Number(adoption.scanner_users) || 0,
    ai_users: Number(adoption.ai_users) || 0,
    journal_users: Number(adoption.journal_users) || 0,
    portfolio_users: Number(adoption.portfolio_users) || 0,
    trade_outcome_users: Number(adoption.trade_outcome_users) || 0,
    total_active_users: totalActive,
  };

  // Scan volume stats
  const totalScans30d = dailyScans.reduce((s, d) => s + Number(d.scans), 0);
  const avgDailyScans = dailyScans.length > 0 ? Math.round(totalScans30d / dailyScans.length) : 0;

  // max bar for retention chart
  const maxRetUsers = Math.max(...retention.map(r => Number(r.active_users)), 1);

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1.5rem 1rem" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#E5E7EB", marginBottom: "1.5rem" }}>
        Usage Analytics
      </h1>

      {error && (
        <div style={{
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "0.5rem",
          padding: "1rem",
          color: "#F87171",
          marginBottom: "1rem",
        }}>{error}</div>
      )}

      {meta.degraded && (
        <div style={{
          background: "rgba(245, 158, 11, 0.12)",
          border: "1px solid rgba(245, 158, 11, 0.35)",
          borderRadius: "0.75rem",
          padding: "0.85rem 1rem",
          color: "#FCD34D",
          marginBottom: "1rem",
          fontSize: "0.82rem",
          fontWeight: 700,
        }}>
          Analytics degraded: {meta.failedQueries.length} query{meta.failedQueries.length === 1 ? "" : "ies"} failed. Empty charts may mean unavailable data, not zero activity.
          <div style={{ color: "#FDE68A", fontSize: "0.74rem", fontWeight: 500, marginTop: "0.35rem" }}>
            {meta.failedQueries.slice(0, 8).join(", ")}{meta.failedQueries.length > 8 ? " ..." : ""}
          </div>
        </div>
      )}

      {/* ─── Active Users ───────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        {[
          { label: "Online Now", value: activeUsers.online_now, color: "#34D399" },
          { label: "DAU (24h)", value: activeUsers.dau, color: "#10B981" },
          { label: "WAU (7d)", value: activeUsers.wau, color: "#059669" },
          { label: "MAU (30d)", value: activeUsers.mau, color: "#047857" },
        ].map((m) => (
          <div key={m.label} style={card}>
            <div style={{ ...statNum, color: m.color }}>{Number(m.value).toLocaleString()}</div>
            <div style={statLabel}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* ─── Conversion Funnel ──────────────────────────────── */}
      <div style={{ ...card, marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
          Conversion Funnel (Last 30 Days)
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          {/* Funnel stages */}
          {[
            { label: "Signups", value: funnel.signups_30d, color: "#6B7280" },
            { label: "Trials", value: funnel.trials_30d, color: "#3B82F6", rate: `${trialRate}%` },
            { label: "Paid", value: funnel.paid_30d, color: "#10B981", rate: `${paidRate}%` },
          ].map((stage, i) => (
            <div key={stage.label} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{
                background: `${stage.color}22`,
                border: `1px solid ${stage.color}66`,
                borderRadius: "0.75rem",
                padding: "1rem 1.5rem",
                textAlign: "center",
                minWidth: "120px",
              }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: stage.color }}>
                  {Number(stage.value)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>{stage.label}</div>
              </div>
              {i < 2 && (
                <div style={{ color: "#4B5563", fontSize: "1.25rem" }}>
                  →
                  {stage.rate && <div style={{ fontSize: "0.65rem", color: "#6B7280", textAlign: "center" }}>{stage.rate}</div>}
                </div>
              )}
            </div>
          ))}

          {/* Current paid breakdown */}
          <div style={{ marginLeft: "auto", display: "flex", gap: "1rem" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#10B981" }}>{Number(funnel.active_pro)}</div>
              <div style={{ fontSize: "0.7rem", color: "#9CA3AF" }}>Active Pro</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#F59E0B" }}>{Number(funnel.active_pro_trader)}</div>
              <div style={{ fontSize: "0.7rem", color: "#9CA3AF" }}>Active Pro Trader</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#EF4444" }}>{Number(funnel.churned_total)}</div>
              <div style={{ fontSize: "0.7rem", color: "#9CA3AF" }}>Churned</div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Feature Adoption + Trade Activity (side by side) ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>

        {/* Feature Adoption */}
        <div style={card}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
            Feature Adoption (30d)
          </h2>
          {[
            { label: "Scanner", users: safeAdoption.scanner_users, code: "SCN" },
            { label: "AI Analyst", users: safeAdoption.ai_users, code: "AI" },
            { label: "Journal", users: safeAdoption.journal_users, code: "JRN" },
            { label: "Portfolio", users: safeAdoption.portfolio_users, code: "PF" },
            { label: "Trade Outcomes", users: safeAdoption.trade_outcome_users, code: "OUT" },
          ].map((f) => {
            const pct = totalActive > 0 ? (f.users / totalActive) * 100 : 0;
            return (
              <div key={f.label} style={{ marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                  <span style={{ fontSize: "0.85rem", color: "#D1D5DB" }}>{f.code} · {f.label}</span>
                  <span style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>
                    {f.users} users ({pct.toFixed(0)}%)
                  </span>
                </div>
                <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "0.25rem", height: "8px", overflow: "hidden" }}>
                  <div style={{
                    width: `${Math.min(pct, 100)}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #10B981, #059669)",
                    borderRadius: "0.25rem",
                    transition: "width 0.5s",
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Trade Activity */}
        <div style={card}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
            Trade Activity
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#10B981" }}>{Number(tradeActivity.trades_today) || 0}</div>
              <div style={statLabel}>Trades Today</div>
            </div>
            <div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#10B981" }}>{Number(tradeActivity.trades_7d) || 0}</div>
              <div style={statLabel}>Trades (7d)</div>
            </div>
            <div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#10B981" }}>{Number(tradeActivity.trades_30d) || 0}</div>
              <div style={statLabel}>Trades (30d)</div>
            </div>
            <div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700, color: tradeActivity.avg_win_rate >= 50 ? "#10B981" : "#EF4444" }}>
                {tradeActivity.avg_win_rate ? `${tradeActivity.avg_win_rate}%` : "—"}
              </div>
              <div style={statLabel}>Avg Win Rate</div>
            </div>
          </div>
          <div style={{ marginTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "1rem" }}>
            <span style={{ fontSize: "0.85rem", color: "#9CA3AF" }}>Avg R-Multiple: </span>
            <span style={{ fontSize: "1.1rem", fontWeight: 600, color: Number(tradeActivity.avg_r_multiple) >= 0 ? "#10B981" : "#EF4444" }}>
              {tradeActivity.avg_r_multiple ? `${tradeActivity.avg_r_multiple}R` : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Scan Volume + Retention (side by side) ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>

        {/* Scan Volume */}
        <div style={card}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "0.5rem" }}>
            Scan Volume (30d)
          </h2>
          <div style={{ display: "flex", gap: "2rem", marginBottom: "1rem" }}>
            <div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#10B981" }}>{totalScans30d.toLocaleString()}</div>
              <div style={statLabel}>Total Scans</div>
            </div>
            <div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#10B981" }}>{avgDailyScans}</div>
              <div style={statLabel}>Avg/Day</div>
            </div>
          </div>
          {/* Mini bar chart for last 14 days */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "60px" }}>
            {dailyScans.slice(0, 14).reverse().map((d) => {
              const maxScans = Math.max(...dailyScans.slice(0, 14).map(x => Number(x.scans)), 1);
              const h = (Number(d.scans) / maxScans) * 100;
              return (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.scans} scans (${d.unique_scanners} users)`}
                  style={{
                    flex: 1,
                    height: `${h}%`,
                    minHeight: "2px",
                    background: "linear-gradient(180deg, #10B981, #059669)",
                    borderRadius: "2px 2px 0 0",
                  }}
                />
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.25rem" }}>
            <span style={{ fontSize: "0.6rem", color: "#6B7280" }}>14d ago</span>
            <span style={{ fontSize: "0.6rem", color: "#6B7280" }}>today</span>
          </div>
        </div>

        {/* Retention */}
        <div style={card}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "0.5rem" }}>
            Weekly Active Users (8 weeks)
          </h2>
          {retention.map((w) => {
            const pct = (Number(w.active_users) / maxRetUsers) * 100;
            return (
              <div key={w.week} style={{ marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.125rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>{w.week}</span>
                  <span style={{ fontSize: "0.75rem", color: "#D1D5DB", fontWeight: 600 }}>{Number(w.active_users)}</span>
                </div>
                <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "0.25rem", height: "6px", overflow: "hidden" }}>
                  <div style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #3B82F6, #6366F1)",
                    borderRadius: "0.25rem",
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Tier Distribution ──────────────────────────────── */}
      <div style={{ ...card, marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
          Tier Distribution
        </h2>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {tierDist.map((t) => (
            <div key={`${t.tier}-${t.status}`} style={{
              background: `${tierColor(t.tier)}15`,
              border: `1px solid ${tierColor(t.tier)}44`,
              borderRadius: "0.5rem",
              padding: "0.75rem 1rem",
              textAlign: "center",
              minWidth: "100px",
            }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: tierColor(t.tier) }}>{Number(t.count)}</div>
              <div style={{ fontSize: "0.7rem", color: "#9CA3AF" }}>{t.tier}</div>
              <div style={{ fontSize: "0.6rem", color: "#6B7280" }}>{t.status}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Top Active Workspaces ──────────────────────────── */}
      <div style={card}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
          Top Active Users (7d)
        </h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                {["Email", "Tier", "Scans", "Trades", "AI Q's", "Journal", "Score"].map((h) => (
                  <th key={h} style={{ padding: "0.5rem", textAlign: "left", color: "#9CA3AF", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topWorkspaces.map((w) => (
                <tr key={w.workspace_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "0.5rem", color: "#D1D5DB" }}>
                    {w.email || w.workspace_id.slice(0, 12) + "…"}
                  </td>
                  <td style={{ padding: "0.5rem" }}>{tierBadge(w.tier)}</td>
                  <td style={{ padding: "0.5rem", color: "#D1D5DB" }}>{w.scans_7d}</td>
                  <td style={{ padding: "0.5rem", color: "#D1D5DB" }}>{w.trades_7d}</td>
                  <td style={{ padding: "0.5rem", color: "#D1D5DB" }}>{w.ai_questions_7d}</td>
                  <td style={{ padding: "0.5rem", color: "#D1D5DB" }}>{w.journal_entries_7d}</td>
                  <td style={{ padding: "0.5rem", fontWeight: 600, color: "#10B981" }}>{w.activity_score}</td>
                </tr>
              ))}
              {topWorkspaces.length === 0 && (
                <tr><td colSpan={7} style={{ padding: "1rem", color: "#6B7280", textAlign: "center" }}>No activity data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
