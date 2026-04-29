"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SectionTitle from "@/components/admin/shared/SectionTitle";
import AdminCard from "@/components/admin/shared/AdminCard";
import StatusPill from "@/components/admin/shared/StatusPill";

interface ScannerHit {
  symbol: string;
  bias: string;
  regime: string;
  permission: string;
  confidence: number;
  symbolTrust: number;
  sizeMultiplier: number;
  playbook?: string;
  blockReasons?: string[];
}

interface RiskState {
  openExposure: number;
  dailyDrawdown: number;
  correlationRisk: number;
  maxPositions: number;
  activePositions: number;
  killSwitchActive: boolean;
  permission: string;
  sizeMultiplier: number;
}

interface ResearchAlertLogEntry {
  alertId: string;
  symbol: string;
  market: string;
  timeframe: string;
  setup: string;
  bias: string;
  score: number;
  dataTrustScore: number;
  classification: string;
  status: "FIRED" | "SUPPRESSED";
  suppressionReason: string | null;
  createdAt: string;
}

function authHeaders(): HeadersInit {
  const secret = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : null;
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

function permissionTone(permission: string): "green" | "yellow" | "red" | "neutral" {
  if (permission === "GO" || permission === "ALLOW") return "green";
  if (permission === "WAIT" || permission === "ALLOW_REDUCED") return "yellow";
  if (permission === "BLOCK" || permission === "KILL") return "red";
  return "neutral";
}

export default function AlertsPage() {
  const [hits, setHits] = useState<ScannerHit[]>([]);
  const [risk, setRisk] = useState<RiskState | null>(null);
  const [researchLog, setResearchLog] = useState<ResearchAlertLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    setError("");
    try {
      const [scanRes, riskRes, alertRes] = await Promise.all([
        fetch("/api/admin/scanner/live?market=CRYPTO&timeframe=15m", { headers: authHeaders() }),
        fetch("/api/admin/risk/state", { headers: authHeaders() }),
        fetch("/api/admin/research-alerts?limit=25", { headers: authHeaders() }),
      ]);
      if (scanRes.ok) {
        const data = await scanRes.json();
        setHits(data.hits || []);
      }
      if (riskRes.ok) setRisk(await riskRes.json());
      if (alertRes.ok) {
        const data = await alertRes.json();
        setResearchLog(data.alerts || []);
      }
      if (!scanRes.ok || !riskRes.ok) setError("One or more alert feeds failed to load.");
    } catch {
      setError("Alert refresh failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, []);

  const sortedHits = [...hits].sort((a, b) => (b.confidence + b.symbolTrust) - (a.confidence + a.symbolTrust));
  const goHits = sortedHits.filter((hit) => hit.permission === "GO");
  const watchHits = sortedHits.filter((hit) => hit.permission === "WAIT");
  const riskAlerts = [
    risk?.killSwitchActive ? "Research alerts are paused" : null,
    risk && risk.dailyDrawdown > 0.015 ? `Daily drawdown elevated: ${(risk.dailyDrawdown * 100).toFixed(2)}%` : null,
    risk && risk.correlationRisk > 0.6 ? `Correlation risk high: ${(risk.correlationRisk * 100).toFixed(0)}%` : null,
    risk && risk.activePositions >= risk.maxPositions ? "Max position count reached" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="p-4 space-y-4">
      <SectionTitle title="Operator Alerts" subtitle={error || "Live scanner and risk alerts"} />

      <div className="flex justify-end">
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh Alerts"}
        </button>
      </div>

      <AdminCard title="Risk Alerts">
        {riskAlerts.length ? (
          <div className="space-y-2">
            {riskAlerts.map((alert) => (
              <div key={alert} className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200">
                {alert}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-white/40 text-sm">No active risk alerts.</p>
        )}
      </AdminCard>

      <AdminCard title="Research Alerts (Internal)">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-amber-300/80">
          PRIVATE RESEARCH ALERT — NOT BROKER EXECUTION
        </p>
        {researchLog.length ? (
          <div className="space-y-1.5">
            {researchLog.slice(0, 12).map((row) => (
              <Link
                key={row.alertId}
                href={`/admin/symbol/${encodeURIComponent(row.symbol)}`}
                className={`grid grid-cols-[70px_70px_1fr_90px_60px_70px] items-center gap-2 rounded-lg border px-3 py-2 text-xs no-underline ${
                  row.status === "FIRED"
                    ? "border-emerald-500/15 bg-emerald-500/5 hover:bg-emerald-500/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <span className="font-black text-white">{row.symbol}</span>
                <span className={row.bias === "LONG" ? "font-semibold text-emerald-300" : row.bias === "SHORT" ? "font-semibold text-red-300" : "font-semibold text-white/50"}>{row.bias}</span>
                <span className="truncate text-white/55">{row.setup} · {row.timeframe}</span>
                <StatusPill
                  label={row.status === "FIRED" ? "FIRED" : (row.suppressionReason || "SUPPRESSED")}
                  tone={row.status === "FIRED" ? "green" : "neutral"}
                />
                <span className="text-right font-mono text-white/70">{Math.round(row.score)}</span>
                <span className="text-right font-mono text-white/45">{Math.round(row.dataTrustScore)}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-white/40 text-sm">No research alerts logged yet.</p>
        )}
      </AdminCard>

      <AdminCard title="Actionable Scanner Alerts">
        {goHits.length ? (
          <div className="space-y-2">
            {goHits.slice(0, 8).map((hit) => (
              <Link key={hit.symbol} href={`/admin/terminal/${encodeURIComponent(hit.symbol)}`} className="grid grid-cols-[70px_70px_1fr_70px_60px] items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-2 text-sm no-underline hover:bg-emerald-500/10">
                <span className="font-black text-white">{hit.symbol}</span>
                <span className={hit.bias === "LONG" ? "font-semibold text-emerald-300" : hit.bias === "SHORT" ? "font-semibold text-red-300" : "font-semibold text-white/50"}>{hit.bias}</span>
                <span className="truncate text-white/55">{hit.playbook || hit.regime}</span>
                <StatusPill label={hit.permission} tone={permissionTone(hit.permission)} />
                <span className="text-right font-mono text-white/70">{Number(hit.confidence || 0).toFixed(0)}%</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-white/40 text-sm">No GO scanner alerts right now.</p>
        )}
      </AdminCard>

      <AdminCard title="Watchlist Alerts">
        {watchHits.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {watchHits.slice(0, 10).map((hit) => (
              <Link key={hit.symbol} href={`/admin/terminal/${encodeURIComponent(hit.symbol)}`} className="rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2 text-sm no-underline hover:bg-amber-500/10">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-white">{hit.symbol}</span>
                  <StatusPill label={hit.permission} tone={permissionTone(hit.permission)} />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-white/45">
                  <span className="truncate">{hit.bias} - {hit.playbook || hit.regime}</span>
                  <span className="font-mono">{Number(hit.confidence || 0).toFixed(0)}%</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-white/40 text-sm">No WAIT scanner alerts right now.</p>
        )}
      </AdminCard>
    </div>
  );
}
