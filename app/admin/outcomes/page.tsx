"use client";

import { useState, useEffect, useCallback } from "react";

/* ── Types ── */
interface Signal {
  id: number;
  symbol: string;
  asset_type: string;
  timeframe: string;
  signal_at: string;
  regime: string;
  confluence_score: number;
  confidence: number;
  verdict: string;
  trade_bias: string;
  price_at_signal: number | null;
  outcome: string;
  pct_move_24h: number | null;
  decision_trace: Record<string, unknown> | null;
}

interface Stats {
  overall: {
    totalSignals: number;
    labeled: number;
    pending: number;
    correct: number;
    wrong: number;
    neutral: number;
    expired: number;
    accuracyRate: number | null;
    avgMoveCorrect: number | null;
    avgMoveWrong: number | null;
    avgConfluence: number | null;
  };
  byRegime: {
    regime: string;
    total: number;
    correct: number;
    wrong: number;
    labeled: number;
    accuracyRate: number | null;
    avgScore: number | null;
  }[];
  byVerdict: {
    verdict: string;
    total: number;
    correct: number;
    wrong: number;
    labeled: number;
    accuracyRate: number | null;
  }[];
  trend: {
    recent7d: { total: number; correct: number; labeled: number; accuracyRate: number | null };
    prior30d: { total: number; correct: number; labeled: number; accuracyRate: number | null };
  };
}

/* ── Helpers ── */
function authHeaders(): HeadersInit {
  const secret = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : null;
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

function outcomeColor(outcome: string) {
  switch (outcome) {
    case "correct": return "#10B981";
    case "wrong": return "#EF4444";
    case "neutral": return "#6B7280";
    case "expired": return "#9CA3AF";
    default: return "#FBBF24";
  }
}

function permissionColor(verdict: string) {
  switch (verdict) {
    case "ALLOW": return "#10B981";
    case "ALLOW_REDUCED": return "#FBBF24";
    case "WAIT": return "#6B7280";
    case "BLOCK": return "#EF4444";
    default: return "#9CA3AF";
  }
}

/* ── Summary Card ── */
function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background: "rgba(17, 24, 39, 0.6)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "0.75rem",
      padding: "1rem 1.25rem",
      minWidth: 140,
    }}>
      <div style={{ fontSize: "0.7rem", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: color ?? "#F9FAFB", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: "0.7rem", color: "#6B7280", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ── Accuracy Bar ── */
function AccuracyBar({ correct, wrong, total }: { correct: number; wrong: number; total: number }) {
  if (total === 0) return <div style={{ fontSize: "0.7rem", color: "#6B7280" }}>No data</div>;
  const cPct = (correct / total) * 100;
  const wPct = (wrong / total) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: "#1F2937", borderRadius: 3, overflow: "hidden", display: "flex" }}>
        <div style={{ width: `${cPct}%`, background: "#10B981" }} />
        <div style={{ width: `${wPct}%`, background: "#EF4444" }} />
      </div>
      <span style={{ fontSize: "0.7rem", color: "#9CA3AF", minWidth: 38, textAlign: "right" }}>
        {total > 0 ? `${Math.round(cPct)}%` : "—"}
      </span>
    </div>
  );
}

/* ── Page ── */
export default function OutcomesPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Labeler state
  const [labelerRunning, setLabelerRunning] = useState(false);
  const [labelerResult, setLabelerResult] = useState<Record<string, unknown> | null>(null);

  // Filters
  const [filterSymbol, setFilterSymbol] = useState("");
  const [filterRegime, setFilterRegime] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");
  const [page, setPage] = useState(0);
  const LIMIT = 30;

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/signals/stats", { headers: authHeaders() });
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchSignals = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterSymbol) params.set("symbol", filterSymbol);
      if (filterRegime) params.set("regime", filterRegime);
      if (filterOutcome) params.set("outcome", filterOutcome);
      params.set("limit", String(LIMIT));
      params.set("offset", String(page * LIMIT));

      const res = await fetch(`/api/admin/signals?${params}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSignals(data.signals);
        setTotal(data.total);
      }
    } catch { /* ignore */ }
  }, [filterSymbol, filterRegime, filterOutcome, page]);

  const runLabeler = useCallback(async () => {
    setLabelerRunning(true);
    setLabelerResult(null);
    try {
      const res = await fetch("/api/cron/label-ai-outcomes", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
      });
      const data = await res.json();
      setLabelerResult({ status: res.status, ...data });
      // Refresh stats after labeling
      if (res.ok) {
        await Promise.all([fetchStats(), fetchSignals()]);
      }
    } catch (err) {
      setLabelerResult({ error: String(err) });
    } finally {
      setLabelerRunning(false);
    }
  }, [fetchStats, fetchSignals]);

  useEffect(() => {
    Promise.all([fetchStats(), fetchSignals()]).then(() => setLoading(false));
  }, [fetchStats, fetchSignals]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#F9FAFB" }}>🎯 Signal Outcomes</h1>
          <p style={{ fontSize: "0.8rem", color: "#6B7280", marginTop: 2 }}>
            Every scanner signal logged · Outcome tracking across regimes & verdicts
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={runLabeler}
            disabled={labelerRunning}
            style={{
              padding: "0.5rem 1rem", background: labelerRunning ? "rgba(251,191,36,0.1)" : "rgba(251,191,36,0.15)",
              border: "1px solid rgba(251,191,36,0.3)", borderRadius: "0.5rem",
              color: "#FBBF24", fontSize: "0.8rem", fontWeight: 600,
              cursor: labelerRunning ? "wait" : "pointer", opacity: labelerRunning ? 0.6 : 1,
            }}
          >
            {labelerRunning ? "⏳ Labeling…" : "⚡ Run Labeler Now"}
          </button>
          <button
            onClick={() => { fetchStats(); fetchSignals(); }}
            style={{
              padding: "0.5rem 1rem", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)",
              borderRadius: "0.5rem", color: "#10B981", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Labeler Result Banner ── */}
      {labelerResult && (
        <div style={{
          padding: "0.75rem 1rem", marginBottom: "1rem", borderRadius: "0.5rem",
          background: labelerResult.success ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
          border: `1px solid ${labelerResult.success ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
          fontSize: "0.8rem", color: labelerResult.success ? "#10B981" : "#EF4444",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              {labelerResult.success
                ? `✅ Labeled ${labelerResult.labeled ?? 0} signals`
                : `❌ ${labelerResult.error ?? "Labeling failed"}`}
              {labelerResult.breakdown ? (
                <span style={{ color: "#9CA3AF", marginLeft: 8 }}>
                  (✓{(labelerResult.breakdown as Record<string, number>).correct ?? 0}
                  {" "}✗{(labelerResult.breakdown as Record<string, number>).wrong ?? 0}
                  {" "}~{(labelerResult.breakdown as Record<string, number>).neutral ?? 0}
                  {" "}⏰{(labelerResult.breakdown as Record<string, number>).expired ?? 0}
                  {(labelerResult.breakdown as Record<string, number>).skippedNoPrice > 0
                    ? ` | ${(labelerResult.breakdown as Record<string, number>).skippedNoPrice} skipped (no price)`
                    : ""})
                </span>
              ) : null}
            </div>
            <button
              onClick={() => setLabelerResult(null)}
              style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: "1rem" }}
            >×</button>
          </div>
          {labelerResult.status === 401 && (
            <div style={{ color: "#FBBF24", marginTop: 4, fontSize: "0.75rem" }}>
              ⚠️ Auth failed — check that ADMIN_SECRET is set in Render env vars and matches your admin login secret.
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ color: "#6B7280", textAlign: "center", padding: "3rem" }}>Loading signal data…</div>
      ) : (
        <>
          {/* ── Summary Cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
            <StatCard label="Total Signals" value={stats?.overall.totalSignals ?? 0} />
            <StatCard label="Accuracy" value={stats?.overall.accuracyRate != null ? `${stats.overall.accuracyRate}%` : "—"} color="#10B981" />
            <StatCard label="Correct" value={stats?.overall.correct ?? 0} color="#10B981" />
            <StatCard label="Wrong" value={stats?.overall.wrong ?? 0} color="#EF4444" />
            <StatCard label="Pending" value={stats?.overall.pending ?? 0} color="#FBBF24" />
            <StatCard
              label="Avg Move (✓)"
              value={stats?.overall.avgMoveCorrect != null ? `${stats.overall.avgMoveCorrect}%` : "—"}
              color="#10B981"
            />
            <StatCard
              label="Avg Move (✗)"
              value={stats?.overall.avgMoveWrong != null ? `${stats.overall.avgMoveWrong}%` : "—"}
              color="#EF4444"
            />
            <StatCard label="Avg Confluence" value={stats?.overall.avgConfluence ?? "—"} />
          </div>

          {/* ── Trend Comparison ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.5rem" }}>
            <div style={{
              background: "rgba(17, 24, 39, 0.6)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "0.75rem", padding: "1rem 1.25rem",
            }}>
              <div style={{ fontSize: "0.7rem", color: "#9CA3AF", textTransform: "uppercase", marginBottom: 6 }}>Last 7 Days</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "#F9FAFB" }}>
                  {stats?.trend.recent7d.accuracyRate != null ? `${stats.trend.recent7d.accuracyRate}%` : "—"}
                </span>
                <span style={{ fontSize: "0.75rem", color: "#6B7280" }}>
                  {stats?.trend.recent7d.total ?? 0} signals
                </span>
              </div>
            </div>
            <div style={{
              background: "rgba(17, 24, 39, 0.6)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "0.75rem", padding: "1rem 1.25rem",
            }}>
              <div style={{ fontSize: "0.7rem", color: "#9CA3AF", textTransform: "uppercase", marginBottom: 6 }}>Prior 30 Days</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "#F9FAFB" }}>
                  {stats?.trend.prior30d.accuracyRate != null ? `${stats.trend.prior30d.accuracyRate}%` : "—"}
                </span>
                <span style={{ fontSize: "0.75rem", color: "#6B7280" }}>
                  {stats?.trend.prior30d.total ?? 0} signals
                </span>
              </div>
            </div>
          </div>

          {/* ── Regime Breakdown ── */}
          {stats?.byRegime && stats.byRegime.length > 0 && (
            <div style={{
              background: "rgba(17, 24, 39, 0.6)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "0.75rem", padding: "1rem 1.25rem", marginBottom: "1.5rem",
            }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#F9FAFB", marginBottom: "0.75rem" }}>
                Accuracy by Regime
              </div>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {stats.byRegime.map((r) => (
                  <div key={r.regime} style={{ display: "grid", gridTemplateColumns: "140px 1fr 60px", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "0.75rem", color: "#D1D5DB", fontFamily: "monospace" }}>{r.regime}</span>
                    <AccuracyBar correct={r.correct} wrong={r.wrong} total={r.labeled} />
                    <span style={{ fontSize: "0.7rem", color: "#6B7280", textAlign: "right" }}>{r.total} sig</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Verdict Breakdown ── */}
          {stats?.byVerdict && stats.byVerdict.length > 0 && (
            <div style={{
              background: "rgba(17, 24, 39, 0.6)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "0.75rem", padding: "1rem 1.25rem", marginBottom: "1.5rem",
            }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#F9FAFB", marginBottom: "0.75rem" }}>
                Accuracy by Verdict
              </div>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {stats.byVerdict.map((v) => (
                  <div key={v.verdict} style={{ display: "grid", gridTemplateColumns: "140px 1fr 60px", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "0.75rem", color: permissionColor(v.verdict), fontFamily: "monospace" }}>{v.verdict}</span>
                    <AccuracyBar correct={v.correct} wrong={v.wrong} total={v.labeled} />
                    <span style={{ fontSize: "0.7rem", color: "#6B7280", textAlign: "right" }}>{v.total} sig</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Filters ── */}
          <div style={{
            display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center",
          }}>
            <input
              placeholder="Symbol…"
              value={filterSymbol}
              onChange={(e) => { setFilterSymbol(e.target.value.toUpperCase()); setPage(0); }}
              style={{
                padding: "0.4rem 0.75rem", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "0.4rem", color: "#E5E7EB", fontSize: "0.8rem", width: 100,
              }}
            />
            <select
              value={filterRegime}
              onChange={(e) => { setFilterRegime(e.target.value); setPage(0); }}
              style={{
                padding: "0.4rem 0.75rem", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "0.4rem", color: "#E5E7EB", fontSize: "0.8rem",
              }}
            >
              <option value="">All Regimes</option>
              {(stats?.byRegime ?? []).map((r) => (
                <option key={r.regime} value={r.regime}>{r.regime}</option>
              ))}
            </select>
            <select
              value={filterOutcome}
              onChange={(e) => { setFilterOutcome(e.target.value); setPage(0); }}
              style={{
                padding: "0.4rem 0.75rem", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "0.4rem", color: "#E5E7EB", fontSize: "0.8rem",
              }}
            >
              <option value="">All Outcomes</option>
              <option value="pending">Pending</option>
              <option value="correct">Correct</option>
              <option value="wrong">Wrong</option>
              <option value="neutral">Neutral</option>
              <option value="expired">Expired</option>
            </select>
            <span style={{ fontSize: "0.75rem", color: "#6B7280", marginLeft: "auto" }}>
              {total} signal{total !== 1 ? "s" : ""}
            </span>
          </div>

          {/* ── Signal Table ── */}
          <div style={{
            background: "rgba(17, 24, 39, 0.6)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "0.75rem", overflow: "hidden",
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "80px 100px 60px 70px 100px 80px 90px 70px",
              gap: 0,
              padding: "0.6rem 1rem",
              background: "rgba(0,0,0,0.2)",
              fontSize: "0.65rem",
              color: "#6B7280",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 600,
            }}>
              <div>Symbol</div>
              <div>Time</div>
              <div>Bias</div>
              <div>Score</div>
              <div>Regime</div>
              <div>Verdict</div>
              <div>Outcome</div>
              <div>24h Δ</div>
            </div>
            {signals.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "#6B7280", fontSize: "0.8rem" }}>
                No signals recorded yet. Signals are logged automatically during admin terminal scans.
              </div>
            ) : (
              signals.map((s) => (
                <div key={s.id} style={{
                  display: "grid",
                  gridTemplateColumns: "80px 100px 60px 70px 100px 80px 90px 70px",
                  gap: 0,
                  padding: "0.5rem 1rem",
                  borderTop: "1px solid rgba(255,255,255,0.04)",
                  fontSize: "0.75rem",
                  color: "#D1D5DB",
                  alignItems: "center",
                }}>
                  <div style={{ fontWeight: 600, color: "#F9FAFB" }}>{s.symbol}</div>
                  <div style={{ color: "#9CA3AF", fontSize: "0.7rem" }}>
                    {new Date(s.signal_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div style={{ color: s.trade_bias === "LONG" ? "#10B981" : s.trade_bias === "SHORT" ? "#EF4444" : "#6B7280" }}>
                    {s.trade_bias ?? "—"}
                  </div>
                  <div>{s.confluence_score}</div>
                  <div style={{ fontFamily: "monospace", fontSize: "0.65rem" }}>{s.regime}</div>
                  <div style={{ color: permissionColor(s.verdict) }}>{s.verdict}</div>
                  <div>
                    <span style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 10,
                      fontSize: "0.65rem",
                      fontWeight: 600,
                      color: "#FFF",
                      background: outcomeColor(s.outcome),
                    }}>
                      {s.outcome}
                    </span>
                  </div>
                  <div style={{
                    color: (s.pct_move_24h ?? 0) > 0 ? "#10B981" : (s.pct_move_24h ?? 0) < 0 ? "#EF4444" : "#6B7280",
                    fontFamily: "monospace",
                    fontSize: "0.7rem",
                  }}>
                    {s.pct_move_24h != null ? `${s.pct_move_24h > 0 ? "+" : ""}${s.pct_move_24h}%` : "—"}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "1rem" }}>
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                style={{
                  padding: "0.4rem 0.75rem", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "0.4rem", color: page === 0 ? "#4B5563" : "#D1D5DB", fontSize: "0.8rem", cursor: page === 0 ? "default" : "pointer",
                }}
              >
                ← Prev
              </button>
              <span style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem", color: "#9CA3AF" }}>
                {page + 1} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                style={{
                  padding: "0.4rem 0.75rem", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "0.4rem", color: page >= totalPages - 1 ? "#4B5563" : "#D1D5DB", fontSize: "0.8rem",
                  cursor: page >= totalPages - 1 ? "default" : "pointer",
                }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
