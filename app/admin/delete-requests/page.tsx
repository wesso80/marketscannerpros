"use client";

import { useState, useEffect } from "react";

interface DeleteRequest {
  id: string;
  workspace_id: string;
  email: string;
  reason: string;
  status: string;
  created_at: string;
  processed_at: string | null;
  admin_notes: string | null;
}

export default function AdminDeleteRequestsPage() {
  const [requests, setRequests] = useState<DeleteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    const secret = sessionStorage.getItem("admin_secret");
    if (!secret) return;

    try {
      const res = await fetch("/api/admin/delete-requests", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      if (res.ok) {
        setRequests(data.requests || []);
      } else {
        setError(data.error || "Failed to fetch");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string, notes?: string) => {
    const secret = sessionStorage.getItem("admin_secret");
    if (!secret) return;

    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/admin/delete-requests", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ id, status, notes }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`Request ${status}`);
        fetchRequests();
      } else {
        setError(data.error);
      }
    } catch {
      setError("Network error");
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      pending: { bg: "rgba(245, 158, 11, 0.2)", text: "#F59E0B" },
      processing: { bg: "rgba(59, 130, 246, 0.2)", text: "#3B82F6" },
      completed: { bg: "rgba(16, 185, 129, 0.2)", text: "#10B981" },
      rejected: { bg: "rgba(239, 68, 68, 0.2)", text: "#EF4444" },
    };
    const color = colors[status] || colors.pending;
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
        {status}
      </span>
    );
  };

  if (loading) {
    return <div style={{ color: "#9CA3AF" }}>Loading delete requests...</div>;
  }

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <div>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#E5E7EB", marginBottom: "1.5rem" }}>
        🗑️ Delete Requests {pendingCount > 0 && (
          <span style={{
            fontSize: "1rem",
            background: "rgba(239, 68, 68, 0.2)",
            color: "#EF4444",
            padding: "0.25rem 0.75rem",
            borderRadius: "1rem",
            marginLeft: "0.5rem",
          }}>
            {pendingCount} pending
          </span>
        )}
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

      {success && (
        <div style={{
          background: "rgba(16, 185, 129, 0.1)",
          border: "1px solid rgba(16, 185, 129, 0.3)",
          borderRadius: "0.5rem",
          padding: "1rem",
          color: "#10B981",
          marginBottom: "1rem",
        }}>
          {success}
        </div>
      )}

      {requests.length === 0 ? (
        <div style={{
          background: "rgba(17, 24, 39, 0.8)",
          border: "1px solid rgba(16, 185, 129, 0.2)",
          borderRadius: "1rem",
          padding: "3rem",
          textAlign: "center",
          color: "#6B7280",
        }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✅</div>
          <p>No delete requests. All caught up!</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {requests.map((req) => (
            <div key={req.id} style={{
              background: "rgba(17, 24, 39, 0.8)",
              border: req.status === "pending" 
                ? "1px solid rgba(245, 158, 11, 0.4)" 
                : "1px solid rgba(16, 185, 129, 0.2)",
              borderRadius: "1rem",
              padding: "1.5rem",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                    {statusBadge(req.status)}
                    <span style={{ color: "#E5E7EB", fontWeight: 600 }}>{req.email || "No email"}</span>
                  </div>
                  <div style={{ color: "#6B7280", fontSize: "0.875rem" }}>
                    Workspace: {req.workspace_id?.slice(0, 16) || "Unknown"}...
                  </div>
                </div>
                <div style={{ color: "#6B7280", fontSize: "0.875rem", textAlign: "right" }}>
                  <div>Requested: {new Date(req.created_at).toLocaleDateString()}</div>
                  {req.processed_at && (
                    <div>Processed: {new Date(req.processed_at).toLocaleDateString()}</div>
                  )}
                </div>
              </div>

              {req.reason && (
                <div style={{
                  background: "rgba(0,0,0,0.2)",
                  borderRadius: "0.5rem",
                  padding: "0.75rem",
                  marginBottom: "1rem",
                }}>
                  <div style={{ color: "#9CA3AF", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Reason:</div>
                  <div style={{ color: "#E5E7EB", fontSize: "0.875rem" }}>{req.reason}</div>
                </div>
              )}

              {req.admin_notes && (
                <div style={{
                  background: "rgba(59, 130, 246, 0.1)",
                  borderRadius: "0.5rem",
                  padding: "0.75rem",
                  marginBottom: "1rem",
                }}>
                  <div style={{ color: "#3B82F6", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Admin Notes:</div>
                  <div style={{ color: "#E5E7EB", fontSize: "0.875rem" }}>{req.admin_notes}</div>
                </div>
              )}

              {req.status === "pending" && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    onClick={() => updateStatus(req.id, "processing")}
                    style={{
                      padding: "0.5rem 1rem",
                      background: "rgba(59, 130, 246, 0.2)",
                      border: "1px solid rgba(59, 130, 246, 0.4)",
                      borderRadius: "0.5rem",
                      color: "#3B82F6",
                      cursor: "pointer",
                    }}
                  >
                    Start Processing
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Mark as completed? This confirms data has been deleted.")) {
                        updateStatus(req.id, "completed");
                      }
                    }}
                    style={{
                      padding: "0.5rem 1rem",
                      background: "rgba(16, 185, 129, 0.2)",
                      border: "1px solid rgba(16, 185, 129, 0.4)",
                      borderRadius: "0.5rem",
                      color: "#10B981",
                      cursor: "pointer",
                    }}
                  >
                    ✓ Mark Completed
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt("Reason for rejection:");
                      if (reason) updateStatus(req.id, "rejected", reason);
                    }}
                    style={{
                      padding: "0.5rem 1rem",
                      background: "rgba(239, 68, 68, 0.2)",
                      border: "1px solid rgba(239, 68, 68, 0.4)",
                      borderRadius: "0.5rem",
                      color: "#EF4444",
                      cursor: "pointer",
                    }}
                  >
                    Reject
                  </button>
                </div>
              )}

              {req.status === "processing" && (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={() => {
                      if (confirm("Mark as completed? This confirms data has been deleted.")) {
                        updateStatus(req.id, "completed");
                      }
                    }}
                    style={{
                      padding: "0.5rem 1rem",
                      background: "rgba(16, 185, 129, 0.2)",
                      border: "1px solid rgba(16, 185, 129, 0.4)",
                      borderRadius: "0.5rem",
                      color: "#10B981",
                      cursor: "pointer",
                    }}
                  >
                    ✓ Mark Completed
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{
        marginTop: "2rem",
        padding: "1.5rem",
        background: "rgba(59, 130, 246, 0.1)",
        border: "1px solid rgba(59, 130, 246, 0.2)",
        borderRadius: "0.75rem",
      }}>
        <h3 style={{ color: "#3B82F6", fontWeight: 600, marginBottom: "0.75rem" }}>📋 GDPR Deletion Checklist</h3>
        <ul style={{ color: "#9CA3AF", fontSize: "0.875rem", margin: 0, paddingLeft: "1.25rem" }}>
          <li>Delete from <code>workspaces</code> table</li>
          <li>Delete from <code>user_subscriptions</code> table</li>
          <li>Delete from <code>ai_usage</code> table</li>
          <li>Delete from <code>portfolio_positions</code> and <code>portfolio_closed</code> tables</li>
          <li>Delete from <code>journal_entries</code> table</li>
          <li>Delete from <code>user_trials</code> table</li>
          <li>Cancel Stripe subscription (if active)</li>
          <li>Send confirmation email to user</li>
        </ul>
      </div>
    </div>
  );
}
