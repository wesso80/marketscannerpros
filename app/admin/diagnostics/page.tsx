"use client";

import { useEffect, useState } from "react";
import SectionTitle from "@/components/admin/shared/SectionTitle";
import AdminCard from "@/components/admin/shared/AdminCard";
import StatusPill from "@/components/admin/shared/StatusPill";
import MiniStat from "@/components/admin/shared/MiniStat";

interface Health {
  feed?: string;
  websocket?: string;
  scanner?: string;
  cache?: string;
  api?: string;
  lastScanAt?: string | null;
  errorsCount?: number;
  dbConnected?: boolean;
}

interface ScannerMeta {
  symbolsScanned?: number;
  errorsCount?: number;
  errors?: { symbol: string; error: string }[];
  timestamp?: string;
  environmentMode?: string;
}

interface ScannerResponse {
  hits?: unknown[];
  health?: Health;
  meta?: ScannerMeta;
}

interface ScannerDiagnostics {
  ok?: boolean;
  database?: { connected: boolean; latencyMs: number | null };
  scanners?: { signalCount24h: number; lastSignalAt: string | null };
  barCache?: { size: number; maxEntries: number; staleEntries: number };
}

function authHeaders(): HeadersInit {
  const secret = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : null;
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

function tone(value?: string | boolean): "green" | "yellow" | "red" | "neutral" {
  if (value === true) return "green";
  if (value === false) return "red";
  const text = String(value || "").toUpperCase();
  if (["HEALTHY", "OK", "LOW_LATENCY", "RUNNING", "CONNECTED"].some((item) => text.includes(item))) return "green";
  if (["IDLE", "DISCONNECTED", "UNKNOWN", "DEGRADED"].some((item) => text.includes(item))) return "yellow";
  if (["ERROR", "FAILED", "BLOCK"].some((item) => text.includes(item))) return "red";
  return "neutral";
}

export default function DiagnosticsPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [scanner, setScanner] = useState<ScannerResponse | null>(null);
  const [scannerDiagnostics, setScannerDiagnostics] = useState<ScannerDiagnostics | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setError("");
    const startedAt = performance.now();
    try {
      const [healthRes, scannerRes, scannerDiagnosticsRes] = await Promise.all([
        fetch("/api/admin/system/health", { headers: authHeaders() }),
        fetch("/api/admin/scanner/live?market=CRYPTO&timeframe=15m", { headers: authHeaders() }),
        fetch("/api/admin/diagnostics/scanners", { headers: authHeaders() }),
      ]);
      setLatencyMs(Math.round(performance.now() - startedAt));
      if (healthRes.ok) setHealth(await healthRes.json());
      if (scannerRes.ok) setScanner(await scannerRes.json());
      if (scannerDiagnosticsRes.ok) setScannerDiagnostics(await scannerDiagnosticsRes.json());
      if (!healthRes.ok || !scannerRes.ok || !scannerDiagnosticsRes.ok) setError("One or more diagnostic checks failed.");
    } catch {
      setLatencyMs(Math.round(performance.now() - startedAt));
      setError("Diagnostic refresh failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const checks = [
    ["Database", health?.dbConnected ? "CONNECTED" : "CHECK"],
    ["Market Feed", health?.feed || "UNKNOWN"],
    ["Scanner Engine", health?.scanner || "UNKNOWN"],
    ["Cache", health?.cache || "UNKNOWN"],
    ["API", health?.api || "UNKNOWN"],
    ["Websocket", health?.websocket || "UNKNOWN"],
  ];

  const scannerErrors = scanner?.meta?.errors || [];

  return (
    <div className="p-4 space-y-4">
      <SectionTitle title="System Diagnostics" subtitle={error || "Private desk trust checks"} />
      <div className="flex justify-end">
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50"
        >
          {loading ? "Running..." : "Run Diagnostics"}
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Round Trip" value={latencyMs == null ? "-" : `${latencyMs}ms`} />
        <MiniStat label="Symbols Scanned" value={String(scanner?.meta?.symbolsScanned ?? "-")} />
        <MiniStat label="Scanner Hits" value={String(scanner?.hits?.length ?? "-")} />
        <MiniStat label="Scan Errors" value={String(scanner?.meta?.errorsCount ?? 0)} />
        <MiniStat label="Bar Cache" value={`${scannerDiagnostics?.barCache?.size ?? 0}/${scannerDiagnostics?.barCache?.maxEntries ?? 0}`} />
        <MiniStat label="Signals 24h" value={String(scannerDiagnostics?.scanners?.signalCount24h ?? 0)} />
        <MiniStat label="DB Latency" value={scannerDiagnostics?.database?.latencyMs == null ? "-" : `${scannerDiagnostics.database.latencyMs}ms`} />
      </div>
      <AdminCard title="Health Checks">
        <div className="grid gap-2 md:grid-cols-2">
          {checks.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <span className="text-white/70 text-sm">{label}</span>
              <StatusPill label={String(value)} tone={tone(value)} />
            </div>
          ))}
        </div>
      </AdminCard>
      <AdminCard title="Scanner Infrastructure">
        <div className="grid gap-2 md:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
            <span className="text-white/70 text-sm">Bar Cache Entries</span>
            <StatusPill label={`${scannerDiagnostics?.barCache?.size ?? 0}/${scannerDiagnostics?.barCache?.maxEntries ?? 0}`} tone="neutral" />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
            <span className="text-white/70 text-sm">Stale Cache Entries</span>
            <StatusPill label={String(scannerDiagnostics?.barCache?.staleEntries ?? 0)} tone={(scannerDiagnostics?.barCache?.staleEntries ?? 0) > 0 ? "yellow" : "green"} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
            <span className="text-white/70 text-sm">Signals Last 24h</span>
            <StatusPill label={String(scannerDiagnostics?.scanners?.signalCount24h ?? 0)} tone="neutral" />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
            <span className="text-white/70 text-sm">Last Signal</span>
            <StatusPill label={scannerDiagnostics?.scanners?.lastSignalAt ? new Date(scannerDiagnostics.scanners.lastSignalAt).toLocaleString() : "NONE"} tone={scannerDiagnostics?.scanners?.lastSignalAt ? "green" : "yellow"} />
          </div>
        </div>
      </AdminCard>
      <AdminCard title="Scanner Error Detail">
        {scannerErrors.length ? (
          <div className="space-y-2">
            {scannerErrors.slice(0, 12).map((item) => (
              <div key={`${item.symbol}-${item.error}`} className="rounded-lg border border-red-500/15 bg-red-500/5 px-3 py-2 text-sm">
                <span className="font-semibold text-red-300">{item.symbol}</span>
                <span className="ml-2 text-white/55">{item.error}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-white/40 text-sm">No scanner errors returned by the latest diagnostic run.</p>
        )}
      </AdminCard>
    </div>
  );
}
