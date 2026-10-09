"use client";

import { useState } from "react";
import SectionTitle from "@/components/admin/shared/SectionTitle";
import AdminCard from "@/components/admin/shared/AdminCard";
import { RESEARCH_READ_PATHS } from "@/lib/admin/researchReadKey";

/**
 * Research export: with your own admin session, reads every endpoint on the research-key allowlist (GET only) and
 * downloads one JSON file to hand to an agent (Claude, Codex) for review. Nothing is changed or stored server-side.
 * Optional symbols run the live Symbol scan (uses Alpha Vantage quota), so they are capped at five.
 */

type Entry = { path: string; status: number | null; ok: boolean; fetchedAt: string; durationMs: number; truncated: boolean; body: unknown };

const MAX_BODY_CHARS = 2_000_000;
const MAX_SYMBOLS = 5;
const CONCURRENCY = 3;

async function readOne(path: string): Promise<Entry> {
  const started = Date.now();
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(path, { method: "GET", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(60_000) });
    let text = await res.text();
    const truncated = text.length > MAX_BODY_CHARS;
    if (truncated) text = text.slice(0, MAX_BODY_CHARS);
    let body: unknown = text;
    if (!truncated) { try { body = JSON.parse(text); } catch { /* keep text */ } }
    return { path, status: res.status, ok: res.ok, fetchedAt, durationMs: Date.now() - started, truncated, body };
  } catch (err) {
    return { path, status: null, ok: false, fetchedAt, durationMs: Date.now() - started, truncated: false, body: { error: err instanceof Error ? err.name : "request failed" } };
  }
}

export default function ResearchExportPage() {
  const [symbols, setSymbols] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);

  const symbolList = symbols.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9.\-]{1,20}$/.test(s)).slice(0, MAX_SYMBOLS);

  async function run() {
    const paths = [...RESEARCH_READ_PATHS, ...symbolList.map((s) => `/api/admin/symbol/${encodeURIComponent(s)}`)];
    setRunning(true); setDone([]); setTotal(paths.length);
    const results: Entry[] = [];
    let next = 0;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (next < paths.length) {
        const p = paths[next++];
        const entry = await readOne(p);
        results.push(entry);
        setDone([...results]);
      }
    }));
    results.sort((a, b) => a.path.localeCompare(b.path));
    const bundle = {
      kind: "msp-admin-research-export",
      version: 1,
      generatedAt: new Date().toISOString(),
      origin: window.location.origin,
      note: "Private admin data for research review only. Not for publication. Each entry carries its own fetch time; check source and freshness fields inside each body.",
      symbols: symbolList,
      summary: { endpoints: results.length, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).map((r) => `${r.path} (${r.status ?? "no response"})`) },
      endpoints: results,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `msp-research-export-${bundle.generatedAt.replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setRunning(false);
  }

  const failed = done.filter((d) => !d.ok);
  return (
    <div className="p-4 space-y-4">
      <SectionTitle title="Research Export" />
      <AdminCard title="Download admin data for review">
        <div className="space-y-3 text-sm text-white/70">
          <p>
            Reads {RESEARCH_READ_PATHS.size} admin data endpoints with your session (read only: scanner and Symbol analysis, signal
            outcomes and backtests, paper portfolio and journal, health and data sources) and downloads one JSON file. Nothing is
            changed or saved on the server.
          </p>
          <p className="text-amber-300/80">
            The file contains private admin data, including your paper and journal records. Share it only with your own Claude or
            Codex session, never publicly.
          </p>
          <label className="block">
            <span className="text-white/60">Optional symbols for a live Symbol scan (up to {MAX_SYMBOLS}, uses Alpha Vantage quota):</span>
            <input
              value={symbols}
              onChange={(e) => setSymbols(e.target.value)}
              placeholder="e.g. SPY, NVDA, BTCUSD"
              className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-white"
              disabled={running}
            />
          </label>
          <button
            type="button"
            onClick={run}
            disabled={running}
            className="rounded bg-emerald-600 px-3 py-2 font-semibold text-white disabled:opacity-50"
          >
            {running ? `Reading… ${done.length}/${total}` : "Download research export"}
          </button>
          {!running && done.length > 0 && (
            <p data-export-result>
              Downloaded: {done.length - failed.length} of {done.length} endpoints read.
              {failed.length > 0 && <> Failed: {failed.map((f) => `${f.path} (${f.status ?? "no response"})`).join(", ")}.</>}
            </p>
          )}
        </div>
      </AdminCard>
    </div>
  );
}
