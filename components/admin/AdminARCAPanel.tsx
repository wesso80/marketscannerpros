"use client";

/**
 * Phase 6 — ARCA Admin Research Copilot panel
 *
 * Mounts on the canonical Symbol Research Terminal. Lets the operator
 * pick one of 9 research modes; auto-binds the bound score + evidence
 * + data truth context; renders the validated ArcaAdminResearchOutput.
 *
 * Boundary disclaimer is rendered above the panel and is part of the
 * displayed output (the classification field).
 */

import { useState } from "react";
import {
  ARCA_ADMIN_MODES,
  ARCA_MODE_LABELS,
  type ArcaAdminContext,
  type ArcaAdminMode,
  type ArcaAdminResearchOutput,
} from "@/lib/admin/arcaTypes";
import AdminBiasCheckPanel from "@/components/admin/AdminBiasCheckPanel";

interface Props {
  context: ArcaAdminContext;
}

function authHeaders(): HeadersInit {
  const secret = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : null;
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

export default function AdminARCAPanel({ context }: Props) {
  const [mode, setMode] = useState<ArcaAdminMode>("ATTENTION_NOW");
  const [output, setOutput] = useState<ArcaAdminResearchOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true);
    setError("");
    setOutput(null);
    try {
      const res = await fetch("/api/admin/arca", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({ mode, context }),
      });
      const data = await res.json();
      if (!res.ok || !data?.output) {
        setError(data?.error || "ARCA call failed");
        return;
      }
      setOutput(data.output as ArcaAdminResearchOutput);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ARCA call failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[#0F172A]/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-white">ARCA — Admin Research Copilot</h3>
          <p className="mt-0.5 text-[11px] uppercase tracking-wider text-amber-300/80">
            Internal research analysis only — not broker execution
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as ArcaAdminMode)}
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white"
          >
            {ARCA_ADMIN_MODES.map((m) => (
              <option key={m} value={m}>
                {ARCA_MODE_LABELS[m]}
              </option>
            ))}
          </select>
          <button
            onClick={run}
            disabled={loading}
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50"
          >
            {loading ? "Thinking…" : "Ask ARCA"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {output && (
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-white/45">Headline</div>
            <p className="mt-0.5 text-white">{output.headline}</p>
          </div>
          {output.reasoning.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-white/45">Reasoning</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-white/80">
                {output.reasoning.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {output.evidence.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-white/45">Evidence</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-emerald-200/85">
                {output.evidence.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {output.risks.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-white/45">Risks / Counter-Thesis</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-200/85">
                {output.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[10px] uppercase tracking-wider text-white/30">
            Classification: {output.classification}
          </p>
        </div>
      )}

      {!output && !error && !loading && (
        <p className="text-xs text-white/45">
          Pick a mode and click Ask ARCA. ARCA is grounded only in the current Admin Research Packet context.
        </p>
      )}

      <div className="mt-3">
        <AdminBiasCheckPanel />
      </div>
    </div>
  );
}
