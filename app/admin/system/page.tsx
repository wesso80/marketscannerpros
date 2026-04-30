"use client";

import { useEffect, useState } from "react";
import SectionTitle from "@/components/admin/shared/SectionTitle";
import AdminCard from "@/components/admin/shared/AdminCard";
import MiniStat from "@/components/admin/shared/MiniStat";
import StatusPill from "@/components/admin/shared/StatusPill";

interface SystemHealth {
  feed?: string;
  websocket?: string;
  scanner?: string;
  cache?: string;
  api?: string;
  lastScanAt?: string | null;
  errorsCount?: number;
  dbConnected?: boolean;
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

interface StatsResponse {
  overview?: {
    totalWorkspaces?: number;
    paidSubscriptions?: number;
    trialSubscriptions?: number;
    pendingDeleteRequests?: number;
  };
  aiUsage?: {
    today?: { totalQuestions?: number; uniqueUsers?: number };
  };
  learning?: {
    totals?: { total_predictions?: number; pending?: number; processed?: number };
  };
}

function authHeaders(): HeadersInit {
  const secret = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : null;
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

function statusTone(value?: string | boolean): "green" | "yellow" | "red" | "neutral" {
  if (value === true) return "green";
  if (value === false) return "red";
  const text = String(value || "").toUpperCase();
  if (["HEALTHY", "OK", "LOW_LATENCY", "RUNNING", "ONLINE", "CONNECTED"].some((item) => text.includes(item))) return "green";
  if (["DEGRADED", "IDLE", "DISCONNECTED", "UNKNOWN", "CHECK"].some((item) => text.includes(item))) return "yellow";
  if (["ERROR", "FAIL", "BLOCK"].some((item) => text.includes(item))) return "red";
  return "neutral";
}

export default function SystemPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [risk, setRisk] = useState<RiskState | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    setError("");
    try {
      const [healthRes, riskRes, statsRes] = await Promise.all([
        fetch("/api/admin/system/health", { headers: authHeaders() }),
        fetch("/api/admin/risk/state", { headers: authHeaders() }),
        fetch("/api/admin/stats", { headers: authHeaders() }),
      ]);

      if (healthRes.ok) setHealth(await healthRes.json());
      if (riskRes.ok) setRisk(await riskRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (!healthRes.ok || !riskRes.ok || !statsRes.ok) setError("One or more system feeds failed to load.");
    } catch {
      setError("System refresh failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, []);

  const services = [
    ["Database", health?.dbConnected ? "CONNECTED" : "CHECK"],
    ["Feed", health?.feed || "UNKNOWN"],
    ["Scanner", health?.scanner || "UNKNOWN"],
    ["Cache", health?.cache || "UNKNOWN"],
    ["API", health?.api || "UNKNOWN"],
    ["Websocket", health?.websocket || "UNKNOWN"],
  ];

  const riskLocked = risk?.killSwitchActive || risk?.permission === "BLOCK";
  const learningPending = Number(stats?.learning?.totals?.pending || 0);

  return (
    <div className="p-4 space-y-4">
      <SectionTitle title="System Command Health" subtitle={error || (health?.lastScanAt ? `Last scan: ${new Date(health.lastScanAt).toLocaleString()}` : undefined)} />

      <div className="flex justify-end">
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh System"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Total Users" value={String(stats?.overview?.totalWorkspaces ?? "-")} />
        <MiniStat label="Paid Subs" value={String(stats?.overview?.paidSubscriptions ?? "-")} />
        <MiniStat label="AI Today" value={String(stats?.aiUsage?.today?.totalQuestions ?? "-")} />
        <MiniStat label="Learning Queue" value={String(learningPending)} />
      </div>

      <AdminCard title="Operator Readiness">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Risk Permission</div>
            <div className={`mt-1 text-xl font-black ${riskLocked ? "text-red-300" : risk?.permission === "ALLOW" || risk?.permission === "GO" ? "text-emerald-300" : "text-amber-300"}`}>{risk?.killSwitchActive ? "ALERTS PAUSED" : risk?.permission === "BLOCK" ? "GUARD ACTIVE" : risk?.permission || "WAIT"}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Drawdown</div>
            <div className="mt-1 text-xl font-black text-white/85">{risk ? `${(risk.dailyDrawdown * 100).toFixed(2)}%` : "-"}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Correlation</div>
            <div className="mt-1 text-xl font-black text-white/85">{risk ? `${(risk.correlationRisk * 100).toFixed(0)}%` : "-"}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Positions</div>
            <div className="mt-1 text-xl font-black text-white/85">{risk ? `${risk.activePositions} / ${risk.maxPositions}` : "-"}</div>
          </div>
        </div>
      </AdminCard>

      <AdminCard title="Service Matrix">
        <div className="grid gap-2 md:grid-cols-2">
          {services.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <span className="text-sm text-white/70">{label}</span>
              <StatusPill label={String(value)} tone={statusTone(value)} />
            </div>
          ))}
        </div>
      </AdminCard>

      <AdminCard title="Maintenance Queue">
        <div className="grid gap-2 md:grid-cols-3 text-sm">
          <div className="rounded-lg bg-white/[0.03] p-3 text-white/65">Pending deletions: <strong className="text-white">{stats?.overview?.pendingDeleteRequests ?? 0}</strong></div>
          <div className="rounded-lg bg-white/[0.03] p-3 text-white/65">Trial users: <strong className="text-white">{stats?.overview?.trialSubscriptions ?? 0}</strong></div>
          <div className="rounded-lg bg-white/[0.03] p-3 text-white/65">Processed learning: <strong className="text-white">{stats?.learning?.totals?.processed ?? 0}</strong></div>
        </div>
      </AdminCard>
    </div>
  );
}
