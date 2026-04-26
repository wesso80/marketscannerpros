"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminCard from "@/components/admin/shared/AdminCard";
import SectionTitle from "@/components/admin/shared/SectionTitle";
import StatusPill from "@/components/admin/shared/StatusPill";

type ScannerHit = {
  symbol: string;
  bias: "LONG" | "SHORT" | "NEUTRAL";
  regime: string;
  permission: "GO" | "WAIT" | "BLOCK";
  confidence: number;
  symbolTrust: number;
  sizeMultiplier: number;
  playbook?: string;
  blockReasons?: string[];
};

type MorningCatalyst = {
  ticker: string;
  source: string;
  headline: string;
  catalystSubtype?: string | null;
  eventTimestampEt?: string | null;
};

type MorningBrief = {
  generatedAt: string;
  market: string;
  timeframe: string;
  deskState: "TRADE" | "WAIT" | "DEFENSIVE" | "BLOCK";
  headline: string;
  operatorNote: string;
  topPlays: ScannerHit[];
  watchlist: ScannerHit[];
  avoidList: ScannerHit[];
  catalysts: MorningCatalyst[];
  risk: {
    openExposure: number;
    dailyDrawdown: number;
    correlationRisk: number;
    maxPositions: number;
    activePositions: number;
    killSwitchActive: boolean;
    permission: string;
    sizeMultiplier: number;
  };
  learning: {
    totalSignals: number;
    labeled: number;
    pending: number;
    accuracyRate: number | null;
    briefFeedbackTotal: number;
    briefFeedbackByAction: Record<string, number>;
  };
  health: {
    scanner: string;
    feed: string;
    api: string;
    errorsCount?: number;
    symbolsScanned?: number;
    lastScanAt?: string;
  };
  nextImprovements: string[];
};

type FeedbackAction = "taken" | "ignored" | "missed" | "worked" | "failed" | "invalidated";

const feedbackActions: Array<{ action: FeedbackAction; label: string; tone: "green" | "yellow" | "red" | "blue" | "neutral" }> = [
  { action: "taken", label: "Taken", tone: "green" },
  { action: "ignored", label: "Ignored", tone: "neutral" },
  { action: "missed", label: "Missed", tone: "yellow" },
  { action: "worked", label: "Worked", tone: "green" },
  { action: "failed", label: "Failed", tone: "red" },
  { action: "invalidated", label: "Invalidated", tone: "red" },
];

function stateTone(state: MorningBrief["deskState"]): "green" | "yellow" | "red" | "blue" {
  if (state === "TRADE") return "green";
  if (state === "DEFENSIVE") return "yellow";
  if (state === "BLOCK") return "red";
  return "blue";
}

function permissionTone(permission: string): "green" | "yellow" | "red" | "neutral" {
  if (permission === "GO" || permission === "TRADE" || permission === "ALLOW") return "green";
  if (permission === "BLOCK") return "red";
  if (permission === "WAIT") return "yellow";
  return "neutral";
}

function authHeaders() {
  const secret = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : null;
  return secret ? { Authorization: `Bearer ${secret}` } : undefined;
}

export default function MorningBriefPage() {
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<Record<string, string>>({});
  const [savingFeedback, setSavingFeedback] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/morning-brief", { headers: authHeaders(), cache: "no-store" });
      if (!res.ok) throw new Error(`Brief failed (${res.status})`);
      const data = await res.json();
      setBrief(data.brief);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load morning brief");
    } finally {
      setLoading(false);
    }
  };

  const sendNow = async () => {
    setSending(true);
    setEmailStatus(null);
    try {
      const res = await fetch("/api/jobs/email-morning-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authHeaders() ?? {}) },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Email failed (${res.status})`);
      const data = await res.json();
      setEmailStatus(`Sent to ${data.recipients?.join(", ") || "configured recipients"}`);
      if (data.brief) setBrief(data.brief);
    } catch (err) {
      setEmailStatus(err instanceof Error ? err.message : "Unable to send email");
    } finally {
      setSending(false);
    }
  };

  const markFeedback = async (play: ScannerHit, action: FeedbackAction) => {
    if (!brief) return;
    const key = `${play.symbol}:${action}`;
    setSavingFeedback(key);
    try {
      const res = await fetch("/api/admin/morning-brief/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authHeaders() ?? {}) },
        body: JSON.stringify({
          briefId: brief.generatedAt.slice(0, 10),
          symbol: play.symbol,
          action,
          market: brief.market,
          timeframe: brief.timeframe,
          permission: play.permission,
          bias: play.bias,
          playbook: play.playbook,
          confidence: play.confidence,
          snapshot: play,
        }),
      });
      if (!res.ok) throw new Error(`Feedback failed (${res.status})`);
      setFeedbackStatus((current) => ({ ...current, [play.symbol]: action }));
      setBrief((current) => current ? {
        ...current,
        learning: {
          ...current.learning,
          briefFeedbackTotal: current.learning.briefFeedbackTotal + 1,
          briefFeedbackByAction: {
            ...current.learning.briefFeedbackByAction,
            [action]: (current.learning.briefFeedbackByAction[action] ?? 0) + 1,
          },
        },
      } : current);
    } catch (err) {
      setEmailStatus(err instanceof Error ? err.message : "Unable to save feedback");
    } finally {
      setSavingFeedback(null);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const generated = useMemo(() => {
    if (!brief?.generatedAt) return "Not generated";
    return new Date(brief.generatedAt).toLocaleString();
  }, [brief?.generatedAt]);

  if (loading && !brief) {
    return <main className="min-h-screen p-6 text-white">Building morning brief...</main>;
  }

  return (
    <main className="min-h-screen bg-[#0F172A] p-6 text-white">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {brief ? <StatusPill label={brief.deskState} tone={stateTone(brief.deskState)} /> : null}
            <StatusPill label="Daily Email Armed" tone="purple" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">Morning Trading Brief</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Private pre-session command sheet: risk permission, best plays, watchlist, catalyst risk, and the next learning improvements.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={refresh} className="rounded-md border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-400/40">
            Refresh Brief
          </button>
          <button onClick={sendNow} disabled={sending} className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">
            {sending ? "Sending..." : "Email Now"}
          </button>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
      {emailStatus ? <div className="mb-4 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-200">{emailStatus}</div> : null}

      {brief ? (
        <>
          <section className="mb-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <AdminCard>
              <div className="text-xs uppercase tracking-[0.18em] text-emerald-300">Generated {generated}</div>
              <div className="mt-3 text-2xl font-black text-white">{brief.headline}</div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{brief.operatorNote}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusPill label={`${brief.market} ${brief.timeframe}`} tone="blue" />
                <StatusPill label={`${brief.health.symbolsScanned ?? 0} scanned`} tone="neutral" />
                <StatusPill label={`${brief.health.errorsCount ?? 0} scan errors`} tone={(brief.health.errorsCount ?? 0) > 0 ? "yellow" : "green"} />
              </div>
            </AdminCard>

            <AdminCard title="Risk Permission">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Metric label="Permission" value={brief.risk.killSwitchActive ? "BLOCK" : brief.risk.permission} tone={permissionTone(brief.risk.permission)} />
                <Metric label="Size" value={`${brief.risk.sizeMultiplier.toFixed(2)}x`} />
                <Metric label="Drawdown" value={`${(brief.risk.dailyDrawdown * 100).toFixed(1)}%`} />
                <Metric label="Correlation" value={`${(brief.risk.correlationRisk * 100).toFixed(0)}%`} />
                <Metric label="Positions" value={`${brief.risk.activePositions}/${brief.risk.maxPositions}`} />
                <Metric label="Learning" value={brief.learning.accuracyRate == null ? "Building" : `${brief.learning.accuracyRate.toFixed(1)}%`} />
                <Metric label="Brief Labels" value={String(brief.learning.briefFeedbackTotal ?? 0)} />
              </div>
            </AdminCard>
          </section>

          <section className="mb-5 grid gap-4 xl:grid-cols-3">
            <AdminCard className="xl:col-span-2">
              <SectionTitle title="Best Plays" subtitle="GO candidates only. Confirm trigger, invalidation, catalyst risk, and exposure before action." />
              <div className="space-y-3">
                {brief.topPlays.length > 0 ? brief.topPlays.map((play) => (
                  <PlayCard
                    key={play.symbol}
                    play={play}
                    feedback={feedbackStatus[play.symbol]}
                    savingFeedback={savingFeedback}
                    onFeedback={markFeedback}
                  />
                )) : <EmptyState text="No green-lit candidates. That is useful information." />}
              </div>
            </AdminCard>

            <AdminCard>
              <SectionTitle title="Watch, Do Not Chase" subtitle="Candidates with structure, but not enough permission yet." />
              <div className="space-y-2">
                {brief.watchlist.length > 0 ? brief.watchlist.slice(0, 8).map((play) => (
                  <CompactPlay key={play.symbol} play={play} feedback={feedbackStatus[play.symbol]} onFeedback={markFeedback} />
                )) : <EmptyState text="No WAIT candidates worth attention." />}
              </div>
            </AdminCard>
          </section>

          <section className="mb-5 grid gap-4 xl:grid-cols-2">
            <AdminCard>
              <SectionTitle title="News And Catalyst Risk" subtitle="Fresh catalyst events found for the scanned symbols." />
              <div className="space-y-3">
                {brief.catalysts.length > 0 ? brief.catalysts.map((event, index) => (
                  <div key={`${event.ticker}-${index}`} className="rounded-md border border-white/10 bg-slate-950/40 p-3">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="font-black text-white">{event.ticker}</span>
                      <span className="text-xs text-slate-500">{event.source}</span>
                    </div>
                    <div className="text-sm leading-5 text-slate-300">{event.headline}</div>
                    {event.catalystSubtype ? <div className="mt-2 text-xs uppercase tracking-wide text-amber-300">{event.catalystSubtype}</div> : null}
                  </div>
                )) : <EmptyState text="No fresh symbol catalysts found in the current scan window." />}
              </div>
            </AdminCard>

            <AdminCard>
              <SectionTitle title="Keep Making This Better" subtitle="Trader-brain improvements I would want next while using this daily." />
              <div className="mb-4 grid grid-cols-3 gap-2 text-xs">
                {feedbackActions.map((item) => (
                  <div key={item.action} className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                    <div className="text-slate-500">{item.label}</div>
                    <div className="mt-1 text-lg font-black text-white">{brief.learning.briefFeedbackByAction?.[item.action] ?? 0}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {brief.nextImprovements.map((item) => (
                  <div key={item} className="rounded-md border border-emerald-500/15 bg-emerald-500/5 p-3 text-sm leading-5 text-emerald-100">
                    {item}
                  </div>
                ))}
              </div>
            </AdminCard>
          </section>
        </>
      ) : null}
    </main>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "green" | "yellow" | "red" | "neutral" }) {
  const color = tone === "green" ? "text-emerald-300" : tone === "yellow" ? "text-amber-300" : tone === "red" ? "text-red-300" : "text-white";
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/40 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-black ${color}`}>{value}</div>
    </div>
  );
}

function PlayCard({
  play,
  feedback,
  savingFeedback,
  onFeedback,
}: {
  play: ScannerHit;
  feedback?: string;
  savingFeedback: string | null;
  onFeedback: (play: ScannerHit, action: FeedbackAction) => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-4 transition hover:border-emerald-400/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-black text-white">{play.symbol}</div>
          <div className="mt-1 text-sm text-slate-400">{play.playbook || "No playbook"}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill label={play.permission} tone={permissionTone(play.permission)} />
          <StatusPill label={`${play.confidence}%`} tone="green" />
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
        <Metric label="Bias" value={play.bias} />
        <Metric label="Regime" value={String(play.regime)} />
        <Metric label="Trust" value={`${play.symbolTrust}%`} />
        <Metric label="Size" value={`${play.sizeMultiplier.toFixed(2)}x`} />
      </div>
      {play.blockReasons?.length ? <div className="mt-3 text-xs text-amber-300">Watch: {play.blockReasons.slice(0, 2).join(", ")}</div> : null}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        <Link href={`/admin/terminal/${encodeURIComponent(play.symbol)}`} className="rounded-md border border-sky-400/30 px-3 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-400/10">
          Open Terminal
        </Link>
        {feedbackActions.map((item) => (
          <button
            key={item.action}
            onClick={() => onFeedback(play, item.action)}
            disabled={savingFeedback === `${play.symbol}:${item.action}`}
            className={`rounded-md border px-3 py-1.5 text-xs font-bold ${feedback === item.action ? "border-emerald-400 bg-emerald-400/15 text-emerald-200" : "border-white/10 text-slate-300 hover:border-emerald-400/30"}`}
          >
            {savingFeedback === `${play.symbol}:${item.action}` ? "Saving" : item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CompactPlay({ play, feedback, onFeedback }: { play: ScannerHit; feedback?: string; onFeedback: (play: ScannerHit, action: FeedbackAction) => void }) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/40 p-3 hover:border-sky-400/30">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/admin/terminal/${encodeURIComponent(play.symbol)}`}>
          <div className="font-black text-white">{play.symbol}</div>
          <div className="text-xs text-slate-500">{play.playbook || play.regime}</div>
        </Link>
        <StatusPill label={`${play.confidence}%`} tone="blue" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["ignored", "missed", "worked", "failed"] as FeedbackAction[]).map((action) => (
          <button
            key={action}
            onClick={() => onFeedback(play, action)}
            className={`rounded border px-2 py-1 text-[11px] font-bold capitalize ${feedback === action ? "border-emerald-400 bg-emerald-400/15 text-emerald-200" : "border-white/10 text-slate-400 hover:border-emerald-400/30"}`}
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-400">{text}</div>;
}