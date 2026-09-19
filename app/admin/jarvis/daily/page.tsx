"use client";

/**
 * MSP RADAR — DAILY MARKET INTELLIGENCE — private owner archive page.
 * Lives under /admin (middleware-gated, admin session / secret) rather than /jarvis so it can never be reached publicly.
 * Every figure comes from the persisted jarvis_daily_reports row for the selected session; nothing is recomputed client-side.
 */
import { useCallback, useEffect, useState } from "react";
import AdminCard from "@/components/admin/shared/AdminCard";
import SectionTitle from "@/components/admin/shared/SectionTitle";
import StatusPill from "@/components/admin/shared/StatusPill";
import type { ArchiveRow, CandidateRow, DailyReport, EmailStatus, HealthStatus, LifecycleTransition, MoverLine, NextMoveRow, ThemeRow } from "@/lib/jarvis/report/types";

type Payload = { sessionDate: string; runId: string | null; reportVersion: number; status: string; healthStatus: HealthStatus; headline: string; generatedAt: string; emailStatus: EmailStatus; emailSentAt: string | null; report: DailyReport; nav: { previous: string | null; next: string | null } };

function authHeaders(): HeadersInit {
  const secret = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : null;
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}
const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const pct = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);
const lvl = (v: number | null) => (v === null ? "n/a" : v >= 1 ? v.toFixed(2) : v.toPrecision(4));
const healthTone = (h: HealthStatus) => (h === "NORMAL" ? "green" : h === "DEGRADED" ? "yellow" : "red");
const emailTone = (e: EmailStatus) => (e === "SENT" ? "green" : e === "FAILED" ? "red" : e === "SUPPRESSED_HEALTH" || e === "NO_RECIPIENT" ? "yellow" : "neutral");
const extTone = (x: string) => (x === "EARLY" ? "green" : x === "MID" ? "blue" : x === "EXTENDED" ? "yellow" : "neutral");
const btn: React.CSSProperties = { padding: "0.35rem 0.75rem", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#E5E7EB", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" };
const muted: React.CSSProperties = { color: "#94A3B8", fontSize: "0.75rem" };
const th: React.CSSProperties = { textAlign: "left", padding: "0.35rem 0.5rem", color: "#94A3B8", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid rgba(255,255,255,0.1)" };
const td: React.CSSProperties = { padding: "0.4rem 0.5rem", fontSize: "0.8rem", verticalAlign: "top", borderBottom: "1px solid rgba(255,255,255,0.05)" };

export default function JarvisDailyPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [archive, setArchive] = useState<ArchiveRow[]>([]);
  const [archiveDays, setArchiveDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showHealth, setShowHealth] = useState(false);

  const load = useCallback(async (date?: string | null) => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/admin/jarvis/daily${date ? `?date=${date}` : ""}`, { credentials: "include", headers: authHeaders(), cache: "no-store" });
      const json = await res.json();
      if (!res.ok) { setError(json?.error || `HTTP ${res.status}`); setData(null); return; }
      setData(json);
      if (typeof window !== "undefined") { const u = new URL(window.location.href); u.searchParams.set("date", json.sessionDate); window.history.replaceState(null, "", u.toString()); }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load report"); } finally { setLoading(false); }
  }, []);

  const loadArchive = useCallback(async (limit: number) => {
    try {
      const res = await fetch(`/api/admin/jarvis/daily/archive?limit=${limit}`, { credentials: "include", headers: authHeaders(), cache: "no-store" });
      const json = await res.json();
      if (res.ok) setArchive(json.items ?? []);
    } catch { /* archive is secondary */ }
  }, []);

  useEffect(() => {
    const date = typeof window !== "undefined" ? new URL(window.location.href).searchParams.get("date") : null;
    load(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null);
    loadArchive(archiveDays);
  }, [load, loadArchive, archiveDays]);

  const r = data?.report;
  const failed = r?.status === "FAILED";

  return (
    <div style={{ padding: "1rem 1.25rem", color: "#E5E7EB", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0, letterSpacing: 0.5 }}>MSP RADAR — DAILY MARKET INTELLIGENCE</h1>
          <p style={{ ...muted, margin: "0.25rem 0 0" }}>Private owner archive · built from the persisted overnight run · educational research only, not financial advice.</p>
        </div>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <button style={btn} onClick={() => load(null)}>Today / latest</button>
          <button style={{ ...btn, opacity: data?.nav.previous ? 1 : 0.4 }} disabled={!data?.nav.previous} onClick={() => load(data?.nav.previous)}>‹ Previous</button>
          <button style={{ ...btn, opacity: data?.nav.next ? 1 : 0.4 }} disabled={!data?.nav.next} onClick={() => load(data?.nav.next)}>Next ›</button>
          <button style={{ ...btn, background: archiveDays === 7 ? "#10B981" : btn.background, color: archiveDays === 7 ? "#0F172A" : btn.color }} onClick={() => setArchiveDays(7)}>7-day</button>
          <button style={{ ...btn, background: archiveDays === 30 ? "#10B981" : btn.background, color: archiveDays === 30 ? "#0F172A" : btn.color }} onClick={() => setArchiveDays(30)}>30-day</button>
        </div>
      </div>

      {error && <div style={{ padding: "0.75rem 1rem", borderRadius: 8, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#FCA5A5", marginBottom: "1rem", fontSize: "0.85rem" }}>{error}</div>}
      {loading && !data && <div style={muted}>Loading report…</div>}

      {data && r && (
        <>
          <AdminCard className="mb-4">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              <span style={{ fontSize: "1rem", fontWeight: 700 }}>{fmtDate(data.sessionDate)}</span>
              <StatusPill label={`Run ${data.status}`} tone={healthTone(data.healthStatus)} />
              <StatusPill label={`Health ${data.healthStatus}`} tone={healthTone(data.healthStatus)} />
              <StatusPill label={`Email ${data.emailStatus}`} tone={emailTone(data.emailStatus)} />
              <span style={muted}>run {data.runId ?? "—"} · generated {data.generatedAt.slice(0, 16).replace("T", " ")}Z · report v{data.reportVersion}</span>
            </div>
            <p style={{ margin: "0.6rem 0 0", fontSize: "0.95rem", fontWeight: 600 }}>{r.headline}</p>
            {r.health.status !== "NORMAL" && (
              <div style={{ marginTop: "0.6rem", padding: "0.6rem 0.8rem", borderRadius: 8, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)", color: "#FCD34D", fontSize: "0.8rem" }}>
                <b>DATA HEALTH WARNING:</b> {r.health.summary} · Stage 2 coverage {r.health.stage2CoveragePct ?? "unknown"}% · shortlist may be incomplete: {r.health.shortlistMayBeIncomplete ? "YES" : "no"}
                <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>{r.health.checks.filter((c) => !c.ok).map((c) => <li key={c.name}>{c.name}: {c.detail}</li>)}</ul>
              </div>
            )}
          </AdminCard>

          {!failed && (
            <>
              <Section title="Market in 30 Seconds" subtitle="Regime, leadership, breadth, crypto, macro">
                <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(110px, 160px) 1fr", gap: "0.35rem 0.75rem", fontSize: "0.85rem" }}>
                  {r.marketIn30Seconds.map((l) => <Fragment2 key={l.label} label={l.label} value={l.value} />)}
                </dl>
              </Section>

              <Section title="Look At First Today" subtitle="Where research time is best spent — not trade instructions">
                <ol style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.85rem", lineHeight: 1.5 }}>
                  {r.lookAtFirst.map((a, i) => <li key={i} style={{ marginBottom: "0.3rem" }}><StatusPill label={a.kind} tone={a.kind === "risk" ? "red" : a.kind === "trigger" ? "blue" : a.kind === "crypto" ? "purple" : "green"} /> <b style={{ marginLeft: 6 }}>{a.title}</b> — <span style={{ color: "#CBD5E1" }}>{a.why}</span></li>)}
                  {!r.lookAtFirst.length && <li style={muted}>No priority items surfaced.</li>}
                </ol>
              </Section>

              <Section title="Top Research Candidates" subtitle="Ranked by setup quality, not by move size. Largest mover ≠ best candidate.">
                <CandidatesTable rows={r.candidates} />
              </Section>

              <Section title="What May Move Next" subtitle="Pre-move setups — require confirmation; may never trigger">
                <NextTable rows={r.whatMayMoveNext} />
              </Section>

              <Section title="Lifecycle Changes" subtitle="Persisted watchlist transitions recorded this session">
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.6rem" }}>
                  {Object.entries(r.lifecycle.counts).filter(([, v]) => v > 0).map(([k, v]) => <StatusPill key={k} label={`${k} ${v}`} tone={k === "CONFIRMED_MOVE" ? "green" : k === "NEAR_TRIGGER" ? "blue" : k === "FAILED" || k === "DETERIORATING" ? "red" : k === "EXPIRED" ? "neutral" : "purple"} />)}
                </div>
                <LifecycleList rows={r.lifecycle.transitions} />
              </Section>

              <Section title="Themes & Rotation" subtitle="Genuine group moves vs single-name noise">
                <div style={{ fontSize: "0.85rem", lineHeight: 1.6 }}>
                  <div><b>Leading:</b> {r.themes.equity.leading.join(", ") || "n/a"}</div>
                  <div><b>Improving:</b> <span style={{ color: "#6EE7B7" }}>{r.themes.equity.improving.join(", ") || "none"}</span></div>
                  <div><b>Deteriorating:</b> <span style={{ color: "#FCA5A5" }}>{r.themes.equity.deteriorating.join(", ") || "none"}</span></div>
                  <div style={{ marginTop: "0.4rem" }}><b>Crypto:</b> {r.themes.crypto.context}</div>
                </div>
                <ThemesTable title="Equity groups" rows={r.themes.equity.groups} />
                <ThemesTable title="Crypto groups" rows={r.themes.crypto.groups} />
              </Section>

              <Section title="What Moved" subtitle="Session context — magnitude, not quality">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.75rem" }}>
                  <Movers title="Equity strength" rows={r.whatMoved.equities.strength} />
                  <Movers title="Equity weakness" rows={r.whatMoved.equities.weakness} />
                  <Movers title="Unusual volume" rows={r.whatMoved.equities.unusualVolume} />
                  <Movers title="Gaps" rows={r.whatMoved.equities.gaps} />
                  <Movers title="Breakouts" rows={r.whatMoved.equities.breakouts} />
                  <Movers title="Breakdowns" rows={r.whatMoved.equities.breakdowns} />
                  <Movers title="Crypto movers" rows={r.whatMoved.crypto.movers} />
                  <Movers title="Crypto unusual" rows={r.whatMoved.crypto.unusual} />
                </div>
                <div style={{ ...muted, marginTop: "0.6rem" }}>Equity breadth: {r.whatMoved.equities.breadth} · Crypto: {r.whatMoved.crypto.altBreadth}</div>
                <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem", fontSize: "0.8rem", color: "#CBD5E1" }}>{r.whatMoved.crossAsset.map((l) => <li key={l.label}><b>{l.label}:</b> {l.value}</li>)}</ul>
              </Section>

              <Section title="Rejected Noise" subtitle="Big moves that did not qualify — and why">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>Symbol</th><th style={th}>Class</th><th style={th}>Move</th><th style={th}>Why rejected</th></tr></thead>
                  <tbody>{r.rejected.map((x) => <tr key={x.symbol}><td style={{ ...td, fontWeight: 700 }}>{x.symbol}</td><td style={{ ...td, color: "#94A3B8" }}>{x.assetClass}</td><td style={td}>{x.change}</td><td style={{ ...td, color: "#CBD5E1" }}>{x.detail}</td></tr>)}</tbody>
                </table>
                {!r.rejected.length && <div style={muted}>None.</div>}
              </Section>

              <Section title="Probably Noise" subtitle="Ignore unless something changes">
                <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.85rem", color: "#CBD5E1", lineHeight: 1.5 }}>{r.probablyNoise.map((x, i) => <li key={i}>{x}</li>)}</ul>
                {!r.probablyNoise.length && <div style={muted}>None.</div>}
              </Section>
            </>
          )}

          <AdminCard title="Data / Provider Health" actions={<button style={btn} onClick={() => setShowHealth((s) => !s)}>{showHealth ? "Collapse" : "Expand"}</button>} className="mb-4">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              <StatusPill label={`Stage 2 coverage ${r.dataHealth.coveragePct ?? "n/a"}%`} tone={(r.dataHealth.coveragePct ?? 0) >= 95 ? "green" : "yellow"} />
              <StatusPill label={`AV ${r.dataHealth.alphaVantageCalls} · CG ${r.dataHealth.coingeckoCalls}`} />
              <StatusPill label={`errors ${r.dataHealth.providerErrors}`} tone={r.dataHealth.providerErrors ? "yellow" : "green"} />
              <StatusPill label={`${(r.dataHealth.runtimeMs / 60000).toFixed(1)} min`} />
              {r.dataHealth.peakRssMb !== null && <StatusPill label={`peak RSS ${r.dataHealth.peakRssMb} MB`} />}
            </div>
            {showHealth && (
              <div style={{ marginTop: "0.75rem", fontSize: "0.8rem", lineHeight: 1.6 }}>
                <div>Universe {r.dataHealth.universe} = {r.dataHealth.equities} equities · {r.dataHealth.etfs} ETFs · {r.dataHealth.crypto} crypto · Stage 1 {r.dataHealth.stage1Listed} listed → {r.dataHealth.stage1Quoted} quoted → {r.dataHealth.liquid} liquid · Stage 2 selected {r.dataHealth.stage2Selected ?? "n/a"} / live {r.dataHealth.stage2Live ?? "n/a"} / DB fallback {r.dataHealth.stage2Fallback ?? "n/a"} / missing {r.dataHealth.stage2Missing ?? "n/a"} · deep dives {r.dataHealth.deepDives} · DB queries {r.dataHealth.dbQueries}</div>
                {r.dataHealth.sectorCacheCoverage && <div>Sector cache: {r.dataHealth.sectorCacheCoverage}</div>}
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
                  <thead><tr><th style={th}>Provider</th><th style={th}>Status</th><th style={th}>Detail</th></tr></thead>
                  <tbody>{r.dataHealth.providers.map((p) => <tr key={p.name}><td style={td}>{p.name}</td><td style={td}><StatusPill label={p.status} tone={p.status === "ok" ? "green" : p.status === "degraded" || p.status === "partial" ? "yellow" : p.status === "failed" || p.status === "missing" ? "red" : "neutral"} /></td><td style={{ ...td, color: "#CBD5E1" }}>{p.detail}</td></tr>)}</tbody>
                </table>
                {r.dataHealth.gaps.length > 0 && <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem", color: "#FCD34D" }}>{r.dataHealth.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>}
                <div style={{ marginTop: "0.5rem" }}><b>Health checks</b><ul style={{ margin: "0.2rem 0 0", paddingLeft: "1.1rem" }}>{r.health.checks.map((c) => <li key={c.name} style={{ color: c.ok ? "#CBD5E1" : "#FCA5A5" }}>{c.ok ? "✓" : "✗"} {c.name}: {c.detail}</li>)}</ul></div>
              </div>
            )}
          </AdminCard>

          <AdminCard title={`Archive (last ${archiveDays} reports)`}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Session</th><th style={th}>Headline</th><th style={th}>Run</th><th style={th}>Health</th><th style={th}>Email</th></tr></thead>
              <tbody>{archive.map((a) => <tr key={a.sessionDate} style={{ cursor: "pointer", background: a.sessionDate === data.sessionDate ? "rgba(16,185,129,0.08)" : undefined }} onClick={() => load(a.sessionDate)}>
                <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>{a.sessionDate}</td><td style={{ ...td, color: "#CBD5E1" }}>{a.headline}</td><td style={td}><StatusPill label={a.status} tone={healthTone(a.healthStatus)} /></td><td style={td}><StatusPill label={a.healthStatus} tone={healthTone(a.healthStatus)} /></td><td style={td}><StatusPill label={a.emailStatus} tone={emailTone(a.emailStatus)} /></td></tr>)}</tbody>
            </table>
            {!archive.length && <div style={muted}>No persisted reports yet.</div>}
          </AdminCard>

          <p style={{ ...muted, marginTop: "1rem", textAlign: "center" }}>{r.disclaimer}</p>
        </>
      )}
    </div>
  );
}

function Fragment2({ label, value }: { label: string; value: string }) {
  return (<><dt style={{ color: "#94A3B8", fontWeight: 600 }}>{label}</dt><dd style={{ margin: 0, color: "#E5E7EB" }}>{value}</dd></>);
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (<AdminCard className="mb-4"><SectionTitle title={title} subtitle={subtitle} /><div style={{ marginTop: "0.6rem" }}>{children}</div></AdminCard>);
}

function CandidatesTable({ rows }: { rows: CandidateRow[] }) {
  if (!rows.length) return <div style={muted}>No qualified candidates this session.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
        <thead><tr><th style={th}>#</th><th style={th}>Symbol</th><th style={th}>Setup</th><th style={th}>Score</th><th style={th}>Stage</th><th style={th}>1d / 5d</th><th style={th}>Why surfaced · caveat</th></tr></thead>
        <tbody>{rows.map((c) => (
          <tr key={c.symbol}>
            <td style={td}>{c.rank}</td>
            <td style={{ ...td, fontWeight: 700 }}>{c.symbol}<div style={{ ...muted, fontWeight: 400 }}>{c.name ?? c.assetClass}{c.lifecycle ? ` · ${c.lifecycle}` : ""}</div></td>
            <td style={td}>{c.setupType}</td>
            <td style={{ ...td, color: "#10B981", fontWeight: 700 }}>{c.score}</td>
            <td style={td}><StatusPill label={c.extension} tone={extTone(c.extension)} /></td>
            <td style={td}>{pct(c.ret1)} / {pct(c.ret5)}<div style={muted}>{c.velocity}</div></td>
            <td style={{ ...td, color: "#CBD5E1" }}>{c.whySurfaced}{c.caveat && <div style={{ color: "#FCD34D" }}>Caveat: {c.caveat}</div>}{c.catalyst && <div style={muted}>Catalyst: {c.catalyst}</div>}</td>
          </tr>))}</tbody>
      </table>
    </div>);
}

function NextTable({ rows }: { rows: NextMoveRow[] }) {
  if (!rows.length) return <div style={muted}>No pre-move setups this session.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
        <thead><tr><th style={th}>Symbol</th><th style={th}>Stage</th><th style={th}>Score</th><th style={th}>Trigger</th><th style={th}>Why</th><th style={th}>Confirms / invalidates</th></tr></thead>
        <tbody>{rows.map((n) => (
          <tr key={n.symbol}>
            <td style={{ ...td, fontWeight: 700 }}>{n.symbol}<div style={{ ...muted, fontWeight: 400 }}>{n.assetClass}{n.lifecycle ? ` · ${n.lifecycle}` : ""}</div></td>
            <td style={td}>{n.stage}</td>
            <td style={{ ...td, color: "#10B981", fontWeight: 700 }}>{n.score}</td>
            <td style={td}>{lvl(n.triggerLevel)}{n.distanceToTriggerPct !== null && <div style={muted}>{n.distanceToTriggerPct > 0 ? `${n.distanceToTriggerPct.toFixed(1)}% below` : `${Math.abs(n.distanceToTriggerPct).toFixed(1)}% above`}</div>}</td>
            <td style={{ ...td, color: "#CBD5E1" }}>{n.reasons.join("; ")}</td>
            <td style={{ ...td, color: "#CBD5E1" }}><div><span style={{ color: "#6EE7B7" }}>✓</span> {n.confirmation}</div><div><span style={{ color: "#FCA5A5" }}>✗</span> {n.invalidation}</div></td>
          </tr>))}</tbody>
      </table>
    </div>);
}

function LifecycleList({ rows }: { rows: LifecycleTransition[] }) {
  if (!rows.length) return <div style={muted}>No lifecycle transitions recorded for this session.</div>;
  return (
    <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.85rem", lineHeight: 1.55 }}>
      {rows.map((t, i) => <li key={`${t.symbol}-${i}`}><b>{t.symbol}</b> <span style={muted}>({t.assetClass})</span>: {t.from ?? "new"} → <b style={{ color: t.to === "CONFIRMED_MOVE" ? "#6EE7B7" : t.to === "FAILED" || t.to === "DETERIORATING" ? "#FCA5A5" : "#E5E7EB" }}>{t.to}</b> <span style={{ color: "#CBD5E1" }}>— {t.note}</span></li>)}
    </ul>);
}

function ThemesTable({ title, rows }: { title: string; rows: ThemeRow[] }) {
  if (!rows.length) return null;
  return (
    <div style={{ marginTop: "0.75rem", overflowX: "auto" }}>
      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#94A3B8", marginBottom: "0.3rem" }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
        <thead><tr><th style={th}>Theme</th><th style={th}>Up</th><th style={th}>Median</th><th style={th}>Verdict</th><th style={th}>Early</th><th style={th}>Extended</th></tr></thead>
        <tbody>{rows.map((g) => <tr key={g.name}><td style={{ ...td, fontWeight: 600 }}>{g.name}</td><td style={td}>{g.up}/{g.members} ({g.pctUp}%)</td><td style={td}>{g.medianMove}</td><td style={td}><StatusPill label={g.verdict.replace(/_/g, " ").toLowerCase()} tone={g.verdict === "GENUINE_GROUP_MOVE" ? "green" : g.verdict === "MIXED" ? "yellow" : "neutral"} /><div style={muted}>{g.confirmation}</div></td><td style={{ ...td, color: "#6EE7B7" }}>{g.early.join(", ") || "—"}</td><td style={{ ...td, color: "#FCD34D" }}>{g.extended.join(", ") || "—"}</td></tr>)}</tbody>
      </table>
    </div>);
}

function Movers({ title, rows }: { title: string; rows: MoverLine[] }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#94A3B8", marginBottom: "0.3rem" }}>{title}</div>
      {rows.length ? <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.8rem", lineHeight: 1.5 }}>{rows.map((m) => <li key={m.symbol}><b>{m.symbol}</b> {m.change} <span style={{ color: "#94A3B8" }}>{m.detail}</span></li>)}</ul> : <div style={muted}>none</div>}
    </div>);
}
