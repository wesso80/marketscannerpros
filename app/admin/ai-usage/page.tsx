"use client";

import { useState, useEffect } from "react";

interface DailyStats {
  date: string;
  questions: number;
  unique_users: number;
  total_tokens: number;
}

interface TierBreakdown {
  tier: string;
  questions: number;
  unique_users: number;
  avg_tokens: number;
}

interface TopUser {
  workspace_id: string;
  tier: string;
  total_questions: number;
  last_active: string;
}

interface RecentQuestion {
  id: number;
  workspace_id: string;
  tier: string;
  question_preview: string;
  response_length: number;
  created_at: string;
}

export default function AdminAIUsagePage() {
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [tierBreakdown, setTierBreakdown] = useState<TierBreakdown[]>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [recentQuestions, setRecentQuestions] = useState<RecentQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "users" | "questions">("overview");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const secret = sessionStorage.getItem("admin_secret");
    if (!secret) return;

    try {
      const res = await fetch("/api/admin/ai-usage", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      if (res.ok) {
        setDailyStats(data.dailyStats || []);
        setTierBreakdown(data.tierBreakdown || []);
        setTopUsers(data.topUsers || []);
        setRecentQuestions(data.recentQuestions || []);
      } else {
        setError(data.error || "Failed to fetch");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: "rgba(17, 24, 39, 0.8)",
    border: "1px solid rgba(16, 185, 129, 0.2)",
    borderRadius: "1rem",
    padding: "1.5rem",
  };

  const tierBadge = (tier: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      pro_trader: { bg: "rgba(245, 158, 11, 0.2)", text: "#F59E0B" },
      pro: { bg: "rgba(59, 130, 246, 0.2)", text: "#3B82F6" },
      free: { bg: "rgba(107, 114, 128, 0.2)", text: "#9CA3AF" },
    };
    const color = colors[tier] || colors.free;
    return (
      <span style={{
        padding: "0.125rem 0.5rem",
        background: color.bg,
        color: color.text,
        borderRadius: "0.25rem",
        fontSize: "0.7rem",
        fontWeight: 600,
      }}>
        {tier}
      </span>
    );
  };

  if (loading) {
    return <div style={{ color: "#9CA3AF" }}>Loading AI usage data...</div>;
  }

  // Calculate totals
  const totalQuestionsToday = tierBreakdown.reduce((sum, t) => sum + Number(t.questions), 0);
  const totalUsersToday = tierBreakdown.reduce((sum, t) => sum + Number(t.unique_users), 0);
  const totalQuestions30d = dailyStats.reduce((sum, d) => sum + Number(d.questions), 0);

  return (
    <div>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#E5E7EB", marginBottom: "1.5rem" }}>
        🤖 AI Usage Analytics
      </h1>

      {error && (
        <div style={{
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "0.5rem",
          padding: "1rem",
          color: "#F87171",
          marginBottom: "1rem",
        }}>
          {error}
        </div>
      )}

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#3B82F6" }}>{totalQuestionsToday}</div>
          <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Questions Today</div>
        </div>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#10B981" }}>{totalUsersToday}</div>
          <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Active Users Today</div>
        </div>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#F59E0B" }}>{totalQuestions30d}</div>
          <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Questions (30 days)</div>
        </div>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#8B5CF6" }}>{topUsers.length}</div>
          <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Total AI Users</div>
        </div>
      </div>

      {/* Tab navigation */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {[
          { id: "overview", label: "📊 Daily Stats" },
          { id: "users", label: "👥 Top Users" },
          { id: "questions", label: "💬 Recent Questions" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            style={{
              padding: "0.75rem 1.5rem",
              background: tab === t.id ? "rgba(16, 185, 129, 0.2)" : "rgba(0,0,0,0.3)",
              border: tab === t.id ? "1px solid rgba(16, 185, 129, 0.5)" : "1px solid rgba(255,255,255,0.1)",
              borderRadius: "0.5rem",
              color: tab === t.id ? "#10B981" : "#9CA3AF",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
            Daily Usage (Last 30 Days)
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(0,0,0,0.3)" }}>
                  <th style={{ padding: "0.75rem", textAlign: "left", color: "#9CA3AF" }}>Date</th>
                  <th style={{ padding: "0.75rem", textAlign: "right", color: "#9CA3AF" }}>Questions</th>
                  <th style={{ padding: "0.75rem", textAlign: "right", color: "#9CA3AF" }}>Unique Users</th>
                  <th style={{ padding: "0.75rem", textAlign: "right", color: "#9CA3AF" }}>Est. Tokens</th>
                </tr>
              </thead>
              <tbody>
                {dailyStats.map((day) => (
                  <tr key={day.date} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "0.75rem", color: "#E5E7EB" }}>
                      {new Date(day.date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "right", color: "#3B82F6", fontWeight: 600 }}>
                      {day.questions}
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "right", color: "#10B981" }}>
                      {day.unique_users}
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "right", color: "#9CA3AF" }}>
                      {day.total_tokens?.toLocaleString() || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "users" && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
            Top AI Users (All Time)
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(0,0,0,0.3)" }}>
                  <th style={{ padding: "0.75rem", textAlign: "left", color: "#9CA3AF" }}>#</th>
                  <th style={{ padding: "0.75rem", textAlign: "left", color: "#9CA3AF" }}>Workspace</th>
                  <th style={{ padding: "0.75rem", textAlign: "left", color: "#9CA3AF" }}>Tier</th>
                  <th style={{ padding: "0.75rem", textAlign: "right", color: "#9CA3AF" }}>Questions</th>
                  <th style={{ padding: "0.75rem", textAlign: "right", color: "#9CA3AF" }}>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.map((user, i) => (
                  <tr key={user.workspace_id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "0.75rem", color: "#6B7280" }}>{i + 1}</td>
                    <td style={{ padding: "0.75rem", color: "#E5E7EB", fontSize: "0.875rem" }}>
                      {user.workspace_id.slice(0, 16)}...
                    </td>
                    <td style={{ padding: "0.75rem" }}>{tierBadge(user.tier)}</td>
                    <td style={{ padding: "0.75rem", textAlign: "right", color: "#3B82F6", fontWeight: 600 }}>
                      {user.total_questions}
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "right", color: "#9CA3AF", fontSize: "0.875rem" }}>
                      {new Date(user.last_active).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "questions" && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#E5E7EB", marginBottom: "1rem" }}>
            Recent Questions
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {recentQuestions.map((q) => (
              <div key={q.id} style={{
                background: "rgba(0,0,0,0.2)",
                borderRadius: "0.5rem",
                padding: "1rem",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {tierBadge(q.tier)}
                    <span style={{ color: "#6B7280", fontSize: "0.75rem" }}>
                      {q.workspace_id.slice(0, 12)}...
                    </span>
                  </div>
                  <span style={{ color: "#6B7280", fontSize: "0.75rem" }}>
                    {new Date(q.created_at).toLocaleString()}
                  </span>
                </div>
                <p style={{ color: "#E5E7EB", fontSize: "0.875rem", margin: 0 }}>
                  "{q.question_preview}{q.question_preview.length >= 100 ? "..." : ""}"
                </p>
                <div style={{ color: "#6B7280", fontSize: "0.75rem", marginTop: "0.5rem" }}>
                  Response: {q.response_length?.toLocaleString() || "?"} chars
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
