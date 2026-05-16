"use client";

/**
 * app/admin/command/page.tsx — Commander Mode.
 *
 * No-noise decision screen. Ten panels. No charts.
 * Admin-only.
 */

import { useEffect, useState } from "react";
import type { CommanderModeSnapshot } from "@/lib/admin/arca-brain/types";

const PANEL_BG = "#0F172A";
const CARD_BG = "#111827";
const BORDER = "#1F2937";
const GREEN = "#10B981";
const RED = "#EF4444";
const AMBER = "#F59E0B";
const MUTED = "#94A3B8";
const TEXT = "#F8FAFC";

function Panel({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "ok" | "warn" | "danger" }) {
  const accent = tone === "danger" ? RED : tone === "warn" ? AMBER : GREEN;
  return (
    <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${accent}`, padding: 16, borderRadius: 6 }}>
      <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 14, color: TEXT }}>{children}</div>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{children}</span>;
}

export default function CommandModePage() {
  const [snap, setSnap] = useState<CommanderModeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/commander-mode", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "request failed");
        setSnap(null);
      } else {
        setError(null);
        setSnap(json.snapshot as CommanderModeSnapshot);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: PANEL_BG, color: TEXT, padding: 24, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>COMMAND MODE</h1>
        <div style={{ fontSize: 12, color: MUTED }}>
          {snap ? `as of ${new Date(snap.generatedAt).toLocaleTimeString()}` : loading ? "loading…" : "—"}
          {snap && (
            <>
              {" · freshness "}
              <Mono>{snap.freshness.overall}</Mono>
              {" · evidence "}
              <Mono>{snap.evidenceQualityScore}</Mono>
              {" · confidence "}
              <Mono>{snap.confidence}</Mono>
            </>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: "#3F1D1D", border: `1px solid ${RED}`, color: RED, padding: 12, marginBottom: 16, borderRadius: 6 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
        <Panel label="1. Best trade now" tone="ok">
          {snap?.bestTradeNow ? (
            <>
              <Mono>{snap.bestTradeNow.side}</Mono> <Mono>{snap.bestTradeNow.symbol}</Mono> · entry{" "}
              <Mono>{snap.bestTradeNow.entry}</Mono> · stop <Mono>{snap.bestTradeNow.stop}</Mono>
              {snap.bestTradeNow.takeProfit && <> · target <Mono>{snap.bestTradeNow.takeProfit}</Mono></>}
              <div style={{ marginTop: 8, color: MUTED, fontSize: 12 }}>
                Confidence {snap.bestTradeNow.confidence}/100 · Info edge {snap.bestTradeNow.informationEdgeBand ?? "—"} · debate {snap.bestTradeNow.debateDecision}
              </div>
              <div style={{ marginTop: 6, fontSize: 12 }}>
                <strong>What confirms:</strong> {snap.bestTradeNow.whatConfirms}
              </div>
              <div style={{ marginTop: 4, fontSize: 12 }}>
                <strong>What invalidates:</strong> {snap.bestTradeNow.whatInvalidates}
              </div>
              <div style={{ marginTop: 4, fontSize: 12 }}>
                <strong>Main risk:</strong> {snap.bestTradeNow.mainRisk}
              </div>
            </>
          ) : (
            <span style={{ color: MUTED }}>no actionable candidate</span>
          )}
        </Panel>

        <Panel label="2. Best long now">
          {snap?.bestLongNow ? (
            <>
              <Mono>{snap.bestLongNow.symbol}</Mono> · entry <Mono>{snap.bestLongNow.entry}</Mono> · stop{" "}
              <Mono>{snap.bestLongNow.stop}</Mono>
              <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>{snap.bestLongNow.reasoning}</div>
            </>
          ) : (
            <span style={{ color: MUTED }}>no qualifying long</span>
          )}
        </Panel>

        <Panel label="3. Best short now">
          {snap?.bestShortNow ? (
            <>
              <Mono>{snap.bestShortNow.symbol}</Mono> · entry <Mono>{snap.bestShortNow.entry}</Mono> · stop{" "}
              <Mono>{snap.bestShortNow.stop}</Mono>
              <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>{snap.bestShortNow.reasoning}</div>
            </>
          ) : (
            <span style={{ color: MUTED }}>no qualifying short</span>
          )}
        </Panel>

        <Panel label="4. Strongest no-trade warning" tone="warn">
          {snap?.strongestNoTradeWarning ? (
            <>
              <Mono>{snap.strongestNoTradeWarning.symbol}</Mono> · severity{" "}
              <Mono>{snap.strongestNoTradeWarning.severity}</Mono>
              <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>{snap.strongestNoTradeWarning.reason}</div>
            </>
          ) : (
            <span style={{ color: MUTED }}>no significant warning</span>
          )}
        </Panel>

        <Panel label="5. Highest-risk open position" tone="danger">
          {snap?.highestRiskOpenPosition ? (
            <>
              <Mono>{snap.highestRiskOpenPosition.symbol}</Mono> · open R{" "}
              <Mono>{snap.highestRiskOpenPosition.openR.toFixed(2)}</Mono>
              <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>{snap.highestRiskOpenPosition.reason}</div>
            </>
          ) : (
            <span style={{ color: MUTED }}>no open positions</span>
          )}
        </Panel>

        <Panel label="6. Biggest change since last cycle">
          {snap?.biggestChange ? (
            <>
              <Mono>{snap.biggestChange.symbol}</Mono> — {snap.biggestChange.what}
              <div style={{ color: MUTED, fontSize: 12 }}>{snap.biggestChange.magnitude}</div>
            </>
          ) : (
            <span style={{ color: MUTED }}>no notable change</span>
          )}
        </Panel>

        <Panel label="7. What ARCA is waiting for">
          {snap && snap.arcaIsWaitingFor.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {snap.arcaIsWaitingFor.map((w, i) => (
                <li key={i}>
                  <Mono>{w.symbol}</Mono> — {w.trigger}
                </li>
              ))}
            </ul>
          ) : (
            <span style={{ color: MUTED }}>nothing pending</span>
          )}
        </Panel>

        <Panel label="8. What ARCA refuses to touch" tone="warn">
          {snap && snap.arcaWillNotTouch.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {snap.arcaWillNotTouch.map((w, i) => (
                <li key={i}>
                  <Mono>{w.symbol}</Mono> — {w.reason}
                </li>
              ))}
            </ul>
          ) : (
            <span style={{ color: MUTED }}>no rejections in window</span>
          )}
        </Panel>

        <Panel label="9. Data freshness" tone={snap?.freshness.overall === "stale" ? "danger" : snap?.freshness.overall === "delayed" ? "warn" : "ok"}>
          <Mono>{snap?.freshness.overall ?? "unknown"}</Mono>
          <ul style={{ margin: "6px 0 0 0", paddingLeft: 18, color: MUTED, fontSize: 12 }}>
            {snap?.freshness.sources.map((s, i) => (
              <li key={i}>
                {s.name}: <Mono>{s.status}</Mono>
                {s.ageSeconds != null && <> · {s.ageSeconds}s</>}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel label="10. Today's doctrine warning" tone="warn">
          {snap?.doctrineWarningToday ? (
            <>
              <Mono>{snap.doctrineWarningToday.ruleName}</Mono>
              <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>{snap.doctrineWarningToday.warning}</div>
            </>
          ) : (
            <span style={{ color: MUTED }}>no flagged rule today</span>
          )}
        </Panel>
      </div>
    </div>
  );
}
