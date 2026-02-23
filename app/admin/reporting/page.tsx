"use client";

import { useState, useEffect, useCallback } from "react";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */
interface Report {
  id: string;
  report_month: string;
  professional_subscribers: number;
  non_professional_subscribers: number;
  total_subscribers: number;
  realtime_users: number;
  delayed_users: number;
  free_tier_count: number;
  pro_tier_count: number;
  pro_trader_count: number;
  trial_count: number;
  report_type: string;
  status: string;
  submitted_at: string | null;
  submitted_by: string | null;
  submission_ref: string | null;
  revision_of: string | null;
  due_date: string;
  revision_deadline: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface Snapshot {
  total: number;
  byTier: { tier: string; count: number }[];
  byStatus: { status: string; count: number }[];
  activeTrials: number;
}

interface MonthlyRow {
  month: string;
  new_subscribers: number;
  free_count: number;
  pro_count: number;
  pro_trader_count: number;
  trial_count: number;
}

/* ================================================================== */
/*  Styles                                                             */
/* ================================================================== */
const cardStyle: React.CSSProperties = {
  background: "rgba(17, 24, 39, 0.8)",
  border: "1px solid rgba(16, 185, 129, 0.2)",
  borderRadius: "1rem",
  padding: "1.5rem",
  marginBottom: "1.5rem",
};

const statBox: React.CSSProperties = {
  background: "rgba(0,0,0,0.3)",
  borderRadius: "0.75rem",
  padding: "1rem 1.25rem",
  textAlign: "center" as const,
};

const btnPrimary: React.CSSProperties = {
  padding: "0.5rem 1.25rem",
  background: "#10B981",
  border: "none",
  borderRadius: "0.5rem",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "0.85rem",
};

const btnSecondary: React.CSSProperties = {
  ...btnPrimary,
  background: "rgba(16, 185, 129, 0.15)",
  border: "1px solid rgba(16, 185, 129, 0.4)",
  color: "#10B981",
};

const btnDanger: React.CSSProperties = {
  ...btnPrimary,
  background: "rgba(239, 68, 68, 0.15)",
  border: "1px solid rgba(239, 68, 68, 0.4)",
  color: "#F87171",
};

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  background: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "0.5rem",
  color: "#E5E7EB",
  fontSize: "0.85rem",
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#9CA3AF",
  marginBottom: "0.25rem",
  display: "block",
};

const badgeColors: Record<string, { bg: string; fg: string; border: string }> = {
  draft:     { bg: "rgba(156,163,175,0.15)", fg: "#9CA3AF", border: "rgba(156,163,175,0.4)" },
  submitted: { bg: "rgba(16,185,129,0.15)",  fg: "#10B981", border: "rgba(16,185,129,0.4)" },
  revised:   { bg: "rgba(59,130,246,0.15)",  fg: "#60A5FA", border: "rgba(59,130,246,0.4)" },
  late:      { bg: "rgba(239,68,68,0.15)",   fg: "#F87171", border: "rgba(239,68,68,0.4)" },
};

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */
export default function AdminReportingPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [monthlyHistory, setMonthlyHistory] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");

  // Generate form state
  const [genMonth, setGenMonth] = useState(() => {
    // Default to previous month
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7); // YYYY-MM
  });

  // Submit form state
  const [submitModal, setSubmitModal] = useState<Report | null>(null);
  const [submitBy, setSubmitBy] = useState("");
  const [submitRef, setSubmitRef] = useState("");
  const [submitNotes, setSubmitNotes] = useState("");

  // Revise form state
  const [reviseModal, setReviseModal] = useState<Report | null>(null);
  const [revisePro, setRevisePro] = useState(0);
  const [reviseNonPro, setReviseNonPro] = useState(0);
  const [reviseNotes, setReviseNotes] = useState("");

  const fetchData = useCallback(async () => {
    const secret = sessionStorage.getItem("admin_secret");
    if (!secret) return;
    try {
      const res = await fetch("/api/admin/reporting", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      if (res.ok) {
        setReports(data.reports || []);
        setSnapshot(data.snapshot || null);
        setMonthlyHistory(data.monthlyHistory || []);
      } else {
        setError(data.error || "Failed to fetch");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ---------- Actions ------------------------------------------- */

  const doAction = async (body: Record<string, unknown>) => {
    const secret = sessionStorage.getItem("admin_secret");
    if (!secret) return;
    setActionMsg("");
    try {
      const res = await fetch("/api/admin/reporting", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(data.generated ? "Report generated ✓" : data.revised ? "Revision created ✓" : "Report updated ✓");
        fetchData();
      } else {
        setActionMsg(`Error: ${data.error}`);
      }
    } catch {
      setActionMsg("Network error");
    }
  };

  const handleGenerate = () => {
    const reportMonth = genMonth + "-01"; // YYYY-MM-01
    doAction({ action: "generate", reportMonth });
  };

  const handleSubmit = () => {
    if (!submitModal) return;
    doAction({
      action: "submit",
      reportId: submitModal.id,
      submittedBy: submitBy,
      submissionRef: submitRef,
      notes: submitNotes || undefined,
    });
    setSubmitModal(null);
  };

  const handleRevise = () => {
    if (!reviseModal) return;
    doAction({
      action: "revise",
      reportId: reviseModal.id,
      professionalSubscribers: revisePro,
      nonProfessionalSubscribers: reviseNonPro,
      notes: reviseNotes || undefined,
    });
    setReviseModal(null);
  };

  /* ---------- Helpers -------------------------------------------- */

  const fmtMonth = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone: "UTC" });
    } catch { return d; }
  };

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
    } catch { return d; }
  };

  const isOverdue = (r: Report) => {
    if (r.status === "submitted" || r.status === "revised") return false;
    return new Date() > new Date(r.due_date);
  };

  const daysUntilDue = (r: Report) => {
    const diff = (new Date(r.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return Math.ceil(diff);
  };

  /* ---------- Render --------------------------------------------- */

  if (loading) {
    return (
      <div style={{ color: "#9CA3AF", textAlign: "center", paddingTop: "4rem" }}>
        Loading reporting data…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: "#F87171", textAlign: "center", paddingTop: "4rem" }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#E5E7EB", margin: 0 }}>
            📋 Nasdaq Usage Reporting
          </h1>
          <p style={{ color: "#9CA3AF", fontSize: "0.85rem", margin: "0.25rem 0 0" }}>
            Nasdaq Reporting Policy v2.23 — Monthly subscriber usage reports
          </p>
        </div>
        <a
          href="https://data.nasdaq.com/docs/reporting"
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...btnSecondary, textDecoration: "none", fontSize: "0.8rem" }}
        >
          📖 Nasdaq Data-Client Portal
        </a>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div style={{
          padding: "0.75rem 1rem",
          borderRadius: "0.5rem",
          marginBottom: "1rem",
          background: actionMsg.startsWith("Error") ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.15)",
          color: actionMsg.startsWith("Error") ? "#F87171" : "#10B981",
          border: `1px solid ${actionMsg.startsWith("Error") ? "rgba(239,68,68,0.4)" : "rgba(16,185,129,0.4)"}`,
          fontSize: "0.85rem",
        }}>
          {actionMsg}
        </div>
      )}

      {/* ========== LIVE SNAPSHOT ========== */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#10B981", marginTop: 0, marginBottom: "1rem" }}>
          📡 Live Subscriber Snapshot
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem" }}>
          <div style={statBox}>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#E5E7EB" }}>{snapshot?.total ?? 0}</div>
            <div style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>Total Active</div>
          </div>
          {snapshot?.byTier.map(t => (
            <div key={t.tier} style={statBox}>
              <div style={{ fontSize: "1.75rem", fontWeight: 700, color: t.tier === "pro_trader" ? "#F59E0B" : t.tier === "pro" ? "#10B981" : "#9CA3AF" }}>
                {t.count}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>{t.tier.replace("_", " ").toUpperCase()}</div>
            </div>
          ))}
          <div style={statBox}>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#60A5FA" }}>{snapshot?.activeTrials ?? 0}</div>
            <div style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>Active Trials</div>
          </div>
        </div>

        <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", background: "rgba(0,0,0,0.2)", borderRadius: "0.5rem" }}>
          <div style={{ fontSize: "0.8rem", color: "#9CA3AF", marginBottom: "0.5rem" }}>Nasdaq Classification</div>
          <div style={{ display: "flex", gap: "2rem" }}>
            <div>
              <span style={{ color: "#10B981", fontWeight: 600 }}>
                Professional: {(snapshot?.byTier.find(t => t.tier === "pro")?.count ?? 0) + (snapshot?.byTier.find(t => t.tier === "pro_trader")?.count ?? 0)}
              </span>
              <span style={{ color: "#6B7280", fontSize: "0.75rem", marginLeft: "0.5rem" }}>(Pro + Pro Trader = Real-time)</span>
            </div>
            <div>
              <span style={{ color: "#9CA3AF", fontWeight: 600 }}>
                Non-Professional: {(snapshot?.byTier.find(t => t.tier === "free")?.count ?? 0) + (snapshot?.activeTrials ?? 0)}
              </span>
              <span style={{ color: "#6B7280", fontSize: "0.75rem", marginLeft: "0.5rem" }}>(Free + Trial = Delayed)</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========== GENERATE REPORT ========== */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#10B981", marginTop: 0, marginBottom: "1rem" }}>
          ⚡ Generate Monthly Report
        </h2>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ flex: "0 0 200px" }}>
            <label style={labelStyle}>Report Month</label>
            <input
              type="month"
              value={genMonth}
              onChange={(e) => setGenMonth(e.target.value)}
              style={inputStyle}
            />
          </div>
          <button onClick={handleGenerate} style={btnPrimary}>
            Generate Report
          </button>
        </div>
        <p style={{ color: "#6B7280", fontSize: "0.75rem", marginTop: "0.75rem", marginBottom: 0 }}>
          Auto-computes subscriber counts from the database for the selected month.
          Due date is the 15th of the following month. Revision window is 2 months from due date.
        </p>
      </div>

      {/* ========== DEADLINE ALERTS ========== */}
      {reports.filter(r => r.status === "draft" && daysUntilDue(r) <= 10).length > 0 && (
        <div style={{
          ...cardStyle,
          borderColor: "rgba(245, 158, 11, 0.5)",
          background: "rgba(245, 158, 11, 0.08)",
        }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#F59E0B", marginTop: 0, marginBottom: "0.75rem" }}>
            ⚠️ Upcoming Deadlines
          </h2>
          {reports.filter(r => r.status === "draft" && daysUntilDue(r) <= 10).map(r => {
            const days = daysUntilDue(r);
            const overdue = days < 0;
            return (
              <div key={r.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "0.5rem 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}>
                <span style={{ color: "#E5E7EB", fontSize: "0.9rem" }}>
                  {fmtMonth(r.report_month)} — {r.report_type.replace(/_/g, " ")}
                </span>
                <span style={{ color: overdue ? "#F87171" : "#F59E0B", fontSize: "0.85rem", fontWeight: 600 }}>
                  {overdue ? `${Math.abs(days)} days overdue` : `${days} days remaining`}
                </span>
              </div>
            );
          })}
          <p style={{ color: "#D97706", fontSize: "0.75rem", marginTop: "0.75rem", marginBottom: 0 }}>
            Nasdaq requires submission by the 15th of the month following the reporting period.
            Late reports may result in billing based on prior month&apos;s usage.
          </p>
        </div>
      )}

      {/* ========== REPORTS TABLE ========== */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#10B981", marginTop: 0, marginBottom: "1rem" }}>
          📑 Reports History
        </h2>

        {reports.length === 0 ? (
          <p style={{ color: "#6B7280", textAlign: "center", padding: "2rem 0" }}>
            No reports yet. Generate your first monthly report above.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  {["Month", "Type", "Pro", "Non-Pro", "Total", "Status", "Due", "Actions"].map(h => (
                    <th key={h} style={{ padding: "0.5rem 0.75rem", color: "#9CA3AF", fontWeight: 600, textAlign: "left", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map(r => {
                  const bc = badgeColors[r.status] || badgeColors.draft;
                  const overdue = isOverdue(r);
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "0.75rem", color: "#E5E7EB", whiteSpace: "nowrap" }}>
                        {fmtMonth(r.report_month)}
                        {r.revision_of && <span style={{ color: "#60A5FA", fontSize: "0.7rem", marginLeft: "0.5rem" }}>REVISION</span>}
                      </td>
                      <td style={{ padding: "0.75rem", color: "#9CA3AF" }}>{r.report_type.replace(/_/g, " ")}</td>
                      <td style={{ padding: "0.75rem", color: "#10B981", fontWeight: 600 }}>{r.professional_subscribers}</td>
                      <td style={{ padding: "0.75rem", color: "#9CA3AF" }}>{r.non_professional_subscribers}</td>
                      <td style={{ padding: "0.75rem", color: "#E5E7EB", fontWeight: 600 }}>{r.total_subscribers}</td>
                      <td style={{ padding: "0.75rem" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "0.2rem 0.6rem",
                          borderRadius: "9999px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          background: overdue ? badgeColors.late.bg : bc.bg,
                          color: overdue ? badgeColors.late.fg : bc.fg,
                          border: `1px solid ${overdue ? badgeColors.late.border : bc.border}`,
                        }}>
                          {overdue && r.status === "draft" ? "OVERDUE" : r.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem", color: overdue ? "#F87171" : "#9CA3AF", whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                        {fmtDate(r.due_date)}
                      </td>
                      <td style={{ padding: "0.75rem", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          {r.status === "draft" && (
                            <button
                              onClick={() => {
                                setSubmitModal(r);
                                setSubmitBy("");
                                setSubmitRef("");
                                setSubmitNotes("");
                              }}
                              style={{ ...btnPrimary, padding: "0.3rem 0.75rem", fontSize: "0.75rem" }}
                            >
                              Mark Submitted
                            </button>
                          )}
                          {r.status === "submitted" && new Date() < new Date(r.revision_deadline) && (
                            <button
                              onClick={() => {
                                setReviseModal(r);
                                setRevisePro(r.professional_subscribers);
                                setReviseNonPro(r.non_professional_subscribers);
                                setReviseNotes("");
                              }}
                              style={{ ...btnSecondary, padding: "0.3rem 0.75rem", fontSize: "0.75rem" }}
                            >
                              Revise
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========== TIER BREAKDOWN DETAIL ========== */}
      {reports.length > 0 && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#10B981", marginTop: 0, marginBottom: "1rem" }}>
            📊 Tier Breakdown (Latest Report)
          </h2>
          {(() => {
            const latest = reports[0];
            if (!latest) return null;
            const items = [
              { label: "Free Tier", value: latest.free_tier_count, color: "#9CA3AF" },
              { label: "Pro", value: latest.pro_tier_count, color: "#10B981" },
              { label: "Pro Trader", value: latest.pro_trader_count, color: "#F59E0B" },
              { label: "Trial", value: latest.trial_count, color: "#60A5FA" },
              { label: "Real-time", value: latest.realtime_users, color: "#34D399" },
              { label: "Delayed", value: latest.delayed_users, color: "#6B7280" },
            ];
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem" }}>
                {items.map(it => (
                  <div key={it.label} style={statBox}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: it.color }}>{it.value}</div>
                    <div style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>{it.label}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ========== MONTHLY HISTORY ========== */}
      {monthlyHistory.length > 0 && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#10B981", marginTop: 0, marginBottom: "1rem" }}>
            📈 Monthly Subscriber History (Last 12 Months)
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  {["Month", "New Subs", "Free", "Pro", "Pro Trader", "Trial"].map(h => (
                    <th key={h} style={{ padding: "0.5rem 0.75rem", color: "#9CA3AF", fontWeight: 600, textAlign: "left" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthlyHistory.map(m => (
                  <tr key={m.month} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "0.5rem 0.75rem", color: "#E5E7EB" }}>{fmtMonth(m.month)}</td>
                    <td style={{ padding: "0.5rem 0.75rem", color: "#E5E7EB", fontWeight: 600 }}>{m.new_subscribers}</td>
                    <td style={{ padding: "0.5rem 0.75rem", color: "#9CA3AF" }}>{m.free_count}</td>
                    <td style={{ padding: "0.5rem 0.75rem", color: "#10B981" }}>{m.pro_count}</td>
                    <td style={{ padding: "0.5rem 0.75rem", color: "#F59E0B" }}>{m.pro_trader_count}</td>
                    <td style={{ padding: "0.5rem 0.75rem", color: "#60A5FA" }}>{m.trial_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== POLICY REFERENCE ========== */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#10B981", marginTop: 0, marginBottom: "1rem" }}>
          📖 Nasdaq Reporting Policy Reference
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", fontSize: "0.85rem" }}>
          <div>
            <h3 style={{ color: "#E5E7EB", fontSize: "0.95rem", marginTop: 0 }}>Reporting Requirements</h3>
            <ul style={{ color: "#9CA3AF", paddingLeft: "1.25rem", margin: 0, lineHeight: 1.8 }}>
              <li><strong style={{ color: "#E5E7EB" }}>Internal Distributors:</strong> Monthly Summary — total subscribers with potential access</li>
              <li><strong style={{ color: "#E5E7EB" }}>External Distributors:</strong> Monthly Detailed — total subscribers unless tracking actual per-user usage</li>
              <li><strong style={{ color: "#E5E7EB" }}>Hosted/Managed:</strong> Detailed Usage for all Data Solutions, real-time and delayed</li>
            </ul>
          </div>
          <div>
            <h3 style={{ color: "#E5E7EB", fontSize: "0.95rem", marginTop: 0 }}>Deadlines</h3>
            <ul style={{ color: "#9CA3AF", paddingLeft: "1.25rem", margin: 0, lineHeight: 1.8 }}>
              <li><strong style={{ color: "#F59E0B" }}>Due:</strong> 15th of the month following the reporting period</li>
              <li><strong style={{ color: "#60A5FA" }}>Revisions:</strong> Within 2 months of original due date</li>
              <li><strong style={{ color: "#F87171" }}>Late penalty:</strong> Nasdaq bills based on prior month&apos;s reported usage</li>
              <li><strong style={{ color: "#9CA3AF" }}>Holiday extension:</strong> Next business day if 15th is a weekend/holiday</li>
            </ul>
          </div>
        </div>
        <div style={{
          marginTop: "1rem",
          padding: "0.75rem 1rem",
          background: "rgba(59,130,246,0.08)",
          borderRadius: "0.5rem",
          border: "1px solid rgba(59,130,246,0.2)",
          fontSize: "0.8rem",
          color: "#93C5FD",
        }}>
          ℹ️ Report at least one Subscriber for each Nasdaq data product received (regardless of technical or administrative use waivers).
          Submit via the <a href="https://data.nasdaq.com" target="_blank" rel="noopener noreferrer" style={{ color: "#60A5FA" }}>Nasdaq Data-Client Portal</a>.
          Contact <a href="mailto:DataOps@Nasdaq.com" style={{ color: "#60A5FA" }}>DataOps@Nasdaq.com</a> with questions.
        </div>
      </div>

      {/* ========== SQL MIGRATION ========== */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#10B981", marginTop: 0, marginBottom: "0.75rem" }}>
          🗄️ Database Migration (041)
        </h2>
        <p style={{ color: "#9CA3AF", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          Run this SQL in your Neon console if the <code style={{ color: "#10B981" }}>nasdaq_usage_reports</code> table doesn&apos;t exist yet:
        </p>
        <pre style={{
          background: "rgba(0,0,0,0.4)",
          borderRadius: "0.5rem",
          padding: "1rem",
          overflow: "auto",
          fontSize: "0.75rem",
          color: "#A5F3FC",
          maxHeight: "300px",
          margin: 0,
        }}>{`CREATE TABLE IF NOT EXISTS nasdaq_usage_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_month      DATE NOT NULL,
  professional_subscribers      INT NOT NULL DEFAULT 0,
  non_professional_subscribers  INT NOT NULL DEFAULT 0,
  total_subscribers             INT NOT NULL DEFAULT 0,
  realtime_users      INT NOT NULL DEFAULT 0,
  delayed_users       INT NOT NULL DEFAULT 0,
  free_tier_count     INT NOT NULL DEFAULT 0,
  pro_tier_count      INT NOT NULL DEFAULT 0,
  pro_trader_count    INT NOT NULL DEFAULT 0,
  trial_count         INT NOT NULL DEFAULT 0,
  report_type   VARCHAR(30) NOT NULL DEFAULT 'monthly_summary',
  status        VARCHAR(20) NOT NULL DEFAULT 'draft',
  submitted_at  TIMESTAMPTZ,
  submitted_by  VARCHAR(255),
  submission_ref VARCHAR(100),
  revision_of   UUID REFERENCES nasdaq_usage_reports(id),
  due_date      DATE NOT NULL,
  revision_deadline DATE NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nasdaq_reports_month_type
  ON nasdaq_usage_reports (report_month, report_type)
  WHERE revision_of IS NULL;
CREATE INDEX IF NOT EXISTS idx_nasdaq_reports_status
  ON nasdaq_usage_reports (status);
CREATE INDEX IF NOT EXISTS idx_nasdaq_reports_due
  ON nasdaq_usage_reports (due_date);`}</pre>
      </div>

      {/* ========== SUBMIT MODAL ========== */}
      {submitModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
        }} onClick={() => setSubmitModal(null)}>
          <div style={{
            ...cardStyle, maxWidth: 480, width: "90%", margin: 0,
            border: "1px solid rgba(16,185,129,0.4)",
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: "#10B981", marginTop: 0 }}>Mark as Submitted</h3>
            <p style={{ color: "#9CA3AF", fontSize: "0.85rem" }}>
              {fmtMonth(submitModal.report_month)} — {submitModal.total_subscribers} subscribers
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label style={labelStyle}>Submitted By (email)</label>
                <input value={submitBy} onChange={e => setSubmitBy(e.target.value)} style={inputStyle} placeholder="admin@marketscannerpros.app" />
              </div>
              <div>
                <label style={labelStyle}>Nasdaq Portal Reference #</label>
                <input value={submitRef} onChange={e => setSubmitRef(e.target.value)} style={inputStyle} placeholder="e.g. RPT-2026-01-001" />
              </div>
              <div>
                <label style={labelStyle}>Notes (optional)</label>
                <textarea value={submitNotes} onChange={e => setSubmitNotes(e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} />
              </div>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                <button onClick={() => setSubmitModal(null)} style={btnDanger}>Cancel</button>
                <button onClick={handleSubmit} style={btnPrimary}>Confirm Submission</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== REVISE MODAL ========== */}
      {reviseModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
        }} onClick={() => setReviseModal(null)}>
          <div style={{
            ...cardStyle, maxWidth: 480, width: "90%", margin: 0,
            border: "1px solid rgba(59,130,246,0.4)",
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: "#60A5FA", marginTop: 0 }}>Revise Report</h3>
            <p style={{ color: "#9CA3AF", fontSize: "0.85rem" }}>
              {fmtMonth(reviseModal.report_month)} — Revision deadline: {fmtDate(reviseModal.revision_deadline)}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={labelStyle}>Professional Subscribers</label>
                  <input type="number" value={revisePro} onChange={e => setRevisePro(+e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Non-Professional Subscribers</label>
                  <input type="number" value={reviseNonPro} onChange={e => setReviseNonPro(+e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Revision Reason</label>
                <textarea value={reviseNotes} onChange={e => setReviseNotes(e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} placeholder="e.g. Correction of professional subscriber re-classification" />
              </div>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                <button onClick={() => setReviseModal(null)} style={btnDanger}>Cancel</button>
                <button onClick={handleRevise} style={{ ...btnPrimary, background: "#3B82F6" }}>Create Revision</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
