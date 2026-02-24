"use client";

import { useState, useEffect, useCallback } from "react";
import { useDisplayMode } from "@/lib/displayMode";
import { useUserTier } from "@/lib/useUserTier";
import MarketPulseBar from "@/components/retail/MarketPulseBar";
import TodaysEnvironmentCard from "@/components/retail/TodaysEnvironmentCard";
import WatchlistOpportunityGrid, {
  type OpportunityCard,
} from "@/components/retail/WatchlistOpportunityGrid";
import SetupStrengthMeter from "@/components/retail/SetupStrengthMeter";
import RetailEventRiskPanel, {
  type EventItem,
} from "@/components/retail/RetailEventRiskPanel";
import PerformanceSnapshot from "@/components/retail/PerformanceSnapshot";
import Link from "next/link";
import { redirect } from "next/navigation";

// ─── Types for the aggregated dashboard data ────────────
interface DashboardData {
  regime?: string;
  volState?: string;
  riskMode?: string;
  session?: string;
  majorEventsToday: number;
  suggestedStrategy?: string;
  opportunities: OpportunityCard[];
  events: EventItem[];
  probability?: number;
  typicalDayMove?: string;
  typicalRisk?: string;
  // Performance
  winRate?: number;
  avgRMultiple?: number;
  bestSetupType?: string;
  biggestLeak?: string;
  totalTrades?: number;
}

/**
 * Retail Dashboard
 *
 * "In 15 seconds I understand what's happening, what to look at,
 *  and whether I should even think about trading."
 *
 * All data comes from the same backend engine.
 * Retail Mode curates what is shown. Nothing is removed.
 */
export default function RetailDashboardPage() {
  const { isInstitutional } = useDisplayMode();
  const { isLoggedIn, isLoading: tierLoading } = useUserTier();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // If institutional mode, redirect to the full markets cockpit
  if (isInstitutional) {
    redirect("/tools/markets");
  }

  const fetchDashboard = useCallback(async () => {
    try {
      // Fetch multiple endpoints in parallel for the retail dashboard
      const [focusRes, perfRes, eventsRes] = await Promise.allSettled([
        fetch("/api/ai-market-focus", { credentials: "include" }),
        fetch("/api/journal/stats", { credentials: "include" }),
        fetch("/api/cached/scanner", { credentials: "include" }),
      ]);

      let regime: string | undefined;
      let volState: string | undefined;
      let riskMode: string | undefined;
      let session: string | undefined;
      let suggestedStrategy: string | undefined;
      let opportunities: OpportunityCard[] = [];
      let events: EventItem[] = [];
      let probability: number | undefined;
      let typicalDayMove: string | undefined;
      let typicalRisk: string | undefined;
      let winRate: number | undefined;
      let avgRMultiple: number | undefined;
      let bestSetupType: string | undefined;
      let biggestLeak: string | undefined;
      let totalTrades = 0;

      // Parse market focus (environment data)
      if (focusRes.status === "fulfilled" && focusRes.value.ok) {
        try {
          const focus = await focusRes.value.json();
          regime = focus.regime || focus.market_regime;
          volState = focus.vol_state || focus.volatility;
          session = focus.session;
          suggestedStrategy = focus.strategy_bias || focus.suggested_strategy;
          // Count events from focus data
          const eventCount = (focus.events?.length ?? 0) + (focus.catalysts?.length ?? 0);
          
          // Build event items
          if (focus.events) {
            events = focus.events.slice(0, 5).map((e: any) => ({
              title: e.title || e.description || e.event || "Scheduled Event",
              severity: e.impact === "high" ? "red" as const : e.impact === "medium" ? "yellow" as const : "green" as const,
              detail: e.time || e.detail,
            }));
          }
        } catch { /* ignore parse errors */ }
      }

      // Parse scanner data for opportunities
      if (eventsRes.status === "fulfilled" && eventsRes.value.ok) {
        try {
          const scanner = await eventsRes.value.json();
          const picks = scanner.data || scanner.picks || scanner.results || [];
          opportunities = picks.slice(0, 6).map((p: any) => ({
            symbol: p.symbol || p.ticker,
            name: p.name || p.company,
            authorization: p.authorization || p.verdict || (p.score >= 70 ? "AUTHORIZED" : p.score >= 40 ? "CONDITIONAL" : "BLOCKED"),
            ru: p.ru ?? p.r_unit,
            expectedMove: p.expected_move ? `$${p.expected_move}` : p.change_percent ? `${p.change_percent > 0 ? "+" : ""}${p.change_percent.toFixed(1)}%` : undefined,
            keyLevel: p.key_level ? `$${p.key_level}` : undefined,
            riskZone: p.stop_level ? `Below $${p.stop_level}` : undefined,
            setupType: p.setup_type || p.direction || (p.score >= 60 ? "Bullish Setup" : "Neutral"),
            warnings: p.warnings || [],
            infoBadges: p.badges || [],
          }));
          // Use first opportunity's score for overall probability
          if (picks[0]?.score) {
            probability = Math.min(99, Math.max(10, picks[0].score));
          }
        } catch { /* ignore */ }
      }

      // Parse journal stats for performance
      if (perfRes.status === "fulfilled" && perfRes.value.ok) {
        try {
          const perf = await perfRes.value.json();
          winRate = perf.win_rate ?? perf.winRate;
          avgRMultiple = perf.avg_r ?? perf.avgRMultiple;
          bestSetupType = perf.best_setup ?? perf.bestSetupType;
          biggestLeak = perf.biggest_leak ?? perf.biggestLeak;
          totalTrades = perf.total_trades ?? perf.totalTrades ?? 0;
        } catch { /* ignore */ }
      }

      setData({
        regime,
        volState,
        riskMode,
        session,
        majorEventsToday: events.filter((e) => e.severity === "red").length,
        suggestedStrategy,
        opportunities,
        events,
        probability,
        typicalDayMove,
        typicalRisk,
        winRate,
        avgRMultiple,
        bestSetupType,
        biggestLeak,
        totalTrades,
      });
    } catch (err) {
      console.error("[RetailDashboard] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    // Refresh every 60s
    const interval = setInterval(fetchDashboard, 60_000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  return (
    <div className="min-h-screen bg-[#0B1120]">
      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Title */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
            <p className="text-slate-400 mt-1">
              Your daily trading overview — powered by MSP engine
            </p>
          </div>
          <Link
            href="/tools/markets"
            className="text-xs text-slate-500 hover:text-teal-400 transition-colors border border-slate-700 rounded-lg px-3 py-1.5"
          >
            Switch to Institutional View →
          </Link>
        </div>

        {/* Section 1 — Market Pulse Bar */}
        <MarketPulseBar
          regime={data?.regime}
          volState={data?.volState}
          riskMode={data?.riskMode}
          session={data?.session}
        />

        {/* Section 2 — Today's Focus */}
        <TodaysEnvironmentCard
          regime={data?.regime}
          volState={data?.volState}
          majorEventsToday={data?.majorEventsToday ?? 0}
          suggestedStrategy={data?.suggestedStrategy}
        />

        {/* Section 3 — Watchlist Opportunities */}
        <WatchlistOpportunityGrid
          opportunities={data?.opportunities ?? []}
          loading={loading}
        />

        {/* Section 4 + 5 — Strength Meter + Events side by side on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SetupStrengthMeter
            probability={data?.probability}
            typicalDayMove={data?.typicalDayMove}
            typicalRisk={data?.typicalRisk}
          />
          <RetailEventRiskPanel
            events={data?.events ?? []}
            loading={loading}
          />
        </div>

        {/* Section 6 — Performance Snapshot */}
        <PerformanceSnapshot
          winRate={data?.winRate}
          avgRMultiple={data?.avgRMultiple}
          bestSetupType={data?.bestSetupType}
          biggestLeak={data?.biggestLeak}
          totalTrades={data?.totalTrades}
          loading={loading}
        />

        {/* Not logged in prompt */}
        {!tierLoading && !isLoggedIn && (
          <div className="bg-gradient-to-r from-teal-500/10 to-blue-500/10 border border-teal-500/30 rounded-2xl p-8 text-center">
            <h2 className="text-2xl font-bold text-white mb-2">
              Start Trading with Confidence
            </h2>
            <p className="text-slate-300 mb-4">
              Sign in or create an account to see personalized opportunities and track your performance.
            </p>
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              Get Started →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
