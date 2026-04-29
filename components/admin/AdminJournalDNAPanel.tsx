"use client";

/**
 * Phase 7 — Journal DNA panel for the canonical Symbol Research page.
 *
 * Fetches /api/admin/journal-learning with the current symbol's setup
 * context, renders matched pattern groups + the recommended journal
 * boost. Read-only research surface.
 */

import { useEffect, useState } from "react";
import type {
  JournalDNASummary,
  JournalPatternBoost,
} from "@/lib/engines/journalLearning";

interface Props {
  symbol: string;
  market: string;
  timeframe: string;
  bias: string;
  setupType: string;
  score: number;
}

function authHeaders(): HeadersInit {
  const secret = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : null;
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

export default function AdminJournalDNAPanel(props: Props) {
  const [summary, setSummary] = useState<JournalDNASummary | null>(null);
  const [boost, setBoost] = useState<JournalPatternBoost | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const url =
          `/api/admin/journal-learning?symbol=${encodeURIComponent(props.symbol)}` +
          `&market=${encodeURIComponent(props.market)}&timeframe=${encodeURIComponent(props.timeframe)}` +
          `&bias=${encodeURIComponent(props.bias)}&setup=${encodeURIComponent(props.setupType)}` +
          `&score=${encodeURIComponent(String(props.score))}`;
        const res = await fetch(url, { credentials: "include", headers: authHeaders() });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || `HTTP ${res.status}`);
          return;
        }
        setSummary(data.summary || null);
        setBoost(data.boost || null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.symbol, props.market, props.timeframe, props.bias, props.setupType, props.score]);

  return (
    <div className="rounded-xl border border-white/10 bg-[#0F172A]/60 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-white">Journal DNA</h3>
        <span className="text-[10px] uppercase tracking-wider text-white/40">
          Pattern memory · {summary?.totalCases ?? 0} cases
        </span>
      </div>

      {loading && <p className="text-xs text-white/45">Mining journal patterns…</p>}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {summary && !loading && (
        <>
          {boost && (
            <div className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              <strong>Pattern match boost +{boost.weight}</strong> — {boost.reason}
            </div>
          )}
          {summary.matches.length === 0 ? (
            <p className="text-xs text-white/45">
              No prior research cases match this setup × market × bias yet.
            </p>
          ) : (
            <div className="space-y-2">
              {summary.matches.map((m) => (
                <div
                  key={m.group.key}
                  className={`rounded-md border px-3 py-2 text-xs ${
                    m.inScoreBand
                      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-100"
                      : "border-white/10 bg-white/5 text-white/70"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{m.group.setupType}</span>
                    <span className="font-mono">
                      {m.group.count} cases · avg {m.group.avgScore}
                    </span>
                  </div>
                  <div className="mt-0.5 text-white/55">
                    {m.group.market} · {m.group.bias} · fit {(m.fit * 100).toFixed(0)}%
                    {m.group.lastSeenAt ? ` · last ${m.group.lastSeenAt.slice(0, 10)}` : ""}
                  </div>
                  {m.group.sampleSymbols.length > 0 && (
                    <div className="mt-0.5 truncate text-white/40">
                      {m.group.sampleSymbols.join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
