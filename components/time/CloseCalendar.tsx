"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectAssetClass } from '@/lib/detectAssetClass';
import type {
  CloseCalendarAnchor,
  ForwardCloseCalendar,
  ForwardCloseCluster,
  ForwardCloseScheduleRow,
} from "@/lib/confluence-learning-agent";

// ── Anchor + Horizon selectors ──

const ANCHOR_OPTIONS: { value: CloseCalendarAnchor; label: string }[] = [
  { value: "NOW", label: "Now" },
  { value: "TODAY", label: "Today" },
  { value: "EOW", label: "End of Week" },
  { value: "EOM", label: "End of Month" },
  { value: "CUSTOM", label: "Pick Date" },
];

const HORIZON_OPTIONS = [1, 3, 7, 14, 30] as const;

type AssetClass = "crypto" | "equity";

// ── Helpers ──

function formatDate(iso: string, assetClass: AssetClass): string {
  const d = new Date(iso);
  if (assetClass === "crypto") {
    // Crypto: display in UTC (TradingView-style)
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const v = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${v("weekday")} ${v("month")} ${v("day")} ${v("hour")}:${v("minute")} UTC`;
  }
  // Equity: display in NY timezone
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const tzLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "ET";
  return `${v("weekday")} ${v("month")} ${v("day")} ${v("hour")}:${v("minute")} ${tzLabel}`;
}

function formatMinsShort(mins: number | null): string {
  if (mins === null) return "—";
  if (mins <= 0) return "NOW";
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 1440) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(mins / 1440);
  const h = Math.round((mins % 1440) / 60);
  if (d >= 30) return `${Math.round(d / 30)}mo`;
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

function categoryColor(cat: string): string {
  switch (cat) {
    case "intraday": return "text-slate-500";
    case "daily": return "text-cyan-400";
    case "weekly": return "text-emerald-400";
    case "monthly": return "text-amber-400";
    case "yearly": return "text-rose-400";
    default: return "text-slate-400";
  }
}

function categoryBg(cat: string): string {
  switch (cat) {
    case "intraday": return "bg-slate-800";
    case "daily": return "bg-cyan-500/10";
    case "weekly": return "bg-emerald-500/10";
    case "monthly": return "bg-amber-500/10";
    case "yearly": return "bg-rose-500/10";
    default: return "";
  }
}

function clusterScoreColor(score: number): string {
  if (score >= 70) return "border-emerald-500/40 bg-emerald-500/10";
  if (score >= 40) return "border-amber-500/40 bg-amber-500/10";
  return "border-slate-700 bg-slate-900/30";
}

// ── Main Component ──

interface CloseCalendarProps {
  symbol?: string;
  onClusterClick?: (tfs: string[], clusterLabel: string) => void;
  activeClusterLabel?: string;
}

export default function CloseCalendar({ symbol: propSymbol, onClusterClick, activeClusterLabel }: CloseCalendarProps) {
  const assetClass = propSymbol ? detectAssetClass(propSymbol) : 'crypto';
  const [anchor, setAnchor] = useState<CloseCalendarAnchor>("TODAY");
  const [horizon, setHorizon] = useState<number>(1);
  const [customDate, setCustomDate] = useState("");
  const [data, setData] = useState<ForwardCloseCalendar | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "daily" | "weekly" | "monthly" | "yearly">("all");
  const [showAnchorDay, setShowAnchorDay] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const fetchCalendar = useCallback(async () => {
    // Abort any in-flight request before starting a new one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const symbol = propSymbol || (assetClass === "crypto" ? "BTCUSD" : "AAPL");
      const res = await fetch("/api/confluence-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          mode: "calendar",
          anchor,
          horizonDays: horizon,
          anchorTime: anchor === "CUSTOM" && customDate ? new Date(customDate).toISOString() : undefined,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setError(json?.error || "Calendar fetch failed");
        return;
      }
      setData(json.data as ForwardCloseCalendar);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [anchor, horizon, customDate, assetClass, propSymbol]);

  // Auto-fetch on mount and when anchor/horizon change
  useEffect(() => {
    void fetchCalendar();
  }, [fetchCalendar]);

  // For equities, hide intraday rows — their close times are fixed and shown
  // in the static schedule above. Only daily+ timeframes have variable dates.
  const isEquity = assetClass === 'equity';
  const stripIntraday = (rows: ForwardCloseScheduleRow[]) =>
    isEquity ? rows.filter((r) => r.category !== 'intraday') : rows;

  const filteredSchedule = stripIntraday(
    data?.schedule.filter(
      (r) => filter === "all" || r.category === filter,
    ) ?? [],
  );

  const anchorDayRows = stripIntraday(data?.closesOnAnchorDay ?? []);

  return (
    <section className="w-full space-y-4 rounded-2xl border border-slate-800 bg-slate-900/30 p-3 lg:p-5">
      {/* ── Header + Controls ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">📅 Close Calendar — Forward Schedule</div>
          <div className="text-xs text-slate-400">
            Which timeframes close on your target day? Where do closes stack?
          </div>
        </div>
        <button
          type="button"
          onClick={fetchCalendar}
          disabled={loading}
          className="rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1.5 text-xs font-semibold text-slate-100 disabled:opacity-40"
        >
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {/* ── Anchor + Horizon selectors ── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 max-w-full">
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Anchor</label>
          <div className="flex gap-1 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            {ANCHOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAnchor(opt.value)}
                className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  anchor === opt.value
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                    : "bg-slate-950/40 text-slate-400 border border-slate-800 hover:text-slate-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {anchor === "CUSTOM" && (
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Date</label>
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-950/50 px-2.5 py-1.5 text-xs text-slate-200"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Horizon</label>
          <div className="flex gap-1 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            {HORIZON_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setHorizon(d)}
                className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  horizon === d
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                    : "bg-slate-950/40 text-slate-400 border border-slate-800 hover:text-slate-200"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}

      {data && (
        <>
          {/* ── Anchor info strip ── */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2 text-xs">
            <span className="text-slate-400">
              Anchor: <span className="font-semibold text-slate-200">{formatDate(data.anchorTimeISO, assetClass)}</span>
            </span>
            <span className="text-slate-400">
              Horizon: <span className="font-semibold text-slate-200">{data.horizonDays}d → {formatDate(data.horizonEndISO, assetClass)}</span>
            </span>
            <span className="text-slate-400">
              Daily+ closes in window: <span className="font-semibold text-emerald-400">{data.totalCloseEventsInHorizon}</span>
            </span>
          </div>

          {/* ── Forward Close Clusters (the money shot) ── */}
          {data.forwardClusters.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold text-slate-300">🔥 Close Cluster Timeline</div>
              <div className="flex flex-wrap gap-2">
                {data.forwardClusters.slice(0, 8).map((cluster, i) => (
                  <ClusterCard
                    key={i}
                    cluster={cluster}
                    isActive={activeClusterLabel === cluster.label}
                    onClick={() => onClusterClick?.(cluster.tfs, cluster.label)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Toggle: Anchor day vs Full schedule ── */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <button
              type="button"
              onClick={() => setShowAnchorDay(true)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                showAnchorDay ? "bg-emerald-500/20 text-emerald-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Closes on Anchor Day ({anchorDayRows.length})
            </button>
            <button
              type="button"
              onClick={() => setShowAnchorDay(false)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                !showAnchorDay ? "bg-cyan-500/20 text-cyan-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Full Schedule ({filteredSchedule.length})
            </button>

            {!showAnchorDay && (
              <div className="ml-auto flex gap-1 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                {(["all", "daily", "weekly", "monthly", "yearly"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`shrink-0 whitespace-nowrap rounded px-2 py-1 text-[10px] font-medium uppercase ${
                      filter === f ? "bg-slate-700 text-slate-100" : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Table ── */}
          {showAnchorDay ? (
            <AnchorDayTable rows={anchorDayRows} assetClass={assetClass} />
          ) : (
            <FullScheduleTable rows={filteredSchedule} assetClass={assetClass} />
          )}
        </>
      )}

      {loading && !data && (
        <div className="py-8 text-center text-xs text-slate-500">Computing forward close schedule…</div>
      )}
    </section>
  );
}

// ── Sub-components ──

function ClusterCard({ cluster, isActive, onClick }: { cluster: ForwardCloseCluster; isActive?: boolean; onClick?: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
      className={`cursor-pointer rounded-xl border px-3 py-2 transition-all ${
        isActive
          ? 'border-emerald-400/60 bg-emerald-500/15 ring-1 ring-emerald-400/30'
          : clusterScoreColor(cluster.clusterScore)
      } hover:ring-1 hover:ring-slate-500/40`}
    >
      <div className="text-[11px] font-semibold text-slate-100">{cluster.label}</div>
      <div className="mt-0.5 flex flex-wrap gap-1">
        {cluster.tfs.map((tf) => (
          <span key={tf} className="rounded bg-slate-800/60 px-1.5 py-0.5 text-[10px] font-semibold text-slate-200">
            {tf}
          </span>
        ))}
      </div>
      <div className="mt-1 text-[10px] text-slate-400">
        Wt {Math.round(cluster.weight)} • Score {cluster.clusterScore}
      </div>
    </div>
  );
}

function AnchorDayTable({ rows, assetClass }: { rows: ForwardCloseScheduleRow[]; assetClass: AssetClass }) {
  if (rows.length === 0) {
    return <div className="py-6 text-center text-xs text-slate-500">No daily+ timeframes close on the anchor day.</div>;
  }

  // Group by category
  const groups = new Map<string, ForwardCloseScheduleRow[]>();
  for (const row of rows) {
    const cat = row.category;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(row);
  }

  const catOrder = ["intraday", "daily", "weekly", "monthly", "yearly"];

  return (
    <div className="space-y-3">
      {catOrder.map((cat) => {
        const catRows = groups.get(cat);
        if (!catRows || catRows.length === 0) return null;
        return (
          <div key={cat}>
            <div className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${categoryColor(cat)}`}>
              {cat}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="pb-1.5 pr-3 font-medium">TF</th>
                    <th className="pb-1.5 pr-3 font-medium">Close Time</th>
                    <th className="pb-1.5 pr-3 font-medium">In</th>
                    <th className="pb-1.5 font-medium">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {catRows.map((row) => (
                    <tr key={row.tf} className={`border-b border-slate-800/50 ${categoryBg(cat)}`}>
                      <td className={`py-1.5 pr-3 font-semibold ${categoryColor(cat)}`}>{row.tf}</td>
                      <td className="py-1.5 pr-3 font-mono text-slate-300">
                        {row.firstCloseAtISO ? formatDate(row.firstCloseAtISO, assetClass) : "—"}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-slate-400">
                        {formatMinsShort(row.minsToFirstClose)}
                      </td>
                      <td className="py-1.5 text-slate-500">{row.weight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FullScheduleTable({ rows, assetClass }: { rows: ForwardCloseScheduleRow[]; assetClass: AssetClass }) {
  if (rows.length === 0) {
    return <div className="py-6 text-center text-xs text-slate-500">No closes in selected range.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
            <th className="pb-1.5 pr-3 font-medium">TF</th>
            <th className="pb-1.5 pr-3 font-medium">Category</th>
            <th className="pb-1.5 pr-3 font-medium">Next Close</th>
            <th className="pb-1.5 pr-3 font-medium">In</th>
            <th className="pb-1.5 pr-3 font-medium">Closes in Window</th>
            <th className="pb-1.5 pr-3 font-medium">On Anchor Day</th>
            <th className="pb-1.5 font-medium">Weight</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.tf} className={`border-b border-slate-800/50 ${row.closesOnAnchorDay ? categoryBg(row.category) : ""}`}>
              <td className={`py-1.5 pr-3 font-semibold ${categoryColor(row.category)}`}>{row.tf}</td>
              <td className="py-1.5 pr-3">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${categoryBg(row.category)} ${categoryColor(row.category)}`}>
                  {row.category}
                </span>
              </td>
              <td className="py-1.5 pr-3 font-mono text-slate-300">
                {row.firstCloseAtISO ? formatDate(row.firstCloseAtISO, assetClass) : "—"}
              </td>
              <td className="py-1.5 pr-3 font-mono text-slate-400">
                {formatMinsShort(row.minsToFirstClose)}
              </td>
              <td className="py-1.5 pr-3 text-center font-semibold text-slate-200">{row.closesInHorizon}</td>
              <td className="py-1.5 pr-3 text-center">
                {row.closesOnAnchorDay ? (
                  <span className="inline-block rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">YES</span>
                ) : (
                  <span className="text-slate-600">—</span>
                )}
              </td>
              <td className="py-1.5 text-slate-500">{row.weight}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
