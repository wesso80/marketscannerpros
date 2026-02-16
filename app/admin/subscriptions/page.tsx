"use client";

import { useState, useEffect } from "react";

interface Subscription {
  id: string;
  workspace_id: string;
  stripe_customer_id: string;
  tier: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  created_at: string;
  email: string | null;
}

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    const secret = sessionStorage.getItem("admin_secret");
    if (!secret) return;

    try {
      const res = await fetch("/api/admin/subscriptions", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSubscriptions(data.subscriptions || []);
      } else {
        setError(data.error || "Failed to fetch");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === "all" 
    ? subscriptions 
    : subscriptions.filter(s => s.tier === filter || s.status === filter);

  const tierBadge = (tier: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      pro_trader: { bg: "rgba(245, 158, 11, 0.2)", text: "#F59E0B" },
      pro: { bg: "var(--msp-accent-glow)", text: "var(--msp-accent)" },
      free: { bg: "rgba(107, 114, 128, 0.2)", text: "#9CA3AF" },
    };
    const color = colors[tier] || colors.free;
    return (
      <span style={{
        padding: "0.25rem 0.75rem",
        background: color.bg,
        color: color.text,
        borderRadius: "0.25rem",
        fontSize: "0.75rem",
        fontWeight: 600,
        textTransform: "uppercase",
      }}>
        {tier.replace("_", " ")}
      </span>
    );
  };

  const statusBadge = (status: string) => {
    const isActive = status === "active";
    return (
      <span style={{
        padding: "0.25rem 0.75rem",
        background: isActive ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
        color: isActive ? "#10B981" : "#EF4444",
        borderRadius: "0.25rem",
        fontSize: "0.75rem",
        fontWeight: 600,
        textTransform: "uppercase",
      }}>
        {status}
      </span>
    );
  };

  if (loading) {
    return <div style={{ color: "#9CA3AF" }}>Loading subscriptions...</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#E5E7EB", marginBottom: "1.5rem" }}>
        💳 Subscriptions
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

      {/* Filter buttons */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {["all", "pro_trader", "pro", "free", "active", "canceled"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "0.5rem 1rem",
              background: filter === f ? "rgba(16, 185, 129, 0.2)" : "rgba(0,0,0,0.3)",
              border: filter === f ? "1px solid rgba(16, 185, 129, 0.5)" : "1px solid rgba(255,255,255,0.1)",
              borderRadius: "0.5rem",
              color: filter === f ? "#10B981" : "#9CA3AF",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {f.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{
        background: "rgba(17, 24, 39, 0.8)",
        border: "1px solid rgba(16, 185, 129, 0.2)",
        borderRadius: "1rem",
        overflow: "auto",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
          <thead>
            <tr style={{ background: "rgba(0,0,0,0.3)" }}>
              <th style={{ padding: "1rem", textAlign: "left", color: "#9CA3AF", fontWeight: 500 }}>Email</th>
              <th style={{ padding: "1rem", textAlign: "left", color: "#9CA3AF", fontWeight: 500 }}>Tier</th>
              <th style={{ padding: "1rem", textAlign: "left", color: "#9CA3AF", fontWeight: 500 }}>Status</th>
              <th style={{ padding: "1rem", textAlign: "left", color: "#9CA3AF", fontWeight: 500 }}>Period End</th>
              <th style={{ padding: "1rem", textAlign: "left", color: "#9CA3AF", fontWeight: 500 }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "#6B7280" }}>
                  No subscriptions found
                </td>
              </tr>
            ) : (
              filtered.map((sub) => (
                <tr key={sub.id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "1rem", color: "#E5E7EB" }}>
                    {sub.email || (
                      <span style={{ color: "#6B7280", fontSize: "0.875rem" }}>
                        {sub.workspace_id.slice(0, 8)}...
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "1rem" }}>{tierBadge(sub.tier)}</td>
                  <td style={{ padding: "1rem" }}>{statusBadge(sub.status)}</td>
                  <td style={{ padding: "1rem", color: "#9CA3AF", fontSize: "0.875rem" }}>
                    {sub.current_period_end 
                      ? new Date(sub.current_period_end).toLocaleDateString()
                      : "—"}
                  </td>
                  <td style={{ padding: "1rem", color: "#9CA3AF", fontSize: "0.875rem" }}>
                    {new Date(sub.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p style={{ color: "#6B7280", fontSize: "0.875rem", marginTop: "1rem" }}>
        Showing {filtered.length} of {subscriptions.length} subscriptions
      </p>
    </div>
  );
}
