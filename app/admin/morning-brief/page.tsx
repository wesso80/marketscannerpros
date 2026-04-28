"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminCard from "@/components/admin/shared/AdminCard";
import SectionTitle from "@/components/admin/shared/SectionTitle";
import StatusPill from "@/components/admin/shared/StatusPill";
import EvidenceStack from "@/components/market/EvidenceStack";
import MarketStatusStrip from "@/components/market/MarketStatusStrip";
import RiskFlagPanel, { type RiskFlag } from "@/components/market/RiskFlagPanel";
import { buildMarketDataProviderStatus } from "@/lib/scanner/providerStatus";

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
  severity?: string | null;
  confidence?: number | null;
  impactScore: number;
  impactLabel: "LOW" | "MED" | "HIGH" | "CRITICAL";
  impactReason: string;
};

type MorningBrief = {
  briefId: string;
  generatedAt: string;
  market: string;
  timeframe: string;
  deskState: "TRADE" | "WAIT" | "DEFENSIVE" | "BLOCK";
  headline: string;
  operatorNote: string;
  topPlays: ScannerHit[];
  watchlist: ScannerHit[];
  researchSetups: ScannerHit[];
  avoidList: ScannerHit[];
  catalysts: MorningCatalyst[];
  risk: {
    openExposure: number;
    openRiskUsd: number;
    exposureUsd: number;
    equity: number;
    dailyPnl: number;
    dailyDrawdown: number;
    correlationRisk: number;
    maxPositions: number;
    activePositions: number;
    killSwitchActive: boolean;
    permission: string;
    sizeMultiplier: number;
    source: "portfolio_journal" | "operator_state" | "fallback";
    workspaceId?: string | null;
    lastUpdatedAt?: string | null;
    notes: string[];
  };
  learning: {
    totalSignals: number;
    labeled: number;
    pending: number;
    accuracyRate: number | null;
    briefFeedbackTotal: number;
    briefFeedbackByAction: Record<string, number>;
    feedbackInsights: Array<{
      label: string;
      metric: string;
      note: string;
      tone: "green" | "yellow" | "red" | "blue" | "neutral";
    }>;
    playbookScorecard: {
      bestSymbols: ScorecardItem[];
      cautionSymbols: ScorecardItem[];
      bestPlaybooks: ScorecardItem[];
      missedSetups: ScorecardItem[];
      ruleBreaks: ScorecardItem[];
    };
    playbookEvolution: {
      promotedPlaybooks: ScorecardItem[];
      demotedPlaybooks: ScorecardItem[];
      boostedSymbols: ScorecardItem[];
      suppressedSymbols: ScorecardItem[];
      rules: string[];
    };
  };
  sessionScore: {
    reviewDate: string;
    feedbackCount: number;
    worked: number;
    failed: number;
    missed: number;
    ruleBreaks: number;
    closedTrades: number;
    totalPl: number;
    totalR: number;
    winRate: number | null;
    disciplineScore: number;
    executionScore: number;
    summary: string;
    bestSymbol: string | null;
    weakestSymbol: string | null;
  };
  health: {
    scanner: string;
    feed: string;
    api: string;
    errorsCount?: number;
    symbolsScanned?: number;
    lastScanAt?: string;
  };
  universe: {
    mode: "custom" | "dynamic";
    totalCandidates: number;
    scannedCount: number;
    scanLimit: number;
    symbols: string[];
    sources: Array<{
      source: string;
      count: number;
      sample: string[];
    }>;
    workerStatus: {
      lastWorkerRunAt: string | null;
      lastWorkerName: string | null;
      lastWorkerStatus: string | null;
      lastWorkerErrors: number;
      latestQuoteAt: string | null;
      latestIndicatorAt: string | null;
      latestScannerCacheAt: string | null;
      freshness: "fresh" | "stale" | "unknown";
      note: string;
    };
    note: string;
  };
  recentBriefs: Array<{
    briefId: string;
    generatedAt: string;
    deskState: "TRADE" | "WAIT" | "DEFENSIVE" | "BLOCK";
    headline: string;
    topPlayCount: number;
    catalystCount: number;
  }>;
  comparison: {
    previousBriefId: string | null;
    previousGeneratedAt: string | null;
    deskStateChanged: boolean;
    previousDeskState: "TRADE" | "WAIT" | "DEFENSIVE" | "BLOCK" | null;
    newTopPlays: string[];
    droppedTopPlays: string[];
    retainedTopPlays: string[];
    newCatalystSymbols: string[];
    summary: string;
  };
  executionChecklist: {
    mode: "TRADE" | "WAIT" | "DEFENSIVE" | "BLOCK";
    allowedSetups: string[];
    blockedConditions: string[];
    firstAction: string;
    invalidationRule: string;
    sizingRule: string;
    checklist: Array<{
      label: string;
      status: "PASS" | "WAIT" | "BLOCK" | "INFO";
      instruction: string;
    }>;
  };
  outcomeGrade: {
    briefId: string | null;
    gradedAt: string;
    generatedAt: string | null;
    totalPlays: number;
    worked: number;
    failed: number;
    missed: number;
    invalidated: number;
    unreviewed: number;
    closedTrades: number;
    totalPl: number;
    totalR: number;
    grade: "A" | "B" | "C" | "D" | "INC";
    summary: string;
    plays: Array<{
      symbol: string;
      action: string | null;
      pl: number;
      r: number;
      verdict: "worked" | "failed" | "missed" | "invalidated" | "unreviewed";
      note: string;
    }>;
  };
  expectancy: {
    generatedAt: string;
    sampleTrades: number;
    bestSymbols: ExpectancyItem[];
    weakestSymbols: ExpectancyItem[];
    bestPlaybooks: ExpectancyItem[];
    weakestPlaybooks: ExpectancyItem[];
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
  commander: {
    permission: string;
    primaryAction: string;
    topSymbols: string[];
    maxRiskLine: string;
    scenarioFocus: string;
    reviewFocus: string;
    blocks: string[];
  };
  nextImprovements: string[];
};

type ExpectancyItem = {
  key: string;
  sample: number;
  winRate: number | null;
  avgR: number;
  totalR: number;
  profitFactor: number | null;
  note: string;
};

type MorningTradePlan = {
  planId: string;
  createdAt: string;
  briefId: string;
  symbol: string;
  bias: string;
  permission: string;
  confidence: number;
  playbook: string;
  entryTrigger: string;
  invalidation: string;
  sizing: string;
  riskNotes: string[];
  catalystWarnings: string[];
  checklist: Array<{ label: string; status: "PASS" | "WAIT" | "BLOCK" | "INFO"; instruction: string }>;
  reviewPrompt: string;
};

type MorningOpenRescore = {
  generatedAt: string;
  headline: string;
  previousDeskState: MorningBrief["deskState"];
  currentDeskState: MorningBrief["deskState"];
  promoted: string[];
  demoted: string[];
  stillValid: string[];
  summary: string;
  brief: MorningBrief;
};

type MorningBrokerFillSync = {
  generatedAt: string;
  workspaceId: string | null;
  source: "journal_broker_fields" | "portfolio_journal" | "unavailable";
  brokerLinked: boolean;
  brokerTaggedTrades: number;
  openBrokerTaggedTrades: number;
  portfolioPositions: number;
  unmatchedOpenTrades: number;
  totalBrokerTaggedPl: number;
  notes: string[];
};

type MorningDailyReview = {
  generatedAt: string;
  reviewDate: string;
  sessionScore: MorningBrief["sessionScore"];
  brokerSync: MorningBrokerFillSync;
  lessons: string[];
};

type ScorecardItem = {
  key: string;
  positive: number;
  caution: number;
  score: number;
  note: string;
};

type FeedbackAction = "taken" | "ignored" | "missed" | "worked" | "failed" | "invalidated" | "rule_broken";

const feedbackActions: Array<{ action: FeedbackAction; label: string; tone: "green" | "yellow" | "red" | "blue" | "neutral" }> = [
  { action: "taken", label: "Taken", tone: "green" },
  { action: "ignored", label: "Ignored", tone: "neutral" },
  { action: "missed", label: "Missed", tone: "yellow" },
  { action: "worked", label: "Worked", tone: "green" },
  { action: "failed", label: "Failed", tone: "red" },
  { action: "invalidated", label: "Invalidated", tone: "red" },
  { action: "rule_broken", label: "Rule Broken", tone: "red" },
];

const reviewActions: Array<{ action: FeedbackAction; label: string }> = [
  { action: "taken", label: "Took It" },
  { action: "ignored", label: "Skipped" },
  { action: "worked", label: "Worked" },
  { action: "failed", label: "Failed" },
  { action: "invalidated", label: "Invalidated" },
  { action: "missed", label: "Missed Winner" },
  { action: "rule_broken", label: "Rule Broken" },
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

function governorTone(mode: MorningBrief["riskGovernor"]["mode"]): "green" | "yellow" | "red" | "blue" {
  if (mode === "NORMAL") return "green";
  if (mode === "THROTTLED") return "blue";
  if (mode === "DEFENSIVE") return "yellow";
  return "red";
}

function checklistTone(status: "PASS" | "WAIT" | "BLOCK" | "INFO"): "green" | "yellow" | "red" | "blue" {
  if (status === "PASS") return "green";
  if (status === "WAIT") return "yellow";
  if (status === "BLOCK") return "red";
  return "blue";
}

function authHeaders() {
  const secret = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : null;
  return secret ? { Authorization: `Bearer ${secret}` } : undefined;
}

function formatMaybeDate(value: string | null) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2 }).format(value || 0);
}

function catalystTone(label: MorningCatalyst["impactLabel"]): "green" | "yellow" | "red" | "blue" {
  if (label === "CRITICAL" || label === "HIGH") return "red";
  if (label === "MED") return "yellow";
  return "blue";
}

function formatSource(value: string) {
  return value.replace(/_/g, " ").toUpperCase();
}

function riskSeverity(label: string): RiskFlag["severity"] {
  const lower = label.toLowerCase();
  if (lower.includes("block") || lower.includes("locked") || lower.includes("fallback") || lower.includes("unknown")) return "critical";
  if (lower.includes("stale") || lower.includes("error") || lower.includes("low") || lower.includes("defensive") || lower.includes("throttled")) return "warning";
  return "info";
}

export default function MorningBriefPage() {
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<Record<string, string>>({});
  const [savingFeedback, setSavingFeedback] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [tradePlans, setTradePlans] = useState<Record<string, MorningTradePlan>>({});
  const [openRescore, setOpenRescore] = useState<MorningOpenRescore | null>(null);
  const [brokerSync, setBrokerSync] = useState<MorningBrokerFillSync | null>(null);
  const [dailyReview, setDailyReview] = useState<MorningDailyReview | null>(null);

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

  const sendNow = async (preview = false) => {
    setSending(true);
    setEmailStatus(null);
    try {
      const res = await fetch("/api/jobs/email-morning-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authHeaders() ?? {}) },
        body: JSON.stringify(preview ? { preview: true, scanLimit: 20 } : { scanLimit: 80 }),
      });
      if (!res.ok) throw new Error(`Email failed (${res.status})`);
      const data = await res.json();
      setEmailStatus(`${preview ? "Preview sent" : "Sent"} to ${data.recipients?.join(", ") || "configured recipients"}`);
      if (data.brief) setBrief(data.brief);
    } catch (err) {
      setEmailStatus(err instanceof Error ? err.message : "Unable to send email");
    } finally {
      setSending(false);
    }
  };

  const markFeedback = async (play: ScannerHit, action: FeedbackAction, note?: string) => {
    if (!brief) return;
    const key = `${play.symbol}:${action}`;
    setSavingFeedback(key);
    try {
      const res = await fetch("/api/admin/morning-brief/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authHeaders() ?? {}) },
        body: JSON.stringify({
          briefId: brief.briefId || brief.generatedAt.slice(0, 10),
          symbol: play.symbol,
          action,
          market: brief.market,
          timeframe: brief.timeframe,
          permission: play.permission,
          bias: play.bias,
          playbook: play.playbook,
          confidence: play.confidence,
          note: note ?? reviewNotes[play.symbol] ?? null,
          snapshot: play,
        }),
      });
      if (!res.ok) throw new Error(`Feedback failed (${res.status})`);
      setFeedbackStatus((current) => ({ ...current, [play.symbol]: action }));
      setReviewNotes((current) => ({ ...current, [play.symbol]: "" }));
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

  const runMorningAction = async (action: string, payload: Record<string, unknown> = {}) => {
    setActionBusy(action);
    setActionStatus(null);
    try {
      const res = await fetch("/api/admin/morning-brief/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authHeaders() ?? {}) },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Action failed (${res.status})`);

      if (data.plan) {
        const plan = data.plan as MorningTradePlan;
        setTradePlans((current) => ({ ...current, [plan.symbol]: plan }));
        setActionStatus(`Trade plan generated for ${plan.symbol}`);
      } else if (data.rescore) {
        setOpenRescore(data.rescore as MorningOpenRescore);
        setBrief(data.rescore.brief);
        setActionStatus(data.rescore.summary || "Open re-score complete");
      } else if (data.brokerSync) {
        setBrokerSync(data.brokerSync as MorningBrokerFillSync);
        setActionStatus("Broker/fill reconciliation complete");
      } else if (data.review) {
        setDailyReview(data.review as MorningDailyReview);
        setActionStatus(`Daily review sent to ${data.recipients?.join(", ") || "configured recipients"}`);
      } else if (data.result) {
        setActionStatus(data.result.message || "Prewake universe scan complete");
      } else {
        setActionStatus("Action complete");
      }
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionBusy(null);
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
          <button onClick={() => runMorningAction("run_prewake")} disabled={Boolean(actionBusy)} className="rounded-md border border-purple-400/30 px-4 py-2 text-sm font-black text-purple-200 disabled:opacity-60">
            {actionBusy === "run_prewake" ? "Scanning..." : "Run Prewake"}
          </button>
          <button onClick={() => brief && runMorningAction("open_rescore", { brief })} disabled={!brief || Boolean(actionBusy)} className="rounded-md border border-amber-400/30 px-4 py-2 text-sm font-black text-amber-200 disabled:opacity-60">
            {actionBusy === "open_rescore" ? "Re-scoring..." : "At Open Re-score"}
          </button>
          <button onClick={() => runMorningAction("broker_sync")} disabled={Boolean(actionBusy)} className="rounded-md border border-white/10 px-4 py-2 text-sm font-black text-slate-200 disabled:opacity-60">
            {actionBusy === "broker_sync" ? "Syncing..." : "Sync Fills"}
          </button>
          <button onClick={() => runMorningAction("review_email")} disabled={Boolean(actionBusy)} className="rounded-md border border-red-400/30 px-4 py-2 text-sm font-black text-red-200 disabled:opacity-60">
            {actionBusy === "review_email" ? "Sending..." : "Review Email"}
          </button>
          <button onClick={() => sendNow(true)} disabled={sending} className="rounded-md border border-sky-400/30 px-4 py-2 text-sm font-black text-sky-200 disabled:opacity-60">
            {sending ? "Sending..." : "Preview Email"}
          </button>
          <button onClick={() => sendNow(false)} disabled={sending} className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">
            {sending ? "Sending..." : "Email Now"}
          </button>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
      {emailStatus ? <div className="mb-4 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-200">{emailStatus}</div> : null}
      {actionStatus ? <div className="mb-4 rounded-lg border border-sky-500/25 bg-sky-500/10 p-3 text-sm text-sky-200">{actionStatus}</div> : null}

      {brief ? (
        <>
          <DataTruthStrip brief={brief} />

          <section className="mb-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <AdminCard>
              <div className="text-xs uppercase tracking-[0.18em] text-emerald-300">Generated {generated}</div>
              <div className="mt-3 text-2xl font-black text-white">{brief.headline}</div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{brief.operatorNote}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusPill label={`${brief.market} ${brief.timeframe}`} tone="blue" />
                <StatusPill label={`${brief.universe.scannedCount}/${brief.universe.totalCandidates} scanned`} tone="neutral" />
                <StatusPill label={`${brief.health.errorsCount ?? 0} scan errors`} tone={(brief.health.errorsCount ?? 0) > 0 ? "yellow" : "green"} />
              </div>
            </AdminCard>

            <AdminCard title="Risk Permission">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Metric label="Permission" value={brief.risk.killSwitchActive ? "BLOCK" : brief.risk.permission} tone={permissionTone(brief.risk.permission)} />
                <Metric label="Size" value={`${brief.risk.sizeMultiplier.toFixed(2)}x`} />
                <Metric label="Equity" value={formatCurrency(brief.risk.equity)} />
                <Metric label="Daily P&L" value={formatCurrency(brief.risk.dailyPnl)} tone={brief.risk.dailyPnl >= 0 ? "green" : "red"} />
                <Metric label="Open Risk" value={`${formatCurrency(brief.risk.openRiskUsd)} / ${(brief.risk.openExposure * 100).toFixed(1)}%`} />
                <Metric label="Exposure" value={formatCurrency(brief.risk.exposureUsd)} />
                <Metric label="Drawdown" value={`${(brief.risk.dailyDrawdown * 100).toFixed(1)}%`} />
                <Metric label="Correlation" value={`${(brief.risk.correlationRisk * 100).toFixed(0)}%`} />
                <Metric label="Positions" value={`${brief.risk.activePositions}/${brief.risk.maxPositions}`} />
                <Metric label="Risk Source" value={brief.risk.source.replace("_", " ")} />
              </div>
              <div className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
                {brief.risk.notes.map((note) => <div key={note} className="rounded border border-white/10 bg-slate-950/40 p-2">{note}</div>)}
              </div>
            </AdminCard>
          </section>

          <section className="mb-5 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <AdminCard>
              <SectionTitle title="Commander View" subtitle="One screen for permission, first action, risk budget, and review focus." />
              <div className="mb-4 flex flex-wrap gap-2">
                <StatusPill label={brief.commander.permission} tone={brief.commander.permission === "BLOCK" ? "red" : brief.commander.permission === "TRADE" ? "green" : "yellow"} />
                <StatusPill label={brief.riskGovernor.mode} tone={governorTone(brief.riskGovernor.mode)} />
                {brief.commander.topSymbols.map((symbol) => <StatusPill key={symbol} label={symbol} tone="blue" />)}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <RuleBlock title="Primary Action" value={brief.commander.primaryAction} tone="green" />
                <RuleBlock title="Max Risk" value={brief.commander.maxRiskLine} tone={brief.riskGovernor.mode === "LOCKED" ? "red" : "blue"} />
                <RuleBlock title="Scenario Focus" value={brief.commander.scenarioFocus} tone="yellow" />
                <RuleBlock title="Review Focus" value={brief.commander.reviewFocus} tone="blue" />
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {brief.commander.blocks.slice(0, 4).map((block) => <div key={block} className="rounded-md border border-red-500/15 bg-red-500/5 p-3 text-sm leading-5 text-red-100">{block}</div>)}
              </div>
            </AdminCard>

            <AdminCard>
              <SectionTitle title="Hard Risk Governor" subtitle="Private session limits from actual risk, journal score, and heat." />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Metric label="Mode" value={brief.riskGovernor.mode} tone={governorTone(brief.riskGovernor.mode)} />
                <Metric label="Trades Left" value={`${brief.riskGovernor.remainingTrades}/${brief.riskGovernor.maxTradesToday}`} tone={brief.riskGovernor.remainingTrades > 0 ? "green" : "red"} />
                <Metric label="Max Risk" value={formatCurrency(brief.riskGovernor.maxRiskPerTradeUsd)} />
                <Metric label="Daily Stop" value={formatCurrency(brief.riskGovernor.dailyStopUsd)} />
                <Metric label="Heat" value={`${formatCurrency(brief.riskGovernor.currentHeatUsd)} / ${formatCurrency(brief.riskGovernor.portfolioHeatLimitUsd)}`} />
                <Metric label="Risk %" value={`${(brief.riskGovernor.maxRiskPerTradePct * 100).toFixed(2)}%`} />
              </div>
              <div className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
                {brief.riskGovernor.instructions.map((item) => <div key={item} className="rounded border border-white/10 bg-slate-950/40 p-2">{item}</div>)}
              </div>
            </AdminCard>
          </section>

          <section className="mb-5 grid gap-4 xl:grid-cols-[1fr_1.2fr]">
            <AdminCard>
              <SectionTitle title="Yesterday Auto-Grade" subtitle="Saved brief versus review labels and closed journal outcomes." />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Metric label="Grade" value={brief.outcomeGrade.grade} tone={brief.outcomeGrade.grade === "A" || brief.outcomeGrade.grade === "B" ? "green" : brief.outcomeGrade.grade === "INC" ? "yellow" : "red"} />
                <Metric label="Total R" value={brief.outcomeGrade.totalR.toFixed(2)} tone={brief.outcomeGrade.totalR >= 0 ? "green" : "red"} />
                <Metric label="P&L" value={formatCurrency(brief.outcomeGrade.totalPl)} tone={brief.outcomeGrade.totalPl >= 0 ? "green" : "red"} />
                <Metric label="Reviewed" value={`${brief.outcomeGrade.totalPlays - brief.outcomeGrade.unreviewed}/${brief.outcomeGrade.totalPlays}`} />
              </div>
              <div className="mt-3 rounded-md border border-white/10 bg-slate-950/40 p-3 text-sm leading-6 text-slate-300">{brief.outcomeGrade.summary}</div>
              <div className="mt-3 space-y-2">
                {brief.outcomeGrade.plays.slice(0, 5).map((play) => (
                  <div key={play.symbol} className="rounded-md border border-white/10 bg-slate-950/40 p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-black text-white">{play.symbol}</span>
                      <StatusPill label={play.verdict} tone={play.verdict === "worked" ? "green" : play.verdict === "unreviewed" ? "yellow" : "red"} />
                    </div>
                    <div className="text-xs leading-5 text-slate-400">{play.note}</div>
                  </div>
                ))}
              </div>
            </AdminCard>

            <AdminCard>
              <SectionTitle title="Expectancy Dashboard" subtitle="Last 90 days of closed journal trades by symbol and playbook." />
              <div className="mb-3 grid gap-2 md:grid-cols-2">
                <ExpectancyBucket title="Best Symbols" items={brief.expectancy.bestSymbols} tone="green" />
                <ExpectancyBucket title="Weak Symbols" items={brief.expectancy.weakestSymbols} tone="yellow" />
                <ExpectancyBucket title="Best Playbooks" items={brief.expectancy.bestPlaybooks} tone="blue" />
                <ExpectancyBucket title="Weak Playbooks" items={brief.expectancy.weakestPlaybooks} tone="red" />
              </div>
              <div className="space-y-2 text-xs leading-5 text-slate-400">
                {brief.expectancy.notes.map((note) => <div key={note} className="rounded border border-white/10 bg-slate-950/40 p-2">{note}</div>)}
              </div>
            </AdminCard>
          </section>

          <section className="mb-5">
            <AdminCard>
              <SectionTitle title="Pre-Open Scenario Tree" subtitle="Bull, bear, and chop paths for the candidates that matter most." />
              <div className="grid gap-3 xl:grid-cols-2">
                {brief.scenarioTree.length > 0 ? brief.scenarioTree.map((scenario) => (
                  <div key={scenario.symbol} className="rounded-md border border-white/10 bg-slate-950/40 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-lg font-black text-white">{scenario.symbol}</div>
                        <div className="text-xs text-slate-500">{scenario.baseCase}</div>
                      </div>
                      <StatusPill label={scenario.bias} tone="blue" />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <RuleBlock title="Bull Path" value={scenario.bullishPath} tone="green" />
                      <RuleBlock title="Bear Path" value={scenario.bearishPath} tone="red" />
                      <RuleBlock title="Chop Path" value={scenario.chopPath} tone="yellow" />
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <RuleBlock title="Confirmation" value={scenario.confirmation} tone="blue" />
                      <RuleBlock title="Invalidation" value={scenario.invalidation} tone="yellow" />
                      <RuleBlock title="Risk" value={scenario.riskAdjustment} tone={brief.riskGovernor.mode === "LOCKED" ? "red" : "green"} />
                    </div>
                  </div>
                )) : <EmptyState text="No scenarios until a candidate clears the scan." />}
              </div>
            </AdminCard>
          </section>

          {(openRescore || brokerSync || dailyReview) ? (
            <section className="mb-5 grid gap-4 xl:grid-cols-3">
              {openRescore ? (
                <AdminCard>
                  <SectionTitle title="At Open Re-score" subtitle="Fresh scan of morning candidates on the faster open-session timeframe." />
                  <div className="rounded-md border border-amber-400/15 bg-amber-400/5 p-3 text-sm leading-6 text-amber-100">{openRescore.summary}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <Metric label="Previous" value={openRescore.previousDeskState} tone={stateTone(openRescore.previousDeskState)} />
                    <Metric label="Current" value={openRescore.currentDeskState} tone={stateTone(openRescore.currentDeskState)} />
                  </div>
                  <div className="mt-3 grid gap-2 text-xs">
                    <ChangeBucket title="Promoted" values={openRescore.promoted} tone="green" />
                    <ChangeBucket title="Demoted" values={openRescore.demoted} tone="yellow" />
                    <ChangeBucket title="Still Valid" values={openRescore.stillValid} tone="blue" />
                  </div>
                </AdminCard>
              ) : null}

              {brokerSync ? (
                <AdminCard>
                  <SectionTitle title="Broker / Fill Sync" subtitle="Reconciles broker-tagged journal fills against portfolio positions." />
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Metric label="Broker Linked" value={brokerSync.brokerLinked ? "YES" : "NO"} tone={brokerSync.brokerLinked ? "green" : "yellow"} />
                    <Metric label="Source" value={brokerSync.source.replace(/_/g, " ")} />
                    <Metric label="Tagged Trades" value={String(brokerSync.brokerTaggedTrades)} />
                    <Metric label="Open Tagged" value={String(brokerSync.openBrokerTaggedTrades)} />
                    <Metric label="Positions" value={String(brokerSync.portfolioPositions)} />
                    <Metric label="Unmatched" value={String(brokerSync.unmatchedOpenTrades)} tone={brokerSync.unmatchedOpenTrades > 0 ? "yellow" : "green"} />
                  </div>
                  <div className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
                    {brokerSync.notes.map((note) => <div key={note} className="rounded border border-white/10 bg-slate-950/40 p-2">{note}</div>)}
                  </div>
                </AdminCard>
              ) : null}

              {dailyReview ? (
                <AdminCard>
                  <SectionTitle title="Daily Review Email" subtitle="Close-session review sent to email and ready for tomorrow's learning." />
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Metric label="Execution" value={`${dailyReview.sessionScore.executionScore}/100`} tone={dailyReview.sessionScore.executionScore >= 70 ? "green" : dailyReview.sessionScore.executionScore >= 45 ? "yellow" : "red"} />
                    <Metric label="Discipline" value={`${dailyReview.sessionScore.disciplineScore}/100`} tone={dailyReview.sessionScore.disciplineScore >= 80 ? "green" : dailyReview.sessionScore.disciplineScore >= 55 ? "yellow" : "red"} />
                  </div>
                  <div className="mt-3 space-y-2">
                    {dailyReview.lessons.map((lesson) => <div key={lesson} className="rounded-md border border-emerald-500/15 bg-emerald-500/5 p-3 text-sm leading-5 text-emerald-100">{lesson}</div>)}
                  </div>
                </AdminCard>
              ) : null}
            </section>
          ) : null}

          <section className="mb-5 grid gap-4 xl:grid-cols-[1fr_1.2fr]">
            <AdminCard>
              <SectionTitle title="Post-Session Score" subtitle="What yesterday/today's labels and closed journal trades say about execution quality." />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Metric label="Execution" value={`${brief.sessionScore.executionScore}/100`} tone={brief.sessionScore.executionScore >= 70 ? "green" : brief.sessionScore.executionScore >= 45 ? "yellow" : "red"} />
                <Metric label="Discipline" value={`${brief.sessionScore.disciplineScore}/100`} tone={brief.sessionScore.disciplineScore >= 80 ? "green" : brief.sessionScore.disciplineScore >= 55 ? "yellow" : "red"} />
                <Metric label="Closed P&L" value={formatCurrency(brief.sessionScore.totalPl)} tone={brief.sessionScore.totalPl >= 0 ? "green" : "red"} />
                <Metric label="Total R" value={brief.sessionScore.totalR.toFixed(2)} />
                <Metric label="Worked / Failed" value={`${brief.sessionScore.worked}/${brief.sessionScore.failed}`} />
                <Metric label="Missed / Rules" value={`${brief.sessionScore.missed}/${brief.sessionScore.ruleBreaks}`} />
              </div>
              <div className="mt-3 rounded-md border border-white/10 bg-slate-950/40 p-3 text-sm leading-6 text-slate-300">{brief.sessionScore.summary}</div>
            </AdminCard>

            <AdminCard>
              <SectionTitle title="Playbook Evolution" subtitle="How the morning system is changing rankings from your feedback loop." />
              <div className="mb-3 space-y-2">
                {brief.learning.playbookEvolution.rules.map((rule) => <div key={rule} className="rounded-md border border-emerald-500/15 bg-emerald-500/5 p-3 text-sm text-emerald-100">{rule}</div>)}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <ScorecardBucket title="Promoted Playbooks" items={brief.learning.playbookEvolution.promotedPlaybooks} tone="green" />
                <ScorecardBucket title="Demoted Playbooks" items={brief.learning.playbookEvolution.demotedPlaybooks} tone="red" />
                <ScorecardBucket title="Boosted Symbols" items={brief.learning.playbookEvolution.boostedSymbols} tone="blue" />
                <ScorecardBucket title="Suppressed Symbols" items={brief.learning.playbookEvolution.suppressedSymbols} tone="yellow" />
              </div>
            </AdminCard>
          </section>

          <section className="mb-5">
            <AdminCard>
              <SectionTitle title="Overnight Universe" subtitle="The pre-wake candidate pool feeding the detailed scanner." />
              <div className="mb-3 rounded-md border border-emerald-400/15 bg-emerald-400/5 p-4 text-sm leading-6 text-emerald-100">
                {brief.universe.note}
              </div>
              <div className="mb-3 grid gap-3 md:grid-cols-4">
                <Metric label="Worker Cache" value={brief.universe.workerStatus.freshness.toUpperCase()} tone={brief.universe.workerStatus.freshness === "fresh" ? "green" : brief.universe.workerStatus.freshness === "stale" ? "yellow" : "neutral"} />
                <Metric label="Last Worker" value={brief.universe.workerStatus.lastWorkerName || "Unknown"} />
                <Metric label="Quote Data" value={formatMaybeDate(brief.universe.workerStatus.latestQuoteAt)} />
                <Metric label="Indicator Data" value={formatMaybeDate(brief.universe.workerStatus.latestIndicatorAt)} />
              </div>
              <div className="mb-3 rounded-md border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-300">
                {brief.universe.workerStatus.note}
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {brief.universe.symbols.slice(0, 24).map((symbol) => <StatusPill key={symbol} label={symbol} tone="blue" />)}
                {brief.universe.symbols.length > 24 ? <StatusPill label={`+${brief.universe.symbols.length - 24} more`} tone="neutral" /> : null}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {brief.universe.sources.map((source) => (
                  <div key={source.source} className="rounded-md border border-white/10 bg-slate-950/40 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs uppercase tracking-wide text-slate-500">{source.source}</span>
                      <StatusPill label={String(source.count)} tone="green" />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {source.sample.slice(0, 8).map((symbol) => <span key={`${source.source}-${symbol}`} className="rounded border border-white/10 px-2 py-1 text-[11px] font-bold text-slate-300">{symbol}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </AdminCard>
          </section>

          <section className="mb-5">
            <AdminCard>
              <SectionTitle title="Pre-Market Execution Checklist" subtitle="The actual trading rule sheet for this session." />
              <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
                <div className="space-y-3">
                  <RuleBlock title="First Action" value={brief.executionChecklist.firstAction} tone="green" />
                  <RuleBlock title="Sizing Rule" value={brief.executionChecklist.sizingRule} tone="blue" />
                  <RuleBlock title="Invalidation" value={brief.executionChecklist.invalidationRule} tone="yellow" />
                </div>
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <ChecklistList title="Allowed Setups" items={brief.executionChecklist.allowedSetups} tone="green" />
                    <ChecklistList title="Do Not Trade If" items={brief.executionChecklist.blockedConditions} tone="red" />
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {brief.executionChecklist.checklist.map((item) => (
                      <div key={item.label} className="rounded-md border border-white/10 bg-slate-950/40 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-xs uppercase tracking-wide text-slate-500">{item.label}</span>
                          <StatusPill label={item.status} tone={checklistTone(item.status)} />
                        </div>
                        <div className="text-sm leading-5 text-slate-300">{item.instruction}</div>
                      </div>
                    ))}
                  </div>
                </div>
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
                    plan={tradePlans[play.symbol]}
                    feedback={feedbackStatus[play.symbol]}
                    savingFeedback={savingFeedback}
                    onFeedback={markFeedback}
                    onPlan={(selected) => runMorningAction("trade_plan", { brief, play: selected })}
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

          <section className="mb-5">
            <AdminCard>
              <SectionTitle title="Research Setups While Locked" subtitle="Best technical structures remain visible, but they are watch-only until risk permission unlocks." />
              <div className="grid gap-3 xl:grid-cols-2">
                {brief.researchSetups.length > 0 ? brief.researchSetups.map((play) => (
                  <CompactPlay key={`research-${play.symbol}`} play={play} feedback={feedbackStatus[play.symbol]} onFeedback={markFeedback} />
                )) : <EmptyState text="No research-only setups found in the current scan." />}
              </div>
            </AdminCard>
          </section>

          <section className="mb-5">
            <AdminCard>
              <SectionTitle title="What Changed" subtitle="Difference versus the previous saved morning brief." />
              <div className="rounded-md border border-sky-400/15 bg-sky-400/5 p-4 text-sm leading-6 text-sky-100">
                {brief.comparison.summary}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <ChangeBucket title="New Top Plays" values={brief.comparison.newTopPlays} tone="green" />
                <ChangeBucket title="Dropped Plays" values={brief.comparison.droppedTopPlays} tone="yellow" />
                <ChangeBucket title="Still On Deck" values={brief.comparison.retainedTopPlays} tone="blue" />
                <ChangeBucket title="New Catalysts" values={brief.comparison.newCatalystSymbols} tone="purple" />
              </div>
            </AdminCard>
          </section>

          <section className="mb-5 grid gap-4 xl:grid-cols-[1.3fr_1fr]">
            <AdminCard>
              <SectionTitle title="End-Of-Session Review" subtitle="Close the loop after trading so tomorrow's brief learns from what actually happened." />
              <div className="space-y-3">
                {[...brief.topPlays, ...brief.watchlist.slice(0, 4), ...brief.researchSetups.slice(0, 3)].length > 0 ? [...brief.topPlays, ...brief.watchlist.slice(0, 4), ...brief.researchSetups.slice(0, 3)].map((play) => (
                  <ReviewPlay
                    key={`review-${play.symbol}`}
                    play={play}
                    note={reviewNotes[play.symbol] ?? ""}
                    feedback={feedbackStatus[play.symbol]}
                    savingFeedback={savingFeedback}
                    onNote={(value) => setReviewNotes((current) => ({ ...current, [play.symbol]: value }))}
                    onFeedback={(action) => markFeedback(play, action, reviewNotes[play.symbol])}
                  />
                )) : <EmptyState text="No candidates to review yet." />}
              </div>
            </AdminCard>

            <AdminCard>
              <SectionTitle title="Playbook Scorecard" subtitle="What your last 30 days of labels are teaching the system." />
              <div className="space-y-3">
                <ScorecardBucket title="Best Symbols" items={brief.learning.playbookScorecard.bestSymbols} tone="green" />
                <ScorecardBucket title="Caution Symbols" items={brief.learning.playbookScorecard.cautionSymbols} tone="yellow" />
                <ScorecardBucket title="Best Playbooks" items={brief.learning.playbookScorecard.bestPlaybooks} tone="blue" />
                <ScorecardBucket title="Missed Setups" items={brief.learning.playbookScorecard.missedSetups} tone="purple" />
                <ScorecardBucket title="Rule Breaks" items={brief.learning.playbookScorecard.ruleBreaks} tone="red" />
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
                      <StatusPill label={`${event.impactLabel} ${event.impactScore}`} tone={catalystTone(event.impactLabel)} />
                    </div>
                    <div className="text-sm leading-5 text-slate-300">{event.headline}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-wide text-slate-500">
                      <span>{event.source}</span>
                      {event.catalystSubtype ? <span className="text-amber-300">{event.catalystSubtype}</span> : null}
                      {event.severity ? <span>{event.severity}</span> : null}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-slate-400">{event.impactReason}</div>
                  </div>
                )) : <EmptyState text="No fresh symbol catalysts found in the current scan window." />}
              </div>
            </AdminCard>

            <AdminCard>
              <SectionTitle title="Feedback Memory" subtitle="What your recent labels are starting to teach the brief." />
              <div className="mb-4 grid grid-cols-3 gap-2 text-xs">
                {feedbackActions.map((item) => (
                  <div key={item.action} className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                    <div className="text-slate-500">{item.label}</div>
                    <div className="mt-1 text-lg font-black text-white">{brief.learning.briefFeedbackByAction?.[item.action] ?? 0}</div>
                  </div>
                ))}
              </div>
              <div className="mb-4 space-y-2">
                {(brief.learning.feedbackInsights ?? []).map((insight) => (
                  <div key={`${insight.label}-${insight.metric}`} className="rounded-md border border-white/10 bg-slate-950/40 p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs uppercase tracking-wide text-slate-500">{insight.label}</span>
                      <StatusPill label={insight.metric} tone={insight.tone} />
                    </div>
                    <div className="text-sm leading-5 text-slate-300">{insight.note}</div>
                  </div>
                ))}
              </div>
              <SectionTitle title="Keep Making This Better" subtitle="Trader-brain improvements I would want next while using this daily." />
              <div className="space-y-3">
                {brief.nextImprovements.map((item) => (
                  <div key={item} className="rounded-md border border-emerald-500/15 bg-emerald-500/5 p-3 text-sm leading-5 text-emerald-100">
                    {item}
                  </div>
                ))}
              </div>
            </AdminCard>
          </section>

          <section className="mb-5">
            <AdminCard>
              <SectionTitle title="Recent Brief Memory" subtitle="The system is now saving each daily brief so it can compare sessions over time." />
              <div className="grid gap-3 lg:grid-cols-3">
                {brief.recentBriefs.length > 0 ? brief.recentBriefs.map((item) => (
                  <div key={item.briefId} className="rounded-md border border-white/10 bg-slate-950/40 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <StatusPill label={item.deskState} tone={stateTone(item.deskState)} />
                      <span className="text-xs text-slate-500">{new Date(item.generatedAt).toLocaleDateString()}</span>
                    </div>
                    <div className="text-sm font-semibold text-white">{item.headline}</div>
                    <div className="mt-2 text-xs text-slate-500">{item.topPlayCount} plays / {item.catalystCount} catalysts</div>
                  </div>
                )) : <EmptyState text="No saved brief history yet. The next generated brief will start the memory trail." />}
              </div>
            </AdminCard>
          </section>
        </>
      ) : null}
    </main>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "green" | "yellow" | "red" | "blue" | "neutral" }) {
  const color = tone === "green" ? "text-emerald-300" : tone === "yellow" ? "text-amber-300" : tone === "red" ? "text-red-300" : tone === "blue" ? "text-sky-300" : "text-white";
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/40 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-black ${color}`}>{value}</div>
    </div>
  );
}

function DataTruthStrip({ brief }: { brief: MorningBrief }) {
  const hasLiveRisk = brief.risk.source === "portfolio_journal" && brief.risk.equity > 0;
  const learningSample = brief.learning.labeled + brief.learning.briefFeedbackTotal;
  const workerFreshness = brief.universe.workerStatus.freshness;
  const scannerWarnings = [
    (brief.health.errorsCount ?? 0) > 0 ? `${brief.health.errorsCount ?? 0} scanner errors.` : null,
    brief.health.feed !== "HEALTHY" ? `Feed status is ${brief.health.feed}.` : null,
    workerFreshness !== "fresh" ? `Worker freshness is ${workerFreshness}.` : null,
  ].filter(Boolean) as string[];
  const riskWarnings = [
    !hasLiveRisk ? `Risk source is ${formatSource(brief.risk.source)}.` : null,
    brief.risk.killSwitchActive ? "Risk kill switch active." : null,
    ...brief.risk.notes.slice(0, 2),
  ].filter(Boolean) as string[];
  const learningWarnings = [
    learningSample < 30 ? `Learning sample is still low at ${learningSample} labels.` : null,
    brief.expectancy.sampleTrades < 30 ? `${brief.expectancy.sampleTrades} closed journal trades in expectancy sample.` : null,
    brief.learning.pending > 0 ? `${brief.learning.pending} pending signal labels.` : null,
  ].filter(Boolean) as string[];
  const statusItems = [
    {
      label: "Risk",
      status: buildMarketDataProviderStatus({
        source: "admin-risk",
        provider: formatSource(brief.risk.source),
        stale: !brief.risk.lastUpdatedAt,
        degraded: !hasLiveRisk || brief.risk.killSwitchActive,
        warnings: riskWarnings,
      }),
      coverageScore: hasLiveRisk ? 100 : brief.risk.source === "operator_state" ? 60 : 20,
      computedAt: brief.risk.lastUpdatedAt ?? null,
    },
    {
      label: "Worker",
      status: buildMarketDataProviderStatus({
        source: "admin-worker-cache",
        provider: brief.universe.workerStatus.lastWorkerName || "morning worker",
        stale: workerFreshness === "stale",
        degraded: workerFreshness !== "fresh" || brief.universe.workerStatus.lastWorkerErrors > 0,
        warnings: [brief.universe.workerStatus.note, brief.universe.workerStatus.lastWorkerErrors > 0 ? `${brief.universe.workerStatus.lastWorkerErrors} worker errors.` : null].filter(Boolean) as string[],
      }),
      coverageScore: workerFreshness === "fresh" ? 100 : workerFreshness === "stale" ? 60 : 20,
      computedAt: brief.universe.workerStatus.lastWorkerRunAt ?? brief.universe.workerStatus.latestScannerCacheAt,
    },
    {
      label: "Scanner",
      status: buildMarketDataProviderStatus({
        source: "admin-scanner-health",
        provider: `${brief.health.scanner} / ${brief.health.feed}`,
        degraded: scannerWarnings.length > 0,
        warnings: scannerWarnings,
      }),
      coverageScore: brief.universe.totalCandidates > 0 ? Math.round((brief.universe.scannedCount / brief.universe.totalCandidates) * 100) : 0,
      computedAt: brief.health.lastScanAt ?? null,
    },
    {
      label: "Learning",
      status: buildMarketDataProviderStatus({
        source: "admin-learning-sample",
        provider: "journal and brief feedback",
        degraded: learningSample < 30 || brief.expectancy.sampleTrades < 30,
        warnings: learningWarnings,
      }),
      coverageScore: Math.min(100, Math.round((learningSample / 30) * 100)),
      computedAt: brief.expectancy.generatedAt,
    },
  ];
  const evidenceItems = [
    {
      label: "Risk Permission",
      value: brief.risk.killSwitchActive ? "BLOCK" : brief.risk.permission,
      status: hasLiveRisk && !brief.risk.killSwitchActive ? "supportive" as const : "conflicting" as const,
      detail: brief.risk.notes[0] || "Risk source unavailable.",
    },
    {
      label: "Worker Cache",
      value: workerFreshness.toUpperCase(),
      status: workerFreshness === "fresh" ? "supportive" as const : workerFreshness === "stale" ? "neutral" as const : "missing" as const,
      detail: brief.universe.workerStatus.note,
    },
    {
      label: "Scanner Health",
      value: `${brief.health.scanner} / ${brief.health.feed}`,
      status: scannerWarnings.length === 0 ? "supportive" as const : "conflicting" as const,
      detail: `${brief.health.errorsCount ?? 0} errors; ${brief.health.symbolsScanned ?? brief.universe.scannedCount} symbols scanned${brief.health.lastScanAt ? `; scan ${formatMaybeDate(brief.health.lastScanAt)}` : ""}.`,
    },
    {
      label: "Learning Sample",
      value: `${learningSample} labels`,
      status: learningSample >= 30 ? "supportive" as const : learningSample >= 10 ? "neutral" as const : "missing" as const,
      detail: `${brief.expectancy.sampleTrades} closed journal trades; ${brief.learning.pending} pending signal labels.`,
    },
  ];
  const riskFlags = [
    brief.risk.killSwitchActive ? "Risk kill switch active." : null,
    !hasLiveRisk ? `Risk source is ${formatSource(brief.risk.source)}.` : null,
    workerFreshness !== "fresh" ? `Worker freshness is ${workerFreshness}.` : null,
    (brief.health.errorsCount ?? 0) > 0 ? `${brief.health.errorsCount ?? 0} scanner errors.` : null,
    brief.health.feed !== "HEALTHY" ? `Feed status is ${brief.health.feed}.` : null,
    brief.riskGovernor.mode === "LOCKED" ? "Risk governor locked." : null,
    brief.riskGovernor.mode === "DEFENSIVE" || brief.riskGovernor.mode === "THROTTLED" ? `Risk governor ${brief.riskGovernor.mode}.` : null,
    learningSample < 10 ? "Learning sample too small for strong calibration." : null,
    ...brief.riskGovernor.lockouts.slice(0, 3),
    ...brief.commander.blocks.slice(0, 3),
  ].filter(Boolean).map((label) => ({
    label: label as string,
    severity: riskSeverity(label as string),
    detail: "Private Morning Brief constraint to review before acting.",
  }));

  return (
    <section className="mb-5 space-y-3">
      <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr]">
        <EvidenceStack title="Morning Brief Evidence Stack" items={evidenceItems} />
        <RiskFlagPanel title="Morning Brief Risk Flags" flags={riskFlags} emptyText="No active Morning Brief risk, freshness, scanner, or calibration flags." />
      </div>
      <MarketStatusStrip items={statusItems} className="md:grid-cols-4" />
    </section>
  );
}

function PlayCard({
  play,
  plan,
  feedback,
  savingFeedback,
  onFeedback,
  onPlan,
}: {
  play: ScannerHit;
  plan?: MorningTradePlan;
  feedback?: string;
  savingFeedback: string | null;
  onFeedback: (play: ScannerHit, action: FeedbackAction) => void;
  onPlan: (play: ScannerHit) => void;
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
        <button onClick={() => onPlan(play)} className="rounded-md border border-emerald-400/30 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-400/10">
          Generate Plan
        </button>
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
      {plan ? (
        <div className="mt-4 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-black text-emerald-100">Trade Plan</div>
            <StatusPill label={plan.planId} tone="green" />
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-3">
            <RuleBlock title="Entry Trigger" value={plan.entryTrigger} tone="green" />
            <RuleBlock title="Invalidation" value={plan.invalidation} tone="yellow" />
            <RuleBlock title="Sizing" value={plan.sizing} tone="blue" />
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <ChecklistList title="Catalyst Warnings" items={plan.catalystWarnings} tone="red" />
            <ChecklistList title="Risk Notes" items={plan.riskNotes} tone="green" />
          </div>
          <div className="mt-3 text-xs leading-5 text-slate-400">{plan.reviewPrompt}</div>
        </div>
      ) : null}
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

function ReviewPlay({
  play,
  note,
  feedback,
  savingFeedback,
  onNote,
  onFeedback,
}: {
  play: ScannerHit;
  note: string;
  feedback?: string;
  savingFeedback: string | null;
  onNote: (value: string) => void;
  onFeedback: (action: FeedbackAction) => void;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/40 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-black text-white">{play.symbol}</div>
          <div className="text-xs text-slate-500">{play.permission} / {play.bias} / {play.playbook || play.regime}</div>
        </div>
        {feedback ? <StatusPill label={feedback.replace("_", " ")} tone={feedback === "worked" || feedback === "taken" ? "green" : feedback === "rule_broken" || feedback === "failed" ? "red" : "yellow"} /> : null}
      </div>
      <textarea
        value={note}
        onChange={(event) => onNote(event.target.value)}
        placeholder="Review note: entry late, skipped because BTC weak, worked but liquidity poor, broke rule, etc."
        className="min-h-20 w-full rounded-md border border-white/10 bg-slate-900/80 p-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-400/40"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {reviewActions.map((item) => (
          <button
            key={item.action}
            onClick={() => onFeedback(item.action)}
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

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-400">{text}</div>;
}

function ScorecardBucket({ title, items, tone }: { title: string; items: ScorecardItem[]; tone: "green" | "yellow" | "blue" | "purple" | "red" }) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
        <StatusPill label={String(items.length)} tone={tone} />
      </div>
      <div className="space-y-2">
        {items.length > 0 ? items.map((item) => (
          <div key={`${title}-${item.key}`} className="rounded border border-white/10 bg-slate-900/60 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-black text-white">{item.key}</span>
              <span className="text-xs text-slate-500">+{item.positive} / -{item.caution}</span>
            </div>
            <div className="mt-1 text-xs leading-4 text-slate-400">{item.note}</div>
          </div>
        )) : <div className="text-xs text-slate-500">No sample yet.</div>}
      </div>
    </div>
  );
}

function ExpectancyBucket({ title, items, tone }: { title: string; items: ExpectancyItem[]; tone: "green" | "yellow" | "blue" | "red" }) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
        <StatusPill label={String(items.length)} tone={tone} />
      </div>
      <div className="space-y-2">
        {items.length > 0 ? items.map((item) => (
          <div key={`${title}-${item.key}`} className="rounded border border-white/10 bg-slate-900/60 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-black text-white">{item.key}</span>
              <span className="text-xs text-slate-500">{item.avgR.toFixed(2)}R</span>
            </div>
            <div className="mt-1 text-xs leading-4 text-slate-400">
              {item.sample} trades / {item.winRate == null ? "n/a" : `${(item.winRate * 100).toFixed(0)}%`} win / total {item.totalR.toFixed(2)}R
            </div>
          </div>
        )) : <div className="text-xs text-slate-500">No sample yet.</div>}
      </div>
    </div>
  );
}

function RuleBlock({ title, value, tone }: { title: string; value: string; tone: "green" | "yellow" | "red" | "blue" }) {
  const color = tone === "green" ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-100" : tone === "yellow" ? "border-amber-500/20 bg-amber-500/5 text-amber-100" : tone === "red" ? "border-red-500/20 bg-red-500/5 text-red-100" : "border-sky-500/20 bg-sky-500/5 text-sky-100";
  return (
    <div className={`rounded-md border p-3 ${color}`}>
      <div className="mb-1 text-xs uppercase tracking-wide opacity-70">{title}</div>
      <div className="text-sm font-semibold leading-5">{value}</div>
    </div>
  );
}

function ChecklistList({ title, items, tone }: { title: string; items: string[]; tone: "green" | "red" }) {
  const marker = tone === "green" ? "bg-emerald-400" : "bg-red-400";
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/40 p-3">
      <div className="mb-3 text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item} className="flex gap-2 text-sm leading-5 text-slate-300">
            <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${marker}`} />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChangeBucket({ title, values, tone }: { title: string; values: string[]; tone: "green" | "yellow" | "blue" | "purple" }) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/40 p-3">
      <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="flex flex-wrap gap-2">
        {values.length > 0 ? values.map((value) => <StatusPill key={value} label={value} tone={tone} />) : <span className="text-xs text-slate-500">None</span>}
      </div>
    </div>
  );
}