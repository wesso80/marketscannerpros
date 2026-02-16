"use client";

import { useState, useEffect } from "react";

interface Trial {
  id: string;
  email: string;
  tier: string;
  starts_at: string;
  expires_at: string;
  granted_by: string;
  notes: string;
  is_active: boolean;
}

export default function AdminTrialsPage() {
  const [trials, setTrials] = useState<Trial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form state for granting new trial
  const [newEmail, setNewEmail] = useState("");
  const [newTier, setNewTier] = useState("pro_trader");
  const [newDays, setNewDays] = useState("30");
  const [newNotes, setNewNotes] = useState("");

  useEffect(() => {
    fetchTrials();
  }, []);

  const getSecret = () => sessionStorage.getItem("admin_secret") || "";

  const fetchTrials = async () => {
    const secret = getSecret();
    if (!secret) return;
    
    setLoading(true);
    try {
      const res = await fetch("/api/admin/trials", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      if (res.ok) {
        setTrials(data.trials || []);
      } else {
        setError(data.error || "Failed to fetch");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const grantTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/trials", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getSecret()}`,
        },
        body: JSON.stringify({
          email: newEmail,
          tier: newTier,
          days: parseInt(newDays),
          notes: newNotes,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message);
        setNewEmail("");
        setNewNotes("");
        fetchTrials();
      } else {
        setError(data.error);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const revokeTrial = async (email: string) => {
    if (!confirm(`Revoke trial for ${email}?`)) return;
    
    setLoading(true);
    try {
      const res = await fetch("/api/admin/trials", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getSecret()}`,
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess("Trial revoked");
        fetchTrials();
      } else {
        setError(data.error);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const daysRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return <div style={{ color: "#9CA3AF" }}>Loading trials...</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ color: "#E5E7EB", fontSize: "1.75rem", fontWeight: 700, marginBottom: "4px" }}>
          🎁 Trial Management
        </h1>
        <p style={{ color: "#9CA3AF", fontSize: "14px" }}>
          Grant and manage user trial access
        </p>
      </div>

        {/* Grant New Trial Form */}
        <div style={{
          background: "rgba(17, 24, 39, 0.8)",
          border: "1px solid rgba(16, 185, 129, 0.2)",
          borderRadius: "16px",
          padding: "24px",
          marginBottom: "24px",
        }}>
          <h2 style={{ color: "#f1f5f9", fontSize: "16px", marginBottom: "20px" }}>
            ➕ Grant New Trial
          </h2>

          {error && (
            <div style={{
              padding: "12px",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "8px",
              color: "#fca5a5",
              marginBottom: "16px",
            }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              padding: "12px",
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.3)",
              borderRadius: "8px",
              color: "#6ee7b7",
              marginBottom: "16px",
            }}>
              ✅ {success}
            </div>
          )}

          <form onSubmit={grantTrial}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "13px", marginBottom: "6px" }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  placeholder="user@example.com"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    color: "#f1f5f9",
                    fontSize: "14px",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "13px", marginBottom: "6px" }}>
                  Tier
                </label>
                <select
                  value={newTier}
                  onChange={(e) => setNewTier(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    color: "#f1f5f9",
                    fontSize: "14px",
                  }}
                >
                  <option value="pro_trader">Pro Trader (Full Access)</option>
                  <option value="pro">Pro</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "13px", marginBottom: "6px" }}>
                  Duration (days)
                </label>
                <input
                  type="number"
                  value={newDays}
                  onChange={(e) => setNewDays(e.target.value)}
                  min="1"
                  max="365"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    color: "#f1f5f9",
                    fontSize: "14px",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "13px", marginBottom: "6px" }}>
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="e.g., Partner referral"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    color: "#f1f5f9",
                    fontSize: "14px",
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "12px 24px",
                background: "var(--msp-accent)",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                fontWeight: "600",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Processing..." : "🎟️ Grant Trial Access"}
            </button>
          </form>
        </div>

        {/* Trials List */}
        <div style={{
          background: "rgba(15,23,42,0.95)",
          border: "1px solid #334155",
          borderRadius: "16px",
          overflow: "hidden",
        }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #334155" }}>
            <h2 style={{ color: "#f1f5f9", fontSize: "16px", margin: 0 }}>
              📋 All Trials ({trials.length})
            </h2>
          </div>

          {trials.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
              No trials yet. Grant one above!
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#1e293b" }}>
                    <th style={{ padding: "12px 20px", textAlign: "left", color: "#94a3b8", fontSize: "12px", fontWeight: "500" }}>EMAIL</th>
                    <th style={{ padding: "12px 20px", textAlign: "left", color: "#94a3b8", fontSize: "12px", fontWeight: "500" }}>TIER</th>
                    <th style={{ padding: "12px 20px", textAlign: "left", color: "#94a3b8", fontSize: "12px", fontWeight: "500" }}>STATUS</th>
                    <th style={{ padding: "12px 20px", textAlign: "left", color: "#94a3b8", fontSize: "12px", fontWeight: "500" }}>EXPIRES</th>
                    <th style={{ padding: "12px 20px", textAlign: "left", color: "#94a3b8", fontSize: "12px", fontWeight: "500" }}>NOTES</th>
                    <th style={{ padding: "12px 20px", textAlign: "right", color: "#94a3b8", fontSize: "12px", fontWeight: "500" }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {trials.map((trial) => (
                    <tr key={trial.id} style={{ borderBottom: "1px solid #334155" }}>
                      <td style={{ padding: "16px 20px", color: "#f1f5f9", fontSize: "14px" }}>
                        {trial.email}
                      </td>
                      <td style={{ padding: "16px 20px" }}>
                        <span style={{
                          padding: "4px 10px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: "600",
                          background: trial.tier === "pro_trader" ? "var(--msp-accent-glow)" : "var(--msp-accent-glow)",
                          color: trial.tier === "pro_trader" ? "#a78bfa" : "#60a5fa",
                          border: `1px solid ${trial.tier === "pro_trader" ? "var(--msp-border-strong)" : "var(--msp-border-strong)"}`,
                        }}>
                          {trial.tier === "pro_trader" ? "PRO TRADER" : "PRO"}
                        </span>
                      </td>
                      <td style={{ padding: "16px 20px" }}>
                        {trial.is_active ? (
                          <span style={{
                            padding: "4px 10px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: "600",
                            background: "rgba(16,185,129,0.2)",
                            color: "#10b981",
                          }}>
                            ✓ Active ({daysRemaining(trial.expires_at)}d left)
                          </span>
                        ) : (
                          <span style={{
                            padding: "4px 10px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: "600",
                            background: "rgba(107,114,128,0.2)",
                            color: "#9ca3af",
                          }}>
                            Expired
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "16px 20px", color: "#94a3b8", fontSize: "14px" }}>
                        {formatDate(trial.expires_at)}
                      </td>
                      <td style={{ padding: "16px 20px", color: "#64748b", fontSize: "13px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {trial.notes || "-"}
                      </td>
                      <td style={{ padding: "16px 20px", textAlign: "right" }}>
                        {trial.is_active && (
                          <button
                            onClick={() => revokeTrial(trial.email)}
                            style={{
                              padding: "6px 12px",
                              background: "rgba(239,68,68,0.1)",
                              border: "1px solid rgba(239,68,68,0.3)",
                              borderRadius: "4px",
                              color: "#ef4444",
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
    </div>
  );
}