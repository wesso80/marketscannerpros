"use client";

/**
 * /admin/portfolio-lab/risk
 *
 * ARCA risk console. Live view of:
 *   - current open-risk and asset-class exposure (vs settings caps)
 *   - kill-switch state
 *   - risk events (pre-trade blocks, drawdown warnings, etc.)
 *
 * Admin can acknowledge risk events. SIMULATED only.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";

type RiskSeverity = "info" | "warning" | "critical" | "kill_switch";

interface RiskEvent {
  id: string;
  createdAt: string;
  eventType: string;
  severity: RiskSeverity;
  message: string;
  affectedSymbol: string | null;
  value: number | null;
  threshold: number | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
}

interface Position {
  id: string;
  symbol: string;
  assetClass: string;
  side: "LONG" | "SHORT";
  quantity: number;
  averageEntry: number;
  currentPrice: number | null;
  unrealisedPnl: number;
  openRisk: number;
}

interface PortfolioSummary {
  id: string;
  totalEquity: number;
  startingBalance: number;
  settings: {
    maxOpenPortfolioRiskPct: number;
    maxAssetClassExposurePct: Record<string, number>;
    hardDrawdownWarnPct: number;
    dailyDrawdownWarnPct: number;
    losingStreakWarn: number;
  } | null;
}

export default function PortfolioLabRiskPage() {
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyUnack, setOnlyUnack] = useState(false);
  const [ackingId, setAckingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [eRes, sRes] = await Promise.all([
        fetch(`/api/admin/portfolio-lab/risk${onlyUnack ? "?onlyUnack=1" : ""}`, { cache: "no-store" }),
        fetch(`/api/admin/portfolio-lab/summary`, { cache: "no-store" }),
      ]);
      const [eJson, sJson] = await Promise.all([eRes.json(), sRes.json()]);
      if (!eRes.ok) throw new Error(eJson?.error || `risk HTTP ${eRes.status}`);
      if (!sRes.ok) throw new Error(sJson?.error || `summary HTTP ${sRes.status}`);
      setEvents((eJson?.data?.events ?? []) as RiskEvent[]);
      const sData = sJson?.data ?? sJson;
      setPositions((sData?.positions ?? []) as Position[]);
      if (sData?.portfolio) {
        const p = sData.portfolio;
        setPortfolio({
          id: p.id,
          totalEquity: p.totalEquity,
          startingBalance: p.startingBalance,
          settings: p.settings ?? null,
        });
      } else {
        setPortfolio(null);
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [onlyUnack]);

  useEffect(() => { void load(); }, [load]);

  const ack = async (eventId: string) => {
    setAckingId(eventId);
    try {
      const r = await fetch("/api/admin/portfolio-lab/risk/ack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setAckingId(null);
    }
  };

  // ── derived exposure ──
  const exposure = useMemo(() => bucketExposure(positions), [positions]);
  const totalOpenRisk = positions.reduce((s, p) => s + (p.openRisk || 0), 0);
  const equity = portfolio?.totalEquity ?? 0;
  const openRiskPct = equity > 0 ? (totalOpenRisk / equity) * 100 : 0;

  const killActive = events.some((e) => e.severity === "kill_switch" && !e.acknowledged);

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", color: "#E2E8F0", padding: 24 }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={crumb}>SIMULATED · NO BROKER</div>
            <h1 style={h1}>ARCA Risk Console</h1>
            <div style={{ fontSize: 12, color: "#64748B" }}>arca:risk · real-time</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "#94A3B8", display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={onlyUnack} onChange={(e) => setOnlyUnack(e.target.checked)} />
              only unacknowledged
            </label>
            <button onClick={load} disabled={loading} style={btnGhost}>{loading ? "…" : "Reload"}</button>
          </div>
        </div>

        {killActive && (
          <div style={killBox}>
            ⚠ KILL SWITCH ACTIVE — at least one unacknowledged kill_switch risk event exists. ARCA will keep marking
            positions but new sim orders should be reviewed manually. Acknowledge below once handled.
          </div>
        )}

        {error && <div style={errBox}>Error: {error}</div>}

        {/* Risk gauges */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
          <Gauge
            label="Open Portfolio Risk"
            value={openRiskPct}
            cap={portfolio?.settings?.maxOpenPortfolioRiskPct ?? 5}
            unit="%"
          />
          <Gauge
            label="Open Risk $"
            value={totalOpenRisk}
            cap={null}
            unit="$"
            sub={`across ${positions.length} pos`}
          />
          <Gauge
            label="Daily Drawdown Warn"
            value={portfolio?.settings?.dailyDrawdownWarnPct ?? 2}
            cap={null}
            unit="%"
            sub="threshold"
          />
          <Gauge
            label="Hard Drawdown Warn"
            value={portfolio?.settings?.hardDrawdownWarnPct ?? 5}
            cap={null}
            unit="%"
            sub="threshold"
          />
        </div>

        {/* Asset-class exposure */}
        <Section title="Asset Class Exposure vs Caps">
          {Object.keys(exposure).length === 0 ? (
            <Empty text="No open positions." />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={th}>Class</th>
                  <th style={{ ...th, textAlign: "right" }}>Notional</th>
                  <th style={{ ...th, textAlign: "right" }}>% of Equity</th>
                  <th style={{ ...th, textAlign: "right" }}>Cap %</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(exposure).map(([cls, notional]) => {
                  const pctOfEq = equity > 0 ? (notional / equity) * 100 : 0;
                  const cap = portfolio?.settings?.maxAssetClassExposurePct?.[cls] ?? 100;
                  const status = pctOfEq > cap ? "BREACH" : pctOfEq > cap * 0.85 ? "NEAR" : "OK";
                  const tone = status === "BREACH" ? "#F87171" : status === "NEAR" ? "#FACC15" : "#10B981";
                  return (
                    <tr key={cls} style={{ borderTop: "1px solid #1F2937" }}>
                      <td style={td}>{cls}</td>
                      <td style={tdR}>${notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td style={tdR}>{pctOfEq.toFixed(2)}%</td>
                      <td style={tdR}>{cap}%</td>
                      <td style={{ ...td, color: tone, fontWeight: 600 }}>{status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>

        {/* Risk events */}
        <Section title={`Risk Events (${events.length}${onlyUnack ? ", unack only" : ""})`}>
          {events.length === 0 ? (
            <Empty text={onlyUnack ? "No unacknowledged events." : "No risk events recorded."} />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={th}>When</th>
                  <th style={th}>Severity</th>
                  <th style={th}>Type</th>
                  <th style={th}>Symbol</th>
                  <th style={th}>Message</th>
                  <th style={{ ...th, textAlign: "right" }}>Value</th>
                  <th style={{ ...th, textAlign: "right" }}>Threshold</th>
                  <th style={th}>Status</th>
                  <th style={th}>{/* action */}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} style={{ borderTop: "1px solid #1F2937" }}>
                    <td style={{ ...td, color: "#94A3B8" }}>{new Date(e.createdAt).toLocaleString()}</td>
                    <td style={{ ...td, fontWeight: 600, color: sevColor(e.severity) }}>{e.severity}</td>
                    <td style={td}>{e.eventType}</td>
                    <td style={td}>{e.affectedSymbol ?? "—"}</td>
                    <td style={{ ...td, color: "#CBD5E1" }}>{e.message}</td>
                    <td style={tdR}>{e.value == null ? "—" : e.value.toLocaleString()}</td>
                    <td style={tdR}>{e.threshold == null ? "—" : e.threshold.toLocaleString()}</td>
                    <td style={td}>
                      {e.acknowledged
                        ? <span style={{ color: "#94A3B8" }}>✓ {e.acknowledgedAt ? new Date(e.acknowledgedAt).toLocaleDateString() : "ack"}</span>
                        : <span style={{ color: "#FACC15" }}>open</span>}
                    </td>
                    <td style={td}>
                      {e.acknowledged ? null : (
                        <button
                          onClick={() => ack(e.id)}
                          disabled={ackingId === e.id}
                          style={btnTiny}
                        >
                          {ackingId === e.id ? "…" : "Acknowledge"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <div style={discBox}>
          ARCA Autonomous Portfolio Lab — admin-only SIMULATED paper trading. No broker integration exists. Risk events
          are generated by the cycle engine and the pre-trade risk check; acknowledging an event is a journaled action.
        </div>
      </div>
    </div>
  );
}

function bucketExposure(positions: Position[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of positions) {
    const notional = (p.currentPrice ?? p.averageEntry) * p.quantity;
    out[p.assetClass] = (out[p.assetClass] ?? 0) + notional;
  }
  return out;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 12, color: "#64748B", padding: 8 }}>{text}</div>;
}

function Gauge({ label, value, cap, unit, sub }: { label: string; value: number; cap: number | null; unit: "%" | "$"; sub?: string }) {
  const display = unit === "%"
    ? value.toFixed(2) + "%"
    : "$" + value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const tone = cap == null
    ? "#F8FAFC"
    : value > cap
    ? "#F87171"
    : value > cap * 0.85
    ? "#FACC15"
    : "#10B981";
  return (
    <div style={kpiBox}>
      <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone, marginTop: 4 }}>{display}</div>
      <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
        {cap == null ? (sub ?? " ") : `cap ${cap}${unit}` + (sub ? ` · ${sub}` : "")}
      </div>
    </div>
  );
}

function sevColor(s: RiskSeverity): string {
  if (s === "kill_switch") return "#F87171";
  if (s === "critical") return "#FB923C";
  if (s === "warning") return "#FACC15";
  return "#94A3B8";
}

const crumb: React.CSSProperties = { fontSize: 11, color: "#64748B", letterSpacing: 1.5, textTransform: "uppercase" };
const h1: React.CSSProperties = { fontSize: 22, color: "#F8FAFC", margin: "4px 0" };
const kpiBox: React.CSSProperties = { background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 14 };
const th: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #1F2937", color: "#64748B", fontWeight: 500, textAlign: "left" };
const td: React.CSSProperties = { padding: "8px 10px", color: "#E2E8F0" };
const tdR: React.CSSProperties = { ...td, textAlign: "right" };
const btnGhost: React.CSSProperties = { padding: "6px 12px", background: "transparent", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 6, cursor: "pointer", fontSize: 12 };
const btnTiny: React.CSSProperties = { padding: "3px 8px", background: "#1F2937", color: "#A7F3D0", border: "1px solid #334155", borderRadius: 4, cursor: "pointer", fontSize: 11 };
const errBox: React.CSSProperties = { background: "#7F1D1D", color: "#FCA5A5", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 };
const killBox: React.CSSProperties = { background: "#450A0A", border: "1px solid #DC2626", color: "#FCA5A5", padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 12, fontWeight: 600 };
const discBox: React.CSSProperties = { marginTop: 16, padding: 10, background: "#0B1220", border: "1px solid #1F2937", borderRadius: 6, fontSize: 11, color: "#64748B", lineHeight: 1.5 };
