"use client";

/**
 * /admin/portfolio-lab/journal
 *
 * Full ARCA decision journal with type + symbol filter.
 */
import React, { useCallback, useEffect, useState } from "react";

interface Entry {
  id: string; createdAt: string; journalType: string;
  title: string; symbol: string | null; reasoning: string | null;
  evidence: unknown[]; contradictionEvidence: unknown[];
  bearCase: string | null; dataFreshness: string | null;
  sourcePacketIds: string[]; lessons: string | null;
}

const TYPES = ["", "ENTRY", "EXIT", "UPDATE", "REVIEW", "ERROR", "OVERRIDE", "REJECTED", "RISK_BLOCK"];

export default function PortfolioLabJournalPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [type, setType] = useState("");
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (type) params.set("types", type);
      if (symbol.trim()) params.set("symbol", symbol.trim().toUpperCase());
      const r = await fetch("/api/admin/portfolio-lab/journal?" + params.toString(), { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setEntries(j?.data?.journal ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [type, symbol]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", color: "#E2E8F0", padding: 24 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", letterSpacing: 1.5, textTransform: "uppercase" }}>SIMULATED · NO BROKER</div>
            <h1 style={{ fontSize: 22, color: "#F8FAFC", margin: "4px 0" }}>ARCA Decision Journal</h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Symbol filter" style={{ background: "#111827", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", fontSize: 13, width: 140 }} />
            <select value={type} onChange={(e) => setType(e.target.value)} style={{ background: "#111827", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}>
              {TYPES.map((t) => <option key={t} value={t}>{t || "all types"}</option>)}
            </select>
            <button onClick={load} disabled={loading} style={{ padding: "8px 14px", background: "transparent", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>{loading ? "Loading…" : "Reload"}</button>
          </div>
        </div>
        {error && <div style={{ background: "#7F1D1D", color: "#FCA5A5", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>Error: {error}</div>}
        {entries.length === 0 ? (
          <div style={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 24, color: "#64748B", textAlign: "center", fontSize: 13 }}>{loading ? "Loading…" : "No journal entries."}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {entries.map((e) => (
              <div key={e.id} style={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748B", marginBottom: 4 }}>
                  <span><b style={{ color: journalColor(e.journalType) }}>{e.journalType}</b>{e.symbol ? ` · ${e.symbol}` : ""}{e.dataFreshness ? ` · ${e.dataFreshness}` : ""}</span>
                  <span>{new Date(e.createdAt).toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 14, color: "#F8FAFC", fontWeight: 600 }}>{e.title}</div>
                {e.reasoning && <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 6, whiteSpace: "pre-wrap" }}>{e.reasoning}</div>}
                {e.bearCase && <div style={{ fontSize: 12, color: "#FCA5A5", marginTop: 6 }}><b>Bear case:</b> {e.bearCase}</div>}
                {e.lessons && <div style={{ fontSize: 12, color: "#A7F3D0", marginTop: 6 }}><b>Lessons:</b> {e.lessons}</div>}
                {(e.evidence?.length > 0 || e.contradictionEvidence?.length > 0) && (
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 6 }}>
                    {e.evidence?.length > 0 && <>evidence: {e.evidence.length} item(s)  </>}
                    {e.contradictionEvidence?.length > 0 && <>contradiction: {e.contradictionEvidence.length} item(s)  </>}
                    {e.sourcePacketIds?.length > 0 && <>· source packets: {e.sourcePacketIds.length}</>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function journalColor(t: string): string {
  if (t === "ENTRY") return "#10B981";
  if (t === "EXIT") return "#3B82F6";
  if (t === "REJECTED") return "#FB923C";
  if (t === "RISK_BLOCK") return "#F87171";
  if (t === "ERROR") return "#F87171";
  if (t === "OVERRIDE") return "#FACC15";
  return "#94A3B8";
}
