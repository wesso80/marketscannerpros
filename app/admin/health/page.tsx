"use client";

import { useEffect, useState, useCallback } from "react";
import SectionTitle from "@/components/admin/shared/SectionTitle";
import AdminCard from "@/components/admin/shared/AdminCard";

type Status = "ok" | "warn" | "error" | "unknown";

interface Section {
  status: Status;
  note: string;
  data?: Record<string, unknown>;
}

interface HealthPayload {
  ok: boolean;
  overall: Status;
  generatedAt: string;
  latencyMs: number;
  sections: {
    database: Section;
    providers: Section;
    eveningPacket: Section;
    macroIngest: Section;
    aiSignals: Section;
    killSwitches: Section;
  };
}

const SECTION_LABELS: Record<keyof HealthPayload["sections"], string> = {
  database: "Database",
  providers: "Data Providers (AV + CoinGecko)",
  eveningPacket: "Evening Packet Cron",
  macroIngest: "Macro Ingest (FRED)",
  aiSignals: "AI Signals (24h)",
  killSwitches: "Kill Switches",
};

const STATUS_STYLES: Record<Status, { bg: string; fg: string; label: string }> = {
  ok: { bg: "#10B98122", fg: "#10B981", label: "OK" },
  warn: { bg: "#F59E0B22", fg: "#F59E0B", label: "WARN" },
  error: { bg: "#EF444422", fg: "#EF4444", label: "ERROR" },
  unknown: { bg: "#64748B22", fg: "#94A3B8", label: "UNKNOWN" },
};

function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
      }}
    >
      {s.label}
    </span>
  );
}

export default function AdminHealthPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/health", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as HealthPayload;
      setHealth(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    const t = setInterval(refetch, 30_000);
    return () => clearInterval(t);
  }, [refetch]);

  return (
    <div className="p-4 space-y-4">
      <SectionTitle
        title="Admin Health"
        subtitle={
          health
            ? `Overall: ${health.overall.toUpperCase()} · refreshed ${new Date(health.generatedAt).toLocaleTimeString()} · ${health.latencyMs}ms`
            : loading
              ? "Loading…"
              : err
                ? `Error: ${err}`
                : undefined
        }
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {health && <StatusBadge status={health.overall} />}
        <button
          onClick={refetch}
          disabled={loading}
          className="rounded-lg bg-white/10 px-3 py-1 text-xs font-medium text-white/70 hover:bg-white/20 transition disabled:opacity-40"
        >
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {health && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "0.75rem" }}>
          {(Object.keys(health.sections) as Array<keyof HealthPayload["sections"]>).map((key) => {
            const sec = health.sections[key];
            return (
              <AdminCard key={key} title={SECTION_LABELS[key]}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={sec.status} />
                    <span className="text-white/45 text-[11px]">{key}</span>
                  </div>
                  <div className="text-white/75 text-sm">{sec.note}</div>
                  {sec.data && Object.keys(sec.data).length > 0 && (
                    <pre className="text-[11px] text-white/40 whitespace-pre-wrap break-all bg-white/5 rounded p-2 mt-2">
                      {JSON.stringify(sec.data, null, 2)}
                    </pre>
                  )}
                </div>
              </AdminCard>
            );
          })}
        </div>
      )}

      <div className="text-white/40 text-[11px]">
        Auto-refresh every 30s. Notifications for critical events route via{" "}
        <code className="text-white/60">notifyAdmin()</code> (email + Discord).
      </div>
    </div>
  );
}
