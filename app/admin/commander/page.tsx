"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminCard from "@/components/admin/shared/AdminCard";
import SectionTitle from "@/components/admin/shared/SectionTitle";
import StatusPill from "@/components/admin/shared/StatusPill";

type Tone = "green" | "yellow" | "red" | "blue" | "purple" | "neutral";

type ScannerHit = {
  symbol: string;
  bias: "LONG" | "SHORT" | "NEUTRAL";
  regime: string;
  permission: "GO" | "WAIT" | "BLOCK";
  confidence: number;
  sizeMultiplier: number;
  playbook?: string;
};

type CommanderBrief = {
  generatedAt: string;
  market: string;
  timeframe: string;
  deskState: "TRADE" | "WAIT" | "DEFENSIVE" | "BLOCK";
  headline: string;
  topPlays: ScannerHit[];
  watchlist: ScannerHit[];
  commander: {
    permission: string;
    primaryAction: string;
    topSymbols: string[];
    maxRiskLine: string;
    scenarioFocus: string;
    reviewFocus: string;
    blocks: string[];
  };
  risk: {
    equity: number;
    dailyPnl: number;
    openRiskUsd: number;
    exposureUsd: number;
    dailyDrawdown: number;
    correlationRisk: number;
    activePositions: number;
    maxPositions: number;
    source: string;
  };
  riskGovernor: {
    mode: "NORMAL" | "THROTTLED" | "DEFENSIVE" | "LOCKED";
    maxTradesToday: number;
    tradesUsedToday: number;
    remainingTrades: number;
    maxRiskPerTradePct: number;
    maxRiskPerTradeUsd: number;
    dailyStopUsd: number;
    portfolioHeatLimitUsd: number;
    currentHeatUsd: number;
    lockouts: string[];
    instructions: string[];
  };
  outcomeGrade: {
    grade: "A" | "B" | "C" | "D" | "INC";
    summary: string;
    totalR: number;
    totalPl: number;
    unreviewed: number;
  };
  expectancy: {
    sampleTrades: number;
    notes: string[];
  };
  scenarioTree: Array<{
    symbol: string;
    bias: string;
    baseCase: string;
    bullishPath: string;
    bearishPath: string;
    chopPath: string;
    confirmation: string;
    invalidation: string;
    riskAdjustment: string;
  }>;
};

function authHeaders() {
  const secret = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : null;
  return secret ? { Authorization: `Bearer ${secret}` } : undefined;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2 }).format(value || 0);
}

function stateTone(value: string): Tone {
  if (value === "TRADE" || value === "NORMAL" || value === "GO") return "green";
  if (value === "DEFENSIVE" || value === "WAIT") return "yellow";
  if (value === "BLOCK" || value === "LOCKED") return "red";
  if (value === "THROTTLED") return "blue";
  return "neutral";
}

export default function CommanderPage() {
  const [brief, setBrief] = useState<CommanderBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/morning-brief?scanLimit=20", { headers: authHeaders(), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Commander refresh failed (${res.status})`);
      setBrief(data.brief);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load commander view");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const generated = useMemo(() => {
    if (!brief?.generatedAt) return "Not generated";
    return new Date(brief.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [brief?.generatedAt]);

  if (loading && !brief) {
    return <main className="min-h-screen bg-[#0F172A] p-6 text-white">Loading commander...</main>;
  }

  return (
    <main className="min-h-screen bg-[#0F172A] p-6 text-white">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            {brief ? <StatusPill label={brief.commander.permission} tone={stateTone(brief.commander.permission)} /> : null}
            {brief ? <StatusPill label={brief.riskGovernor.mode} tone={stateTone(brief.riskGovernor.mode)} /> : null}
            {brief ? <StatusPill label={`${brief.market} ${brief.timeframe}`} tone="blue" /> : null}
          </div>
          <h1 className="text-3xl font-black tracking-tight">Admin Commander</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Private trading screen for the session: permission, risk budget, top candidates, scenario paths, and review focus.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/morning-brief" className="rounded-md border border-white/10 px-4 py-2 text-sm font-bold text-slate-200 hover:border-sky-400/40">Full Brief</Link>
          <button onClick={refresh} disabled={loading} className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}

      {brief ? (
        <>
          <section className="mb-5 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <AdminCard>
              <div className="mb-2 text-xs uppercase tracking-[0.18em] text-emerald-300">Generated {generated}</div>
              <div className="text-2xl font-black text-white">{brief.headline}</div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Rule title="Primary Action" value={brief.commander.primaryAction} tone="green" />
                <Rule title="Risk Line" value={brief.commander.maxRiskLine} tone={brief.riskGovernor.mode === "LOCKED" ? "red" : "blue"} />
                <Rule title="Scenario Focus" value={brief.commander.scenarioFocus} tone="yellow" />
                <Rule title="Review Focus" value={brief.commander.reviewFocus} tone="blue" />
              </div>
            </AdminCard>

            <AdminCard>
              <SectionTitle title="Risk Box" subtitle="Hard limits for this session." />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Metric label="Trades Left" value={`${brief.riskGovernor.remainingTrades}/${brief.riskGovernor.maxTradesToday}`} tone={brief.riskGovernor.remainingTrades > 0 ? "green" : "red"} />
                <Metric label="Risk / Idea" value={money(brief.riskGovernor.maxRiskPerTradeUsd)} />
                <Metric label="Daily P&L" value={money(brief.risk.dailyPnl)} tone={brief.risk.dailyPnl >= 0 ? "green" : "red"} />
                <Metric label="Open Risk" value={money(brief.risk.openRiskUsd)} />
                <Metric label="Drawdown" value={`${(brief.risk.dailyDrawdown * 100).toFixed(1)}%`} tone={brief.risk.dailyDrawdown >= 0.02 ? "yellow" : "green"} />
                <Metric label="Correlation" value={`${(brief.risk.correlationRisk * 100).toFixed(0)}%`} tone={brief.risk.correlationRisk >= 0.65 ? "yellow" : "green"} />
              </div>
            </AdminCard>
          </section>

          <section className="mb-5 grid gap-4 xl:grid-cols-[1fr_1.1fr]">
            <AdminCard>
              <SectionTitle title="Top Plays" subtitle="Only act if the scenario confirms and risk box allows it." />
              <div className="space-y-3">
                {brief.topPlays.length > 0 ? brief.topPlays.slice(0, 3).map((play) => <PlayRow key={play.symbol} play={play} />) : <Empty text="No GO plays. Cash is a valid position." />}
              </div>
            </AdminCard>

            <AdminCard>
              <SectionTitle title="Watch Queue" subtitle="Do not chase these without permission improving." />
              <div className="space-y-3">
                {brief.watchlist.length > 0 ? brief.watchlist.slice(0, 5).map((play) => <PlayRow key={play.symbol} play={play} compact />) : <Empty text="No WAIT candidates worth attention." />}
              </div>
            </AdminCard>
          </section>

          <section className="mb-5">
            <AdminCard>
              <SectionTitle title="Scenario Tree" subtitle="The decision paths for the candidates that matter now." />
              <div className="grid gap-3 xl:grid-cols-2">
                {brief.scenarioTree.length > 0 ? brief.scenarioTree.slice(0, 4).map((scenario) => (
                  <div key={scenario.symbol} className="rounded-md border border-white/10 bg-slate-950/40 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-lg font-black text-white">{scenario.symbol}</div>
                        <div className="text-xs text-slate-500">{scenario.baseCase}</div>
                      </div>
                      <StatusPill label={scenario.bias} tone="blue" />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <Rule title="Bull" value={scenario.bullishPath} tone="green" />
                      <Rule title="Bear" value={scenario.bearishPath} tone="red" />
                      <Rule title="Chop" value={scenario.chopPath} tone="yellow" />
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <Rule title="Confirm" value={scenario.confirmation} tone="blue" />
                      <Rule title="Invalid" value={scenario.invalidation} tone="yellow" />
                      <Rule title="Risk" value={scenario.riskAdjustment} tone={brief.riskGovernor.mode === "LOCKED" ? "red" : "green"} />
                    </div>
                  </div>
                )) : <Empty text="No scenario tree until a candidate clears the scan." />}
              </div>
            </AdminCard>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <AdminCard>
              <SectionTitle title="Yesterday Grade" subtitle="Brief outcome versus labels and journal closes." />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Metric label="Grade" value={brief.outcomeGrade.grade} tone={brief.outcomeGrade.grade === "A" || brief.outcomeGrade.grade === "B" ? "green" : brief.outcomeGrade.grade === "INC" ? "yellow" : "red"} />
                <Metric label="Total R" value={brief.outcomeGrade.totalR.toFixed(2)} tone={brief.outcomeGrade.totalR >= 0 ? "green" : "red"} />
                <Metric label="P&L" value={money(brief.outcomeGrade.totalPl)} tone={brief.outcomeGrade.totalPl >= 0 ? "green" : "red"} />
                <Metric label="Unreviewed" value={String(brief.outcomeGrade.unreviewed)} tone={brief.outcomeGrade.unreviewed > 0 ? "yellow" : "green"} />
              </div>
              <div className="mt-3 rounded-md border border-white/10 bg-slate-950/40 p-3 text-sm leading-6 text-slate-300">{brief.outcomeGrade.summary}</div>
            </AdminCard>

            <AdminCard>
              <SectionTitle title="Expectancy" subtitle="Journal sample feeding today's filter." />
              <Metric label="Closed Sample" value={String(brief.expectancy.sampleTrades)} tone={brief.expectancy.sampleTrades >= 10 ? "green" : "yellow"} />
              <div className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
                {brief.expectancy.notes.map((note) => <div key={note} className="rounded border border-white/10 bg-slate-950/40 p-2">{note}</div>)}
              </div>
            </AdminCard>

            <AdminCard>
              <SectionTitle title="Stand-Down Rules" subtitle="Do not override these during the session." />
              <div className="space-y-2 text-sm leading-5 text-red-100">
                {brief.commander.blocks.slice(0, 6).map((block) => <div key={block} className="rounded-md border border-red-500/15 bg-red-500/5 p-3">{block}</div>)}
              </div>
            </AdminCard>
          </section>
        </>
      ) : null}
    </main>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: Tone }) {
  const color = tone === "green" ? "text-emerald-300" : tone === "yellow" ? "text-amber-300" : tone === "red" ? "text-red-300" : tone === "blue" ? "text-sky-300" : "text-white";
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/40 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-black ${color}`}>{value}</div>
    </div>
  );
}

function Rule({ title, value, tone }: { title: string; value: string; tone: "green" | "yellow" | "red" | "blue" }) {
  const color = tone === "green" ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-100" : tone === "yellow" ? "border-amber-500/20 bg-amber-500/5 text-amber-100" : tone === "red" ? "border-red-500/20 bg-red-500/5 text-red-100" : "border-sky-500/20 bg-sky-500/5 text-sky-100";
  return (
    <div className={`rounded-md border p-3 ${color}`}>
      <div className="mb-1 text-xs uppercase tracking-wide opacity-70">{title}</div>
      <div className="text-sm font-semibold leading-5">{value}</div>
    </div>
  );
}

function PlayRow({ play, compact = false }: { play: ScannerHit; compact?: boolean }) {
  return (
    <Link href={`/admin/terminal/${encodeURIComponent(play.symbol)}`} className="block rounded-md border border-white/10 bg-slate-950/40 p-3 hover:border-emerald-400/35">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-lg font-black text-white">{play.symbol}</div>
          <div className="text-xs text-slate-500">{play.playbook || play.regime}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill label={play.permission} tone={stateTone(play.permission)} />
          <StatusPill label={`${play.confidence}%`} tone="blue" />
        </div>
      </div>
      {!compact ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <Metric label="Bias" value={play.bias} />
          <Metric label="Size" value={`${play.sizeMultiplier.toFixed(2)}x`} />
          <Metric label="Regime" value={String(play.regime)} />
        </div>
      ) : null}
    </Link>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-md border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-400">{text}</div>;
}