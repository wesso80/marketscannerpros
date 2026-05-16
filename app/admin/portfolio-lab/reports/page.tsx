"use client";

/**
 * /admin/portfolio-lab/reports
 *
 * Persisted daily / evening / weekly ARCA memos. Admin can generate a
 * fresh one on demand. SIMULATED only.
 */
import React, { useCallback, useEffect, useState } from "react";

type ReportType = "DAILY_OPERATOR" | "EVENING_RECONCILIATION" | "WEEKLY_REVIEW";

interface ReportRow {
  id: string;
  reportDate: string;
  reportType: string;
  summary: string | null;
  createdAt: string;
  reportJson: unknown;
}

export default function PortfolioLabReportsPage() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"" | ReportType>("");
  const [generating, setGenerating] = useState<ReportType | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const url = filter ? `/api/admin/portfolio-lab/reports?type=${filter}` : "/api/admin/portfolio-lab/reports";
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setReports((j?.data?.reports ?? j?.reports ?? []) as ReportRow[]);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { void load(); }, [load]);

  const generate = useCallback(async (type: ReportType) => {
    setGenerating(type); setError(null);
    try {
      const r = await fetch("/api/admin/portfolio-lab/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportType: type }),
      });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${r.status}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setGenerating(null); }
  }, [load]);

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", color: "#E2E8F0", padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", letterSpacing: 1.5, textTransform: "uppercase" }}>SIMULATED · NO BROKER</div>
            <h1 style={{ fontSize: 22, color: "#F8FAFC", margin: "4px 0" }}>ARCA Reports</h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={filter} onChange={(e) => setFilter(e.target.value as "" | ReportType)} style={select}>
              <option value="">All Types</option>
              <option value="DAILY_OPERATOR">Daily Operator</option>
              <option value="EVENING_RECONCILIATION">Evening Reconciliation</option>
              <option value="WEEKLY_REVIEW">Weekly Review</option>
            </select>
            <button onClick={() => generate("DAILY_OPERATOR")} disabled={!!generating} style={btnPrimary}>{generating === "DAILY_OPERATOR" ? "…" : "Generate Daily"}</button>
            <button onClick={() => generate("EVENING_RECONCILIATION")} disabled={!!generating} style={btnGhost}>{generating === "EVENING_RECONCILIATION" ? "…" : "Generate Evening"}</button>
            <button onClick={() => generate("WEEKLY_REVIEW")} disabled={!!generating} style={btnGhost}>{generating === "WEEKLY_REVIEW" ? "…" : "Generate Weekly"}</button>
            <button onClick={load} disabled={loading} style={btnGhost}>{loading ? "…" : "Reload"}</button>
          </div>
        </div>

        {error && <div style={errBox}>Error: {error}</div>}

        {reports.length === 0 ? (
          <div style={emptyBox}>{loading ? "Loading…" : "No reports yet. Generate one with the buttons above."}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {reports.map((r) => {
              const isOpen = openId === r.id;
              return (
                <div key={r.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setOpenId(isOpen ? null : r.id)}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={badge(r.reportType)}>{prettyType(r.reportType)}</span>
                        <span style={{ fontSize: 14, color: "#F8FAFC", fontWeight: 600 }}>{r.reportDate}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>Generated {new Date(r.createdAt).toLocaleString()}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "#64748B" }}>{isOpen ? "▾ Collapse" : "▸ Expand"}</div>
                  </div>
                  {isOpen && (
                    <>
                      {r.summary && (
                        <pre style={summaryBox}>{r.summary}</pre>
                      )}
                      <details style={{ marginTop: 10 }}>
                        <summary style={{ fontSize: 11, color: "#64748B", cursor: "pointer" }}>Raw report JSON</summary>
                        <pre style={{ ...summaryBox, fontSize: 10 }}>{JSON.stringify(r.reportJson, null, 2)}</pre>
                      </details>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function prettyType(t: string): string {
  return t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
function badge(t: string): React.CSSProperties {
  const map: Record<string, { bg: string; fg: string }> = {
    DAILY_OPERATOR: { bg: "#1E3A8A", fg: "#BFDBFE" },
    EVENING_RECONCILIATION: { bg: "#581C87", fg: "#E9D5FF" },
    WEEKLY_REVIEW: { bg: "#064E3B", fg: "#A7F3D0" },
  };
  const c = map[t] ?? { bg: "#1F2937", fg: "#E2E8F0" };
  return { background: c.bg, color: c.fg, padding: "2px 8px", borderRadius: 4, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" };
}

const card: React.CSSProperties = { background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 14 };
const summaryBox: React.CSSProperties = { background: "#0B1220", color: "#E2E8F0", padding: 12, borderRadius: 6, fontSize: 12, whiteSpace: "pre-wrap", marginTop: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", maxHeight: 400, overflow: "auto" };
const select: React.CSSProperties = { padding: "6px 10px", background: "#0B1220", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 6, fontSize: 12 };
const btnPrimary: React.CSSProperties = { padding: "8px 14px", background: "#10B981", color: "#0B1220", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnGhost: React.CSSProperties = { padding: "8px 14px", background: "transparent", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 6, cursor: "pointer", fontSize: 13 };
const errBox: React.CSSProperties = { background: "#7F1D1D", color: "#FCA5A5", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 };
const emptyBox: React.CSSProperties = { background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 24, color: "#64748B", textAlign: "center", fontSize: 13 };
