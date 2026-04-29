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
  researchSetups: ScannerHit[];
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
    killSwitchActive: boolean;
    permission: string;
    source: "portfolio_journal" | "operator_state" | "fallback";
    lastUpdatedAt?: string | null;
    notes: string[];
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

type CommandState = "GO" | "WAIT" | "BLOCK";

function minutesSince(value?: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 60000));
}

function formatAge(minutes: number | null) {
  if (minutes == null) return "unknown";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

function sourceLabel(source: CommanderBrief["risk"]["source"]) {
  if (source === "portfolio_journal") return "Live portfolio/journal";
  if (source === "operator_state") return "Operator state";
  return "Fallback risk";
}

function deriveCommandState(brief: CommanderBrief): CommandState {
  if (brief.risk.killSwitchActive || brief.riskGovernor.mode === "LOCKED" || brief.commander.permission === "BLOCK") return "BLOCK";
  if (brief.risk.source === "fallback" || brief.risk.permission === "WAIT" || brief.commander.permission === "WAIT") return "WAIT";
  if (brief.topPlays.length === 0 || brief.riskGovernor.remainingTrades <= 0) return "WAIT";
  if (brief.riskGovernor.mode === "DEFENSIVE" || brief.riskGovernor.mode === "THROTTLED") return "WAIT";
  return "GO";
}

function commandReasons(brief: CommanderBrief, state: CommandState) {
  const reasons = [
    ...brief.riskGovernor.lockouts,
    ...brief.commander.blocks,
    brief.risk.source === "fallback" ? "Risk source is fallback; live equity unavailable." : null,
    brief.topPlays.length === 0 ? "No GO plays cleared the scan." : null,
    brief.risk.killSwitchActive ? "Research alerts are paused." : null,
  ].filter(Boolean) as string[];

  if (reasons.length) return Array.from(new Set(reasons)).slice(0, 4);
  if (state === "GO") return [`${brief.topPlays.length} GO play${brief.topPlays.length === 1 ? "" : "s"} available with ${brief.riskGovernor.remainingTrades} trade budget remaining.`];
  return ["No hard lockout, but conditions are not strong enough for a GO state."];
}

function allowedNextAction(brief: CommanderBrief, state: CommandState) {
  if (state === "BLOCK") return "Stand down. Reconcile risk, review outcomes, or wait for the next session.";
  if (state === "WAIT") return brief.commander.primaryAction || "Monitor scenarios and wait for risk/data confirmation.";
  return brief.commander.primaryAction || "Review the top play only after scenario confirmation and risk checks.";
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
          <CommandStateStrip brief={brief} />

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
              <SectionTitle title="Research Setups While Locked" subtitle="Market structure stays visible, but these are not executable until risk unlocks." />
              <div className="grid gap-3 xl:grid-cols-3">
                {brief.researchSetups.length > 0 ? brief.researchSetups.slice(0, 6).map((play) => <PlayRow key={`research-${play.symbol}`} play={play} compact />) : <Empty text="No research-only setups found in the current scan." />}
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

function CommandStateStrip({ brief }: { brief: CommanderBrief }) {
  const commandState = deriveCommandState(brief);
  const generatedAge = minutesSince(brief.generatedAt);
  const riskAge = minutesSince(brief.risk.lastUpdatedAt);
  const tone = stateTone(commandState);
  const borderColor = commandState === "GO" ? "border-emerald-500/35" : commandState === "WAIT" ? "border-amber-500/35" : "border-red-500/40";
  const bgColor = commandState === "GO" ? "bg-emerald-500/10" : commandState === "WAIT" ? "bg-amber-500/10" : "bg-red-500/10";
  const textColor = commandState === "GO" ? "text-emerald-100" : commandState === "WAIT" ? "text-amber-100" : "text-red-100";
  const reasons = commandReasons(brief, commandState);

  return (
    <section className={`mb-5 rounded-lg border ${borderColor} ${bgColor} p-4 ${textColor}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] opacity-70">Command State</div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-5xl font-black tracking-tight md:text-6xl">{commandState}</div>
            <StatusPill label={brief.riskGovernor.mode} tone={stateTone(brief.riskGovernor.mode)} />
            <StatusPill label={brief.risk.killSwitchActive ? "RESEARCH ALERTS PAUSED" : "RESEARCH ALERTS ACTIVE"} tone={brief.risk.killSwitchActive ? "red" : "green"} />
            <StatusPill label={sourceLabel(brief.risk.source)} tone={brief.risk.source === "portfolio_journal" ? "green" : brief.risk.source === "operator_state" ? "yellow" : "red"} />
          </div>
          <div className="mt-3 text-sm font-semibold leading-6">Allowed Next Action: {allowedNextAction(brief, commandState)}</div>
        </div>

        <div className="grid min-w-[min(100%,520px)] gap-3 md:grid-cols-3">
          <CommandFact label="Data Age" value={formatAge(generatedAge)} detail="brief generated" tone={generatedAge != null && generatedAge <= 30 ? "green" : generatedAge != null && generatedAge <= 90 ? "yellow" : "red"} />
          <CommandFact label="Risk Age" value={formatAge(riskAge)} detail={sourceLabel(brief.risk.source)} tone={brief.risk.source === "fallback" ? "red" : riskAge != null && riskAge <= 60 ? "green" : "yellow"} />
          <CommandFact label="Budget" value={`${brief.riskGovernor.remainingTrades}/${brief.riskGovernor.maxTradesToday}`} detail={`${money(brief.riskGovernor.maxRiskPerTradeUsd)} max risk`} tone={tone} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {reasons.map((reason) => (
          <div key={reason} className="rounded-md border border-current/20 bg-slate-950/30 p-3 text-xs font-semibold leading-5">
            {reason}
          </div>
        ))}
      </div>
    </section>
  );
}

function CommandFact({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: Tone }) {
  const color = tone === "green" ? "text-emerald-200" : tone === "yellow" ? "text-amber-200" : tone === "red" ? "text-red-200" : tone === "blue" ? "text-sky-200" : "text-slate-100";
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/35 p-3">
      <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] text-slate-400">{label}</div>
      <div className={`mt-1 text-lg font-black ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-400">{detail}</div>
    </div>
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