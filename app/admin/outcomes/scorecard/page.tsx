"use client";

import { useEffect, useState } from "react";
import SectionTitle from "@/components/admin/shared/SectionTitle";
import AdminCard from "@/components/admin/shared/AdminCard";
import StatusPill from "@/components/admin/shared/StatusPill";

interface ScorecardRow {
  playbook: string;
  symbol: string;
  regime: string;
  sample: number;
  wins: number;
  losses: number;
  win_rate: string | number | null;
  avg_r: string | number | null;
  avg_elite_score: string | number | null;
  last_signal_at: string | null;
}

function authHeaders(): HeadersInit {
  const secret = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : null;
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

function toneForWinRate(value: number | null): "green" | "yellow" | "red" | "neutral" {
  if (value == null) return "neutral";
  if (value >= 60) return "green";
  if (value >= 45) return "yellow";
  return "red";
}

export default function OutcomesScorecardPage() {
  const [rows, setRows] = useState<ScorecardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/signals/scorecard?minSample=3", { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load scorecard");
      setRows(data.rows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scorecard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4 p-4">
      <SectionTitle title="Playbook Scorecard" subtitle={error || "Playbook × symbol × regime outcomes over the last 90 days"} />
      <div className="flex justify-end">
        <button onClick={load} disabled={loading} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50">
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <AdminCard title="Outcome Matrix">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.08em] text-white/45">
              <tr className="border-b border-white/10">
                <th className="px-3 py-2">Playbook</th>
                <th className="px-3 py-2">Symbol</th>
                <th className="px-3 py-2">Regime</th>
                <th className="px-3 py-2 text-right">Sample</th>
                <th className="px-3 py-2 text-right">W/L</th>
                <th className="px-3 py-2 text-right">Win Rate</th>
                <th className="px-3 py-2 text-right">Avg R</th>
                <th className="px-3 py-2 text-right">Elite</th>
                <th className="px-3 py-2">Last</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => {
                const winRate = row.win_rate == null ? null : Number(row.win_rate);
                return (
                  <tr key={`${row.playbook}-${row.symbol}-${row.regime}`} className="text-white/70">
                    <td className="px-3 py-2 font-semibold text-white">{row.playbook}</td>
                    <td className="px-3 py-2 font-mono text-emerald-300">{row.symbol}</td>
                    <td className="px-3 py-2">{row.regime}</td>
                    <td className="px-3 py-2 text-right">{row.sample}</td>
                    <td className="px-3 py-2 text-right">{row.wins}/{row.losses}</td>
                    <td className="px-3 py-2 text-right"><StatusPill label={winRate == null ? "—" : `${winRate}%`} tone={toneForWinRate(winRate)} /></td>
                    <td className="px-3 py-2 text-right">{row.avg_r ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{row.avg_elite_score ?? "—"}</td>
                    <td className="px-3 py-2 text-white/45">{row.last_signal_at ? new Date(row.last_signal_at).toLocaleString() : "—"}</td>
                  </tr>
                );
              })}
              {!rows.length && !loading && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-white/40">No scorecard rows yet. Run lifecycle labeling or lower the minimum sample threshold.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </div>
  );
}
