"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  retailAuthBadge,
  retailSizeLabel,
  retailRegime,
  retailVolState,
  retailSession,
  retailSetupStrength,
  RETAIL_COLORS,
} from "@/lib/displayMode";
import type { TickerContext } from "@/components/markets/types";
import type { DecisionLensData } from "@/components/markets/types";

const PriceChart = dynamic(
  () =>
    import("@/components/scanner/PriceChart").then((m) => ({
      default: m.PriceChart,
    })),
  { ssr: false }
);

/* ─── RetailTickerView Props ───────────────────────────────────────── */
export interface RetailTickerViewProps {
  ctx: TickerContext;
  lens: DecisionLensData | null;
  onSwitchToInstitutional: () => void;
}

/**
 * RetailTickerPage — Full component tree.
 *
 * Priority order:
 *   Context → Setup → Risk → Expectation → Event Warning → Execution Prompt
 *
 * Hides: RU, ACL numeric, penalty stack, percentile table, distribution histogram.
 * Auto-refreshes via parent (useTickerData re-fetches on symbol/regime/session change).
 * Blocked state disables trade plan button.
 */
export default function RetailTickerView({
  ctx,
  lens,
  onSwitchToInstitutional,
}: RetailTickerViewProps) {
  const { symbol, quote, scanner, options, earnings, economic, news } = ctx;

  /* ── Derived retail translations ── */
  const badge = retailAuthBadge(lens?.authorization, lens ? parseFloat(lens.ruBudget) || undefined : undefined);
  const regime = retailRegime(lens?.volState);
  const vol = retailVolState(lens?.volState);
  const sess = retailSession(undefined); // session not directly in ctx — resolved from time
  const strength = retailSetupStrength(lens?.confidence);
  const isBlocked = lens?.authorization === "BLOCK" || badge.color === "red";
  const isEquity = ctx.assetClass === "equities";

  /* ── Events aggregation ── */
  const events = useMemo(() => {
    const list: Array<{
      title: string;
      severity: "green" | "yellow" | "red" | "purple";
      detail?: string;
      session?: string;
      impact?: string;
    }> = [];
    for (const e of earnings.slice(0, 3))
      list.push({
        title: `Earnings: ${e.symbol}`,
        severity: "purple",
        detail: e.reportDate + (e.estimate ? ` · Est: $${e.estimate}` : ""),
        session: e.reportDate,
        impact: "High",
      });
    for (const e of economic.slice(0, 5))
      list.push({
        title: e.event,
        severity: e.impact === "high" ? "red" : e.impact === "medium" ? "yellow" : "green",
        detail: e.date + (e.forecast ? ` · Fcst: ${e.forecast}` : ""),
        session: e.date,
        impact: e.impact.charAt(0).toUpperCase() + e.impact.slice(1),
      });
    return list;
  }, [earnings, economic]);

  const hasHighImpact = events.some((e) => e.severity === "red" || e.severity === "purple");

  /* ── Probability bar ── */
  const continuationPct = lens?.confidence ?? 0;

  if (!symbol)
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-zinc-500">
        Search for a ticker above to view its retail analysis.
      </div>
    );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">

        {/* ═══════════════════════════════════════════════════════════════
            1. HeroHeaderSection
            ═══════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* TickerIdentityBlock */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">{symbol}</h1>
            <div className="flex items-center gap-4">
              {quote && (
                <span className="text-2xl font-semibold text-zinc-200">
                  ${quote.price.toFixed(2)}
                </span>
              )}
              {quote && (
                <PercentChangeBadge pct={quote.changePercent} />
              )}
              <SetupStrengthBadge strength={strength} />
            </div>
          </div>

          {/* MarketContextStrip */}
          <div className="flex flex-wrap items-center gap-2">
            <ContextBadge icon="📈" label={regime.label} color={regime.color} />
            <ContextBadge icon="🌊" label={`${vol.label} Vol`} color={vol.color} />
            <ContextBadge
              icon="⚠️"
              label={lens?.eventRisk ? lens.eventRisk.charAt(0).toUpperCase() + lens.eventRisk.slice(1) + " Risk" : "Assessing"}
              color={lens?.eventRisk === "high" ? "red" : lens?.eventRisk === "medium" ? "yellow" : "green"}
            />
            <ContextBadge icon="🕐" label={sess.label} color={sess.color} />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            2. SetupSnapshotSection
            ═══════════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-lg">
          {/* CardHeader */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-zinc-100">
                {scanner?.setup || "Awaiting Setup"}
              </span>
              {scanner?.direction && (
                <span
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    scanner.direction === "LONG"
                      ? "bg-emerald-600/20 text-emerald-400"
                      : "bg-red-600/20 text-red-400"
                  }`}
                >
                  {scanner.direction === "LONG" ? "Bullish" : "Bearish"}
                </span>
              )}
            </div>
            {hasHighImpact && (
              <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-600/20 text-red-400 animate-pulse">
                ⚡ Event Warning
              </span>
            )}
          </div>

          {/* CardBody — 2 columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* StructureColumn */}
            <div className="space-y-4">
              <DataRow label="Key Level" value={scanner?.entry != null ? `$${scanner.entry.toFixed(2)}` : "—"} />
              <DataRow
                label="Invalidation"
                value={scanner?.stop != null ? `Below $${scanner.stop.toFixed(2)}` : "—"}
                color="text-red-400"
              />
              <DataRow
                label="Entry Zone"
                value={scanner?.entry != null ? `Near $${scanner.entry.toFixed(2)}` : "—"}
                color="text-emerald-400"
              />
              <DataRow
                label="Risk Level"
                value={lens?.eventRisk ? lens.eventRisk.charAt(0).toUpperCase() + lens.eventRisk.slice(1) : "—"}
                color={
                  lens?.eventRisk === "high"
                    ? "text-red-400"
                    : lens?.eventRisk === "medium"
                    ? "text-amber-400"
                    : "text-emerald-400"
                }
              />
            </div>

            {/* ExpectancyColumn */}
            <div className="space-y-4">
              <DataRow
                label="Expected Move"
                value={lens?.expectedMove || "—"}
                color="text-indigo-400"
              />
              <DataRow
                label="Historical Continuation"
                value={continuationPct ? `${continuationPct}%` : "—"}
              />
              <DataRow
                label="Typical Day Move"
                value={scanner?.indicators?.atr ? `$${Number(scanner.indicators.atr).toFixed(2)}` : "—"}
              />
              {/* SimpleProbabilityBar */}
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
                  Continuation Probability
                </div>
                <div className="h-2 rounded-full bg-zinc-800">
                  <div
                    className={`h-2 rounded-full transition-all duration-700 ${
                      continuationPct >= 70
                        ? "bg-emerald-500"
                        : continuationPct >= 50
                        ? "bg-amber-500"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(continuationPct, 100)}%` }}
                  />
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  {continuationPct}% — {strength.label}
                </div>
              </div>
            </div>
          </div>

          {/* CardFooter */}
          <div className="mt-5 pt-4 border-t border-zinc-800 flex items-center justify-between">
            <div className="text-sm text-zinc-400">
              💰 Suggested Size:{" "}
              <strong className="text-zinc-200">
                {retailSizeLabel(lens ? parseFloat(lens.ruBudget) || undefined : undefined)}
              </strong>
            </div>
            <button
              onClick={onSwitchToInstitutional}
              className="text-xs text-zinc-500 hover:text-indigo-400 transition-colors"
            >
              View Advanced Breakdown →
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            3. StructureChartSection
            ═══════════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          {/* ChartHeader */}
          <div className="flex items-center justify-between mb-3">
            <ChartTimeframeSelector />
            <span
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                regime.color === "green"
                  ? "bg-emerald-600/20 text-emerald-400"
                  : regime.color === "red"
                  ? "bg-red-600/20 text-red-400"
                  : regime.color === "blue"
                  ? "bg-indigo-600/20 text-indigo-400"
                  : "bg-amber-600/20 text-amber-400"
              }`}
            >
              {regime.label}
            </span>
          </div>

          {/* CleanChart — with entry/risk/target zone legends */}
          <div className="h-[420px] w-full rounded-xl overflow-hidden relative">
            <PriceChart
              symbol={symbol}
              interval="daily"
              price={quote?.price}
              chartData={scanner?.indicators?.chartData}
            />
            {/* Overlay legends */}
            {scanner && (
              <div className="absolute bottom-3 left-3 flex gap-2 z-10">
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-600/80 text-white">
                  Entry ${scanner.entry?.toFixed(2)}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-600/80 text-white">
                  Stop ${scanner.stop?.toFixed(2)}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-600/80 text-white">
                  Target ${scanner.target?.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            4. OptionsSummarySection (equity only)
            ═══════════════════════════════════════════════════════════════ */}
        {isEquity && options && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            {/* CardHeader */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm uppercase tracking-wider text-zinc-400 font-medium">
                🎯 Options Snapshot
              </h3>
              <span
                className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                  options.ivRank > 60
                    ? "bg-red-600/20 text-red-400"
                    : options.ivRank > 30
                    ? "bg-amber-600/20 text-amber-400"
                    : "bg-emerald-600/20 text-emerald-400"
                }`}
              >
                IV: {options.ivRank}th pctl
              </span>
            </div>

            {/* CardBody */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ExpectedMoveBox */}
              <div className="rounded-xl bg-indigo-600/10 border border-indigo-600/20 p-4">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Expected Move</div>
                <div className="text-2xl font-bold text-indigo-400">
                  ±${options.expectedMove.toFixed(2)}
                </div>
              </div>

              {/* StrategySuggestionBox */}
              <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/40 p-4">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Suggested Strategy</div>
                <div className="text-lg font-semibold text-zinc-200">
                  {options.ivRank > 50 ? "Sell Premium" : "Buy Premium"}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  {options.ivRank > 50
                    ? "IV elevated — credit spreads may be favorable"
                    : "IV low — directional plays or debit spreads"}
                </div>
              </div>
            </div>

            {/* Risk note + event proximity */}
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                Put/Call: {options.putCallRatio.toFixed(2)} · Max Pain: ${options.maxPain.toFixed(0)}
              </span>
              {hasHighImpact && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-600/20 text-purple-400">
                  ⚡ Event Nearby
                </span>
              )}
            </div>

            <button
              onClick={onSwitchToInstitutional}
              className="mt-3 text-xs text-zinc-500 hover:text-indigo-400 transition-colors"
            >
              View Full Greeks & Chain →
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            5. EventRiskSection
            ═══════════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <h3 className="text-sm uppercase tracking-wider text-zinc-400 font-medium">
            📰 Recent Events
          </h3>

          {events.length > 0 ? (
            <div className="space-y-2">
              {events.map((evt, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center p-3 rounded-lg bg-zinc-800/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base">
                      {evt.severity === "red"
                        ? "🔴"
                        : evt.severity === "purple"
                        ? "🟣"
                        : evt.severity === "yellow"
                        ? "🟡"
                        : "🟢"}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-zinc-200">{evt.title}</div>
                      {evt.detail && (
                        <div className="text-xs text-zinc-500">{evt.detail}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {evt.session && (
                      <span className="text-[10px] text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5">
                        {evt.session}
                      </span>
                    )}
                    {evt.impact && (
                      <span
                        className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${
                          evt.impact === "High"
                            ? "bg-red-600/20 text-red-400"
                            : evt.impact === "Medium"
                            ? "bg-amber-600/20 text-amber-400"
                            : "bg-emerald-600/20 text-emerald-400"
                        }`}
                      >
                        {evt.impact}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/30">
              <span className="text-xl">🟢</span>
              <div>
                <div className="font-medium text-zinc-300">No High-Impact Events</div>
                <div className="text-xs text-zinc-500">Clear conditions for {symbol}</div>
              </div>
            </div>
          )}

          {/* HistoricalImpactSummary */}
          {scanner?.indicators?.catalystStats && (
            <div className="pt-3 border-t border-zinc-800 space-y-1">
              <DataRow
                label="Median Day 1 Move"
                value={scanner.indicators.catalystStats.medianMove || "—"}
                small
              />
              <DataRow
                label="Reversal Rate"
                value={scanner.indicators.catalystStats.reversalRate || "—"}
                small
              />
              <div className="text-[10px] text-zinc-600 mt-1">
                Based on {scanner.indicators.catalystStats.sampleSize || "N/A"} similar events
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            6. RiskReminderSection
            ═══════════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-yellow-600/30 bg-yellow-600/5 p-6">
          <h3 className="text-sm uppercase tracking-wider text-zinc-400 font-medium mb-3">
            ✅ Pre-Entry Checklist
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ChecklistItem label="Stop level confirmed" />
            <ChecklistItem label="Position size appropriate" />
            <ChecklistItem label="Event risk reviewed" />
            <ChecklistItem label="Session timing acceptable" />
          </div>

          {/* BlockedStateBanner */}
          {isBlocked && (
            <div className="mt-4 p-4 rounded-xl bg-red-600/10 border border-red-600/30 text-red-400 font-semibold text-center">
              ⛔ Trading Not Recommended Right Now
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            7. JournalPromptSection
            ═══════════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <p className="text-zinc-300 text-lg">Planning to take this trade?</p>
          <div className="flex items-center gap-3">
            <Link
              href={`/tools/journal?action=new&symbol=${symbol}&setup=${encodeURIComponent(
                scanner?.setup || ""
              )}&direction=${scanner?.direction || ""}&entry=${scanner?.entry || ""}&stop=${scanner?.stop || ""}&target=${scanner?.target || ""}`}
              className={`px-6 py-3 rounded-xl font-semibold transition ${
                isBlocked
                  ? "bg-zinc-700 text-zinc-500 cursor-not-allowed pointer-events-none"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              }`}
              aria-disabled={isBlocked}
            >
              📓 Create Trade Plan
            </Link>
            <Link
              href={`/tools/journal?action=quick&symbol=${symbol}`}
              className={`px-5 py-3 rounded-xl font-medium border transition ${
                isBlocked
                  ? "border-zinc-700 text-zinc-600 cursor-not-allowed pointer-events-none"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
              }`}
              aria-disabled={isBlocked}
            >
              Quick Log
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Sub-Components (local to this file)
   ───────────────────────────────────────────────────────────────────── */

/** Green/red percent change pill */
function PercentChangeBadge({ pct }: { pct: number }) {
  const positive = pct >= 0;
  return (
    <span
      className={`px-3 py-1 rounded-lg text-sm font-semibold ${
        positive ? "bg-emerald-600/20 text-emerald-400" : "bg-red-600/20 text-red-400"
      }`}
    >
      {positive ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

/** Setup strength badge (Strong Setup / Moderate / etc.) */
function SetupStrengthBadge({
  strength,
}: {
  strength: { label: string; level: string; pct: number };
}) {
  const colorMap: Record<string, string> = {
    "high-conviction": "bg-emerald-600/20 text-emerald-400",
    strong: "bg-emerald-600/20 text-emerald-400",
    moderate: "bg-amber-600/20 text-amber-400",
    weak: "bg-red-600/20 text-red-400",
  };
  return (
    <span
      className={`px-4 py-2 rounded-xl text-sm font-semibold ${
        colorMap[strength.level] || colorMap.moderate
      }`}
    >
      {strength.label} Setup
    </span>
  );
}

/** Market context badge (mood/vol/risk/session) */
function ContextBadge({
  icon,
  label,
  color,
}: {
  icon: string;
  label: string;
  color: string;
}) {
  const map: Record<string, string> = {
    green: "bg-emerald-600/15 border-emerald-600/30 text-emerald-400",
    yellow: "bg-amber-600/15 border-amber-600/30 text-amber-400",
    red: "bg-red-600/15 border-red-600/30 text-red-400",
    blue: "bg-indigo-600/15 border-indigo-600/30 text-indigo-400",
    purple: "bg-purple-600/15 border-purple-600/30 text-purple-400",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 border rounded-lg px-3 py-1 text-xs font-medium ${map[color] || map.green}`}>
      {icon} {label}
    </span>
  );
}

/** Label + value row */
function DataRow({
  label,
  value,
  color,
  small,
}: {
  label: string;
  value: string;
  color?: string;
  small?: boolean;
}) {
  return (
    <div className={small ? "flex items-center justify-between" : ""}>
      <div className={`text-xs text-zinc-500 uppercase tracking-wider ${small ? "" : "mb-0.5"}`}>
        {label}
      </div>
      <div className={`${small ? "text-sm" : "text-lg"} font-semibold ${color || "text-zinc-200"}`}>
        {value}
      </div>
    </div>
  );
}

/** Checklist row */
function ChecklistItem({ label }: { label: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <button
      onClick={() => setChecked((c) => !c)}
      className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-colors text-left ${
        checked
          ? "bg-emerald-600/10 text-emerald-400"
          : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800"
      }`}
    >
      <span
        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
          checked ? "border-emerald-500 bg-emerald-600" : "border-zinc-600"
        }`}
      >
        {checked && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}

/** Chart timeframe selector (static for retail — daily focus) */
function ChartTimeframeSelector() {
  const [tf, setTf] = useState<"1d" | "1w" | "1m">("1d");
  return (
    <div className="flex items-center gap-1 bg-zinc-800/60 rounded-lg p-0.5">
      {(["1d", "1w", "1m"] as const).map((v) => (
        <button
          key={v}
          onClick={() => setTf(v)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            tf === v ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {v === "1d" ? "Daily" : v === "1w" ? "Weekly" : "Monthly"}
        </button>
      ))}
    </div>
  );
}
