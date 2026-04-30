"use client";

import { useEffect, useState } from "react";

type EventRow = {
  id: string;
  symbol: string | null;
  market: string | null;
  event_type: string;
  severity: "INFO" | "WATCH" | "HIGH" | "CRITICAL";
  message: string;
  payload: Record<string, unknown>;
  created_at: string;
};

function severityColor(sev: EventRow["severity"]): string {
  if (sev === "CRITICAL") return "#EF4444";
  if (sev === "HIGH") return "#F97316";
  if (sev === "WATCH") return "#F59E0B";
  return "#10B981";
}

export default function AdminResearchEventTape({ limit = 40 }: { limit?: number }) {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/research-events?limit=${limit}`, { credentials: "include" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (alive) setRows(Array.isArray(json.events) ? json.events : []);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load event tape");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [limit]);

  return (
    <section className="rounded-xl border border-white/10 bg-[#0F172A]/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Research Event Tape</h3>
        {loading && <span className="text-[11px] text-white/45">Refreshing…</span>}
      </div>

      {error && <div className="mb-2 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-200">{error}</div>}

      <div className="max-h-[420px] overflow-auto space-y-2 pr-1">
        {rows.map((row) => (
          <div key={row.id} className="rounded-md border border-white/10 bg-white/[0.03] p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: `${severityColor(row.severity)}22`, color: severityColor(row.severity) }}>
                  {row.severity}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-white/50">{row.event_type.replaceAll("_", " ")}</span>
                {row.symbol && <span className="text-[11px] text-emerald-300">{row.symbol}</span>}
              </div>
              <span className="text-[10px] text-white/45">{new Date(row.created_at).toLocaleString()}</span>
            </div>
            <div className="mt-1 text-xs text-white/80">{row.message}</div>
          </div>
        ))}
        {!loading && rows.length === 0 && (
          <div className="py-4 text-center text-xs text-white/45">No events recorded yet.</div>
        )}
      </div>
    </section>
  );
}
