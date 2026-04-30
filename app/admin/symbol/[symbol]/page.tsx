"use client";

import { use, useEffect, useState } from "react";
import AdminResearchVerdictPanel from "@/components/admin/AdminResearchVerdictPanel";
import AdminEvidenceStack from "@/components/admin/AdminEvidenceStack";
import AdminResearchScoreBreakdown from "@/components/admin/AdminResearchScoreBreakdown";
import AdminScenarioMap from "@/components/admin/AdminScenarioMap";
import AdminARCAPanel from "@/components/admin/AdminARCAPanel";
import AdminJournalDNAPanel from "@/components/admin/AdminJournalDNAPanel";
import AdminResearchDeltaPanel from "@/components/admin/AdminResearchDeltaPanel";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";
import type { InternalResearchScore, SetupDefinition } from "@/lib/admin/adminTypes";
import type { DataTruth } from "@/lib/engines/dataTruth";
import { computeResearchDelta } from "@/lib/admin/researchDelta";

type SymbolResponse = AdminSymbolIntelligence & {
  research?: {
    dataTruth: DataTruth;
    score: InternalResearchScore;
    setup: SetupDefinition;
  };
  researchPacket?: Record<string, unknown>;
};

export default function SymbolResearchTerminalPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: rawSymbol } = use(params);
  const symbol = decodeURIComponent(rawSymbol).toUpperCase();

  const [market, setMarket] = useState<string>("CRYPTO");
  const [timeframe, setTimeframe] = useState<string>("15m");
  const [data, setData] = useState<SymbolResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [thesis, setThesis] = useState<string>("");
  const [whyNow, setWhyNow] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/symbol/${encodeURIComponent(symbol)}?market=${market}&timeframe=${timeframe}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as SymbolResponse;
      if (json?.researchPacket && typeof window !== "undefined") {
        const key = `msp:research-packet:${symbol}:${market}:${timeframe}`;
        const prevRaw = localStorage.getItem(key);
        const prev = prevRaw ? JSON.parse(prevRaw) : null;
        const next = json.researchPacket as Record<string, any>;
        const nextNotes = Array.isArray(next?.internalResearchScore?.notes) ? next.internalResearchScore.notes : [];
        const nextRisks = Array.isArray(next?.trapDetection?.reasons) ? next.trapDetection.reasons : [];
        const delta = computeResearchDelta({
          previous: prev,
          current: {
            score: Number(next.trustAdjustedScore || next.internalResearchScore?.score || 0),
            trustAdjustedScore: Number(next.trustAdjustedScore || 0),
            lifecycle: String(next.lifecycle || "UNKNOWN"),
            dataTrustScore: Number(next.dataTrustScore || 0),
            evidence: nextNotes,
            contradictionFlags: Array.isArray(next.contradictionFlags) ? next.contradictionFlags : [],
            risks: nextRisks,
            macroContext: next.macroContext,
            newsContext: next.newsContext,
            earningsContext: next.earningsContext,
            volatilityState: next.volatilityState,
            timeConfluence: next.timeConfluence,
            optionsIntelligence: next.optionsIntelligence,
          },
        });
        (json as SymbolResponse & { _delta?: ReturnType<typeof computeResearchDelta> })._delta = delta;
        localStorage.setItem(
          key,
          JSON.stringify({
            score: Number(next.trustAdjustedScore || 0),
            trustAdjustedScore: Number(next.trustAdjustedScore || 0),
            lifecycle: String(next.lifecycle || "UNKNOWN"),
            dataTrustScore: Number(next.dataTrustScore || 0),
            evidence: nextNotes,
            contradictionFlags: Array.isArray(next.contradictionFlags) ? next.contradictionFlags : [],
            risks: nextRisks,
            macroContext: next.macroContext,
            newsContext: next.newsContext,
            earningsContext: next.earningsContext,
            volatilityState: next.volatilityState,
            timeConfluence: next.timeConfluence,
            optionsIntelligence: next.optionsIntelligence,
          }),
        );
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load symbol intelligence");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, market, timeframe]);

  async function saveResearchCase() {
    if (!data?.research) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch("/api/admin/research-cases", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: data.symbol,
          market,
          timeframe,
          bias: data.bias,
          setupType: data.research.setup.type,
          score: data.research.score.score,
          lifecycle: data.research.score.lifecycle,
          dataTrustScore: data.research.dataTruth.trustScore,
          dataTruthStatus: data.research.dataTruth.status,
          thesis,
          whyNow,
          invalidation: data.targets?.invalidation ? `Close beyond ${data.targets.invalidation}` : null,
          evidenceAxes: data.research.score.axes,
          penalties: data.research.score.penalties,
          boosts: data.research.score.boosts,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setSaveStatus(`Saved (#${body.id})`);
      setThesis("");
      setWhyNow("");
    } catch (e) {
      setSaveStatus(e instanceof Error ? `Failed: ${e.message}` : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: "1rem 1.25rem", color: "#E5E7EB", maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>Symbol Research Terminal</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.75rem" }}>
          <select value={market} onChange={(e) => setMarket(e.target.value)} style={selectStyle}>
            <option value="CRYPTO">Crypto</option>
            <option value="EQUITIES">Equities</option>
          </select>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} style={selectStyle}>
            <option value="5m">5m</option>
            <option value="15m">15m</option>
            <option value="1h">1h</option>
            <option value="4h">4h</option>
            <option value="1d">1d</option>
          </select>
          <button onClick={load} disabled={loading} style={{
            padding: "0.4rem 0.9rem", borderRadius: "0.4rem",
            background: "#10B981", color: "#0F172A", border: "none",
            fontWeight: 700, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1,
          }}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <p style={{ fontSize: "0.7rem", color: "#9CA3AF", margin: 0 }}>
        Internal research only. No broker execution. No order routing. No position sizing for clients.
      </p>

      {error && (
        <div style={{
          padding: "0.75rem 1rem", borderRadius: "0.5rem",
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          color: "#FCA5A5", fontSize: "0.8rem",
        }}>
          {error}
        </div>
      )}

      {data?.research && (
        <>
          <AdminResearchVerdictPanel
            symbol={data.symbol}
            timeframe={timeframe}
            market={market}
            bias={data.bias}
            setup={data.research.setup}
            score={data.research.score}
            dataTruth={data.research.dataTruth}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <AdminEvidenceStack axes={data.research.score.axes} dominant={data.research.score.dominantAxis} />
            <AdminResearchScoreBreakdown score={data.research.score} />
          </div>

          <AdminScenarioMap snapshot={data} setup={data.research.setup} />

          <AdminJournalDNAPanel
            symbol={data.symbol}
            market={market}
            timeframe={timeframe}
            bias={data.bias}
            setupType={data.research.setup.type}
            score={data.research.score.score}
          />

          <AdminARCAPanel
            context={(data.researchPacket as Record<string, any> | undefined)?.arcaContext || {
              symbol: data.symbol,
              market,
              timeframe,
              bias: data.bias,
              setup: data.research.setup.type,
              score: {
                score: data.research.score.trustAdjustedScore,
                lifecycle: data.research.score.lifecycle,
                axes: data.research.score.axes,
                dominantAxis: data.research.score.dominantAxis,
              },
              dataTruth: {
                status: data.research.dataTruth.status,
                trustScore: data.research.dataTruth.trustScore,
              },
              packet: {
                trustAdjustedScore: data.research.score.trustAdjustedScore,
                scoreDecayReason: data.research.score.scoreDecayReason,
                contradictionFlags: [],
                nextResearchChecks: [],
                invalidationConditions: [],
                trapRiskScore: 0,
              },
            }}
          />

          {(data as SymbolResponse & { _delta?: Parameters<typeof AdminResearchDeltaPanel>[0]["delta"] })._delta && (
            <AdminResearchDeltaPanel
              delta={(data as SymbolResponse & { _delta?: Parameters<typeof AdminResearchDeltaPanel>[0]["delta"] })._delta!}
            />
          )}

          {/* Save Research Case */}
          <div style={{
            background: "rgba(17,24,39,0.6)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "0.75rem", padding: "1rem 1.25rem",
          }}>
            <div style={{
              fontSize: "0.7rem", color: "#9CA3AF", textTransform: "uppercase",
              letterSpacing: "0.06em", marginBottom: "0.75rem", fontWeight: 700,
            }}>
              Save Research Case
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <textarea
                value={thesis}
                onChange={(e) => setThesis(e.target.value)}
                placeholder="Thesis: what's the research story?"
                rows={3}
                style={textareaStyle}
              />
              <textarea
                value={whyNow}
                onChange={(e) => setWhyNow(e.target.value)}
                placeholder="Why now? What confluence or trigger?"
                rows={3}
                style={textareaStyle}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={saveResearchCase} disabled={saving} style={{
                padding: "0.5rem 1rem", borderRadius: "0.4rem",
                background: "#3B82F6", color: "#fff", border: "none",
                fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.6 : 1,
              }}>
                {saving ? "Saving…" : "Save Research Case"}
              </button>
              {saveStatus && (
                <span style={{
                  fontSize: "0.75rem",
                  color: saveStatus.startsWith("Failed") ? "#FCA5A5" : "#86EFAC",
                }}>
                  {saveStatus}
                </span>
              )}
              <span style={{ fontSize: "0.65rem", color: "#6B7280", marginLeft: "auto" }}>
                Persists snapshot of score, axes, penalties, boosts, and notes — not a trade.
              </span>
            </div>
          </div>
        </>
      )}

      {!data?.research && !loading && !error && (
        <div style={{ padding: "2rem", textAlign: "center", color: "#6B7280", fontSize: "0.85rem" }}>
          No research artifact returned for this symbol on this timeframe.
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: "#0F172A", color: "#E5E7EB",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.4rem",
  padding: "0.4rem 0.6rem", fontSize: "0.8rem",
};

const textareaStyle: React.CSSProperties = {
  background: "#0F172A", color: "#E5E7EB",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.4rem",
  padding: "0.5rem 0.7rem", fontSize: "0.8rem", fontFamily: "inherit",
  resize: "vertical",
};
