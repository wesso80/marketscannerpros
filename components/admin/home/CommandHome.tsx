"use client";

/**
 * Admin Command Home
 *
 * Private (admin-only) trading-intelligence command center. Composes the
 * Edge Layer surfaces produced by:
 *   - GET /api/admin/opportunities  (AdminEdgePacket projection)
 *   - GET /api/admin/queue          (Opportunity Command Queue state)
 *   - GET /api/admin/change-tape    (What Changed v2)
 *
 * Hard rules (mirror .claude/ADMIN_TERMINAL.md + .claude rules):
 *   - No execution language. Research-only.
 *   - Every panel surfaces a TruthBadge (source/freshness/simulated).
 *   - Personal exposure is a separate flag, never folded into ranking.
 *   - Engine/queue events are read-only here; manual override happens
 *     via dedicated admin tools.
 *
 * This file intentionally co-locates 8 small visual panels so the
 * composition stays auditable in one place.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminEdgePacket } from "@/lib/admin/edgePacket";
type PersonalExposureFlag = AdminEdgePacket["personalExposureFlag"];
import type { AdminLifecycleState } from "@/lib/admin/lifecycle";
import type { ChangeTapeEvent } from "@/lib/admin/changeTape";
import { TERMINAL_STATES } from "@/lib/admin/lifecycle";

/* ─────────────────── Truth badge ─────────────────── */

interface TruthShape {
  status?: string;
  freshness?: string;
  simulated?: boolean;
  source?: string;
  asOf?: string;
}

function TruthBadge({ truth }: { truth?: TruthShape | null }) {
  if (!truth) {
    return (
      <span style={badgeStyle("#6B7280")}>SOURCE: unknown · stale-unverified</span>
    );
  }
  const fresh = (truth.freshness || truth.status || "unknown").toLowerCase();
  const color =
    fresh === "live" || fresh === "fresh"
      ? "#10B981"
      : fresh === "delayed" || fresh === "degraded"
        ? "#F59E0B"
        : "#EF4444";
  const tag = truth.simulated ? "SIMULATED" : "LIVE";
  return (
    <span style={badgeStyle(color)}>
      {(truth.source || "engine").toUpperCase()} · {fresh} · {tag}
      {truth.asOf ? ` · ${truth.asOf}` : ""}
    </span>
  );
}

function badgeStyle(color: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 6,
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${color}55`,
    color,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.4,
  };
}

/* ─────────────────── Shared card ─────────────────── */

function Card(props: {
  title: string;
  truth?: TruthShape | null;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "#0F172A",
        border: "1px solid #1F2937",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 10,
          gap: 12,
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 700,
              color: "#E5E7EB",
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            {props.title}
          </h3>
          {props.subtitle ? (
            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>
              {props.subtitle}
            </div>
          ) : null}
        </div>
        <TruthBadge truth={props.truth} />
      </header>
      <div>{props.children}</div>
    </section>
  );
}

/* ─────────────────── Panels ─────────────────── */

function MarketStateBar({ packets }: { packets: AdminEdgePacket[] }) {
  const live = packets.filter((p) => p.freshness === "real-time").length;
  const degraded = packets.filter((p) => p.freshness === "delayed").length;
  const stale = packets.length - live - degraded;
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        padding: "10px 14px",
        background: "#0B1220",
        border: "1px solid #1F2937",
        borderRadius: 10,
        fontSize: 12,
        color: "#D1D5DB",
      }}
    >
      <span>
        <strong style={{ color: "#10B981" }}>{live}</strong> live
      </span>
      <span>
        <strong style={{ color: "#F59E0B" }}>{degraded}</strong> degraded
      </span>
      <span>
        <strong style={{ color: "#EF4444" }}>{stale}</strong> stale
      </span>
      <span style={{ color: "#6B7280" }}>·</span>
      <span>{packets.length} packets in scope</span>
    </div>
  );
}

function BestAsymmetryCard({ packets }: { packets: AdminEdgePacket[] }) {
  const best = useMemo(
    () =>
      [...packets]
        .filter((p) => !TERMINAL_STATES.has(p.adminState))
        .sort(
          (a, b) =>
            (b.opportunityRankScore ?? 0) - (a.opportunityRankScore ?? 0)
        )[0],
    [packets]
  );
  if (!best) {
    return (
      <Card title="Best Asymmetry">
        <div style={emptyStyle}>No active asymmetry candidates.</div>
      </Card>
    );
  }
  return (
    <Card
      title="Best Asymmetry"
      subtitle={`${best.symbol} · ${best.market} · ${best.timeframe}`}
      truth={{
        source: best.sources?.[0],
        freshness: best.freshness,
        simulated: best.simulated,
      }}
    >
      <ScoreGrid packet={best} />
      <ExposureFlag flag={best.personalExposureFlag} />
      <p style={paraStyle}>
        <strong style={{ color: "#10B981" }}>Why now: </strong>
        {best.whyNow || "Reasoning unavailable from packet."}
      </p>
      <p style={paraStyle}>
        <strong style={{ color: "#EF4444" }}>Bear case: </strong>
        {best.bearCase || "—"}
      </p>
    </Card>
  );
}

function BiggestChangeCard({ events }: { events: ChangeTapeEvent[] }) {
  const top = events[0];
  if (!top) {
    return (
      <Card title="Biggest Change">
        <div style={emptyStyle}>No tape events in window.</div>
      </Card>
    );
  }
  return (
    <Card
      title="Biggest Change"
      subtitle={`${top.symbol ?? "—"} · ${top.eventType}`}
      truth={{
        source: "change-tape",
        freshness: "real-time",
      }}
    >
      <p style={paraStyle}>
        magnitude {Math.round(top.magnitude)} · evidence{" "}
        {top.evidenceQuality == null ? "—" : Math.round(top.evidenceQuality)}
      </p>
      <div style={{ fontSize: 11, color: "#6B7280" }}>
        {top.observedAt ? new Date(top.observedAt).toLocaleString() : ""}
      </div>
    </Card>
  );
}

function DoNothingBanner({ packets }: { packets: AdminEdgePacket[] }) {
  const blocked = packets.filter((p) => !!p.doNothing);
  if (blocked.length === 0) return null;
  const top = blocked[0].doNothing!;
  return (
    <div
      style={{
        background: "#1F1208",
        border: "1px solid #92400E",
        borderRadius: 10,
        padding: "10px 14px",
        color: "#FCD34D",
        fontSize: 13,
      }}
    >
      <strong>Do-Nothing Engine: </strong>
      {blocked.length} setup{blocked.length === 1 ? "" : "s"} flagged. Top:{" "}
      <strong>{blocked[0].symbol}</strong> — {top.code}: {top.headline}
    </div>
  );
}

function ArcaDeskReadPanel({
  packet,
}: {
  packet: AdminEdgePacket | undefined;
}) {
  const desk = packet?.arcaDeskRead;
  return (
    <Card
      title="ARCA Desk Read"
      subtitle={packet?.symbol}
      truth={{ source: "arca", freshness: packet?.freshness ?? "unknown" }}
    >
      {!desk ? (
        <div style={emptyStyle}>
          Desk read pending. Run ARCA in DESK_READ mode.
        </div>
      ) : (
        <ul style={listStyle}>
          <DeskRow label="Best idea" value={desk.bestIdea} />
          <DeskRow label="Biggest trap" value={desk.biggestTrap} />
          <DeskRow label="What changed" value={desk.whatChanged} />
          <DeskRow label="Ignore" value={desk.whatToIgnore} />
          <DeskRow label="Needs confirm" value={desk.whatNeedsConfirmation} />
          <DeskRow label="Invalidates" value={desk.whatInvalidates} />
          <DeskRow label="Setup age" value={desk.setupAge} />
        </ul>
      )}
    </Card>
  );
}

function DeskRow({ label, value }: { label: string; value: string | null }) {
  return (
    <li style={{ marginBottom: 6 }}>
      <span style={{ color: "#6EE7B7", fontWeight: 600 }}>{label}: </span>
      <span style={{ color: "#E5E7EB" }}>{value || "—"}</span>
    </li>
  );
}

function ChangeTapeStream({ events }: { events: ChangeTapeEvent[] }) {
  return (
    <Card
      title="Change Tape"
      subtitle={`${events.length} events`}
      truth={{ source: "change-tape", freshness: "real-time" }}
    >
      {events.length === 0 ? (
        <div style={emptyStyle}>No tape events in window.</div>
      ) : (
        <ul style={listStyle}>
          {events.slice(0, 12).map((e, idx) => (
            <li key={e.id ?? idx} style={{ marginBottom: 6, fontSize: 13 }}>
              <span style={{ color: "#9CA3AF", marginRight: 6 }}>
                {e.observedAt
                  ? new Date(e.observedAt).toLocaleTimeString()
                  : ""}
              </span>
              <span style={{ color: "#E5E7EB" }}>
                <strong style={{ color: "#60A5FA" }}>
                  {e.symbol ?? "—"}
                </strong>{" "}
                {e.eventType}
              </span>
              <div style={{ color: "#9CA3AF", fontSize: 12 }}>
                magnitude {Math.round(e.magnitude)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function InvalidatedSetupsList({ packets }: { packets: AdminEdgePacket[] }) {
  const dead = packets.filter(
    (p) => p.adminState === "INVALIDATED" || p.adminState === "EXHAUSTED"
  );
  return (
    <Card title="Recently Invalidated" subtitle={`${dead.length} setups`}>
      {dead.length === 0 ? (
        <div style={emptyStyle}>None.</div>
      ) : (
        <ul style={listStyle}>
          {dead.slice(0, 8).map((p) => (
            <li key={p.packetId} style={{ marginBottom: 4, fontSize: 13 }}>
              <strong>{p.symbol}</strong> · {p.adminState} ·{" "}
              <span style={{ color: "#9CA3AF" }}>
                {p.thesisStatus}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function UpcomingTimingWindows({ packets }: { packets: AdminEdgePacket[] }) {
  const top = [...packets]
    .filter((p) => (p.timingScore ?? 0) > 60)
    .sort((a, b) => (b.timingScore ?? 0) - (a.timingScore ?? 0))
    .slice(0, 6);
  return (
    <Card title="Timing Windows" subtitle={`${top.length} ranked by timing`}>
      {top.length === 0 ? (
        <div style={emptyStyle}>No high-timing windows in scope.</div>
      ) : (
        <ul style={listStyle}>
          {top.map((p) => (
            <li key={p.packetId} style={{ marginBottom: 4, fontSize: 13 }}>
              <strong>{p.symbol}</strong> · timing{" "}
              <span style={{ color: "#10B981" }}>
                {Math.round(p.timingScore ?? 0)}
              </span>{" "}
              · {p.timeframe}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AdminCommandQueue({
  packets,
}: {
  packets: AdminEdgePacket[];
}) {
  const ranked = useMemo(
    () =>
      [...packets]
        .filter((p) => !TERMINAL_STATES.has(p.adminState))
        .sort(
          (a, b) =>
            (b.opportunityRankScore ?? 0) - (a.opportunityRankScore ?? 0)
        )
        .slice(0, 12),
    [packets]
  );
  return (
    <Card title="Opportunity Command Queue" subtitle={`${ranked.length} active`}>
      {ranked.length === 0 ? (
        <div style={emptyStyle}>Queue empty.</div>
      ) : (
        <table style={{ width: "100%", fontSize: 12, color: "#E5E7EB" }}>
          <thead>
            <tr style={{ color: "#9CA3AF", textAlign: "left" }}>
              <th style={thStyle}>#</th>
              <th style={thStyle}>Symbol</th>
              <th style={thStyle}>State</th>
              <th style={thStyle}>Rank</th>
              <th style={thStyle}>Evidence</th>
              <th style={thStyle}>Exposure</th>
              <th style={thStyle}>Thesis</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((p, i) => (
              <tr key={p.packetId} style={{ borderTop: "1px solid #1F2937" }}>
                <td style={tdStyle}>{i + 1}</td>
                <td style={tdStyle}>
                  <strong>{p.symbol}</strong>{" "}
                  <span style={{ color: "#6B7280" }}>{p.timeframe}</span>
                </td>
                <td style={tdStyle}>
                  <StatePill state={p.adminState} />
                </td>
                <td style={tdStyle}>{Math.round(p.opportunityRankScore ?? 0)}</td>
                <td style={tdStyle}>
                  {Math.round(p.evidenceQualityScore ?? 0)}
                </td>
                <td style={tdStyle}>
                  <ExposurePill flag={p.personalExposureFlag} />
                </td>
                <td style={tdStyle}>
                  <span style={{ color: "#9CA3AF" }}>{p.thesisStatus}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/* ─────────────────── Inline helpers ─────────────────── */

function ScoreGrid({ packet }: { packet: AdminEdgePacket }) {
  const cells: { label: string; value: number | undefined }[] = [
    { label: "Opp Rank", value: packet.opportunityRankScore },
    { label: "Evidence", value: packet.evidenceQualityScore },
    { label: "Asymm", value: packet.asymmetryScore },
    { label: "Timing", value: packet.timingScore },
    { label: "Vol", value: packet.volatilityScore },
    { label: "Liquidity", value: packet.liquidityScore },
    { label: "Trap Risk", value: packet.trapRiskScore },
    { label: "Invalid Clarity", value: packet.invalidationClarityScore },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
        margin: "8px 0 12px",
      }}
    >
      {cells.map((c) => (
        <div
          key={c.label}
          style={{
            background: "#0B1220",
            border: "1px solid #1F2937",
            borderRadius: 6,
            padding: 6,
          }}
        >
          <div style={{ fontSize: 10, color: "#9CA3AF" }}>{c.label}</div>
          <div style={{ fontSize: 14, color: "#E5E7EB", fontWeight: 700 }}>
            {c.value == null ? "—" : Math.round(c.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatePill({ state }: { state: AdminLifecycleState }) {
  const color =
    state === "PRIME" || state === "TRIGGERED"
      ? "#10B981"
      : state === "INVALIDATED" || state === "EXHAUSTED"
        ? "#EF4444"
        : state === "WATCH" || state === "BUILDING"
          ? "#60A5FA"
          : "#9CA3AF";
  return <span style={badgeStyle(color)}>{state}</span>;
}

function ExposureFlag({ flag }: { flag: PersonalExposureFlag | undefined }) {
  if (!flag || flag === "none") return null;
  return (
    <div
      style={{
        margin: "6px 0 10px",
        padding: "6px 10px",
        background: "#1F0B1A",
        border: "1px solid #831843",
        borderRadius: 6,
        color: "#FBCFE8",
        fontSize: 12,
      }}
    >
      Personal exposure: <strong>{flag}</strong> — does NOT alter ranking.
    </div>
  );
}

function ExposurePill({ flag }: { flag: PersonalExposureFlag | undefined }) {
  if (!flag || flag === "none")
    return <span style={{ color: "#6B7280" }}>—</span>;
  return <span style={badgeStyle("#EC4899")}>{flag}</span>;
}

const emptyStyle: React.CSSProperties = {
  color: "#6B7280",
  fontSize: 13,
  fontStyle: "italic",
};
const paraStyle: React.CSSProperties = {
  margin: "6px 0",
  fontSize: 13,
  color: "#E5E7EB",
  lineHeight: 1.5,
};
const listStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
};
const thStyle: React.CSSProperties = {
  padding: "6px 4px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};
const tdStyle: React.CSSProperties = {
  padding: "6px 4px",
  fontSize: 12,
};

/* ─────────────────── Composition ─────────────────── */

interface FetchState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
  truth?: TruthShape | null;
}

function useTruthFetch<T>(url: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({
    loading: true,
    error: null,
    data: null,
    truth: null,
  });
  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setState({
          loading: false,
          error: body?.error || `HTTP ${res.status}`,
          data: null,
        });
        return;
      }
      setState({
        loading: false,
        error: null,
        data: (body?.data ?? body) as T,
        truth: body?.truth ?? null,
      });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : "fetch failed",
        data: null,
      });
    }
  }, [url]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);
  return state;
}

interface OpportunitiesResponse {
  edgePackets?: AdminEdgePacket[];
}
interface ChangeTapeResponse {
  events?: ChangeTapeEvent[];
}

export default function CommandHome() {
  const opps = useTruthFetch<OpportunitiesResponse>(
    "/api/admin/opportunities"
  );
  const tape = useTruthFetch<ChangeTapeResponse>(
    "/api/admin/change-tape?limit=40"
  );

  const packets = opps.data?.edgePackets ?? [];
  const events = tape.data?.events ?? [];
  const bestPacket = useMemo(
    () =>
      [...packets].sort(
        (a, b) =>
          (b.opportunityRankScore ?? 0) - (a.opportunityRankScore ?? 0)
      )[0],
    [packets]
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0B1220",
        color: "#E5E7EB",
        padding: 20,
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: "#F9FAFB" }}>
            Admin Command Home
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#9CA3AF",
            }}
          >
            Private trading-intelligence terminal · research only · no execution.
          </p>
        </div>
        <nav style={{ display: "flex", gap: 12, fontSize: 13 }}>
          <Link href="/admin/overview" style={navLink}>
            Stats Overview
          </Link>
          <Link href="/admin/daily-brief" style={navLink}>
            Daily Brief
          </Link>
          <Link href="/admin/risk-assessment" style={navLink}>
            Risk Memo
          </Link>
          <Link href="/admin/equity-research" style={navLink}>
            Equity Research
          </Link>
          <Link href="/admin/earnings-analyzer" style={navLink}>
            Earnings
          </Link>
          <Link href="/admin/sector-rotation" style={navLink}>
            Sectors
          </Link>
          <Link href="/admin/quant-screener" style={navLink}>
            Quant
          </Link>
          <Link href="/admin/options-architect" style={navLink}>
            Options
          </Link>
          <Link href="/admin/system" style={navLink}>
            System
          </Link>
          <Link href="/admin/operator-terminal" style={navLink}>
            Operator
          </Link>
          <Link href="/admin/opportunity-board" style={navLink}>
            Board
          </Link>
        </nav>
      </header>

      <MarketStateBar packets={packets} />

      <DoNothingBannerWrap packets={packets} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginTop: 16,
        }}
      >
        <BestAsymmetryCard packets={packets} />
        <BiggestChangeCard events={events} />
      </div>

      <div style={{ marginTop: 16 }}>
        <AdminCommandQueue packets={packets} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginTop: 16,
        }}
      >
        <ArcaDeskReadPanel packet={bestPacket} />
        <ChangeTapeStream events={events} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginTop: 16,
        }}
      >
        <InvalidatedSetupsList packets={packets} />
        <UpcomingTimingWindows packets={packets} />
      </div>

      {(opps.error || tape.error) && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: "#2A0B0B",
            border: "1px solid #7F1D1D",
            borderRadius: 8,
            color: "#FCA5A5",
            fontSize: 12,
          }}
        >
          {opps.error ? <div>opportunities: {opps.error}</div> : null}
          {tape.error ? <div>change-tape: {tape.error}</div> : null}
        </div>
      )}
    </main>
  );
}

function DoNothingBannerWrap({ packets }: { packets: AdminEdgePacket[] }) {
  return (
    <div style={{ marginTop: 12 }}>
      <DoNothingBanner packets={packets} />
    </div>
  );
}

const navLink: React.CSSProperties = {
  color: "#60A5FA",
  textDecoration: "none",
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #1F2937",
};
