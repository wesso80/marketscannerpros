'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { fireAutoLog } from '@/lib/autoLog';
import {
  InstitutionalStateStrip,
  MarketsToolbar,
  DecisionLens,
  TickerTabs,
  RightRail,
  useTickerData,
  useDecisionLens,
} from '@/components/markets';
import type { AssetClass } from '@/components/markets/types';
import { useUserTier, canAccessPortfolioInsights } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';
import CorrelationConfluenceCard from '@/components/CorrelationConfluenceCard';
import { useRegisterPageData } from '@/lib/ai/pageContext';

/**
 * Unified Markets Page
 *
 * "Fewer doors, same power."
 * Absorbs: Equity Explorer, Crypto Explorer, Derivatives, Options, News,
 *          Economic Calendar, Time Confluence — into one institutional cockpit.
 *
 * Architecture:
 *   ┌────────────────────────────────────────────────────────┐
 *   │ InstitutionalStateStrip (sticky)                       │
 *   ├────────────────────────────────────────────────────────┤
 *   │ MarketsToolbar (asset toggle + search)                 │
 *   ├──────────────────────────────┬─────────────────────────┤
 *   │ DecisionLens (3-col)        │ RightRail               │
 *   ├──────────────────────────────┤  • QuickStats           │
 *   │ TickerTabs (6 tabs)         │  • TradePreview          │
 *   │  • Overview                 │  • SectorHeatmap         │
 *   │  • Structure                │  • Watchlist             │
 *   │  • Options                  │                          │
 *   │  • Flow                     │                          │
 *   │  • News & Events            │                          │
 *   │  • Time                     │                          │
 *   └──────────────────────────────┴─────────────────────────┘
 */
export default function MarketsPage() {
  const { tier, isLoading } = useUserTier();
  const [assetClass, setAssetClass] = useState<AssetClass>('equities');
  const [symbol, setSymbol] = useState<string>('');

  const ctx = useTickerData(symbol || null, assetClass);
  const lens = useDecisionLens(ctx);

  // ── Auto-log to execution engine when Markets scanner produces a signal ──
  const marketsAutoLogRef = useRef<string>('');
  useEffect(() => {
    if (!ctx.scanner || !ctx.symbol) return;
    const { direction, score, entry } = ctx.scanner;
    if (!direction || (score ?? 0) < 60) return;
    if (lens && lens.authorization === 'BLOCK') return;
    const key = `${ctx.symbol}:${direction}:${score}`;
    if (marketsAutoLogRef.current === key) return;
    marketsAutoLogRef.current = key;
    const ac = ctx.assetClass === 'crypto' ? 'crypto' as const : 'equity' as const;
    fireAutoLog({
      symbol: ctx.symbol.toUpperCase(),
      conditionType: 'markets_cockpit',
      conditionMet: `${direction}_SCORE_${score}`,
      triggerPrice: entry ?? ctx.quote?.price ?? 0,
      source: 'markets_dashboard',
      assetClass: ac,
      atr: null,
    }).catch(() => {});
  }, [ctx.scanner, ctx.symbol, ctx.assetClass, ctx.quote?.price, lens]);

  // ── Register ALL page data with the AI context system ──
  // This feeds the MSPCopilot floating panel with real data instead of generic hallucinations.
  const aiData = useMemo<Record<string, unknown>>(() => {
    if (!ctx.symbol) return {};

    const data: Record<string, unknown> = {
      symbol: ctx.symbol,
      assetClass: ctx.assetClass,
    };

    // Quote
    if (ctx.quote) {
      data.currentPrice = ctx.quote.price;
      data.change = ctx.quote.change;
      data.changePercent = ctx.quote.changePercent;
      data.volume = ctx.quote.volume;
    }

    // Decision Lens (the exact same values shown in the IDL card)
    if (lens) {
      data.verdict = lens.verdict;
      data.alignment = lens.alignment;
      data.confidence = lens.confidence;
      data.authorization = lens.authorization;
      data.ruBudget = lens.ruBudget;
      data.bullScenario = lens.bullScenario;
      data.bearScenario = lens.bearScenario;
      data.rMultiple = lens.rMultiple;
      data.volState = lens.volState;
      data.eventRisk = lens.eventRisk;
      data.liquidityGrade = lens.liquidityGrade;
      data.expectedMove = lens.expectedMove;
    }

    // Scanner
    if (ctx.scanner) {
      data.direction = ctx.scanner.direction === 'LONG' ? 'bullish' : 'bearish';
      data.scannerScore = ctx.scanner.score;
      data.scannerConfidence = ctx.scanner.confidence;
      data.setup = ctx.scanner.setup;
      data.entry = ctx.scanner.entry;
      data.stop = ctx.scanner.stop;
      data.target = ctx.scanner.target;
      data.scannerRMultiple = ctx.scanner.rMultiple;
      data.indicators = ctx.scanner.indicators;
      data.levels = ctx.scanner.levels;
    }

    // Flow (options flow / gamma / conviction)
    if (ctx.flow) {
      data.marketMode = ctx.flow.market_mode;
      data.gammaState = ctx.flow.gamma_state;
      data.flowBias = ctx.flow.bias;
      data.flowConviction = ctx.flow.conviction;
      data.keyStrikes = ctx.flow.key_strikes?.slice(0, 6);
      data.gammaFlipZones = ctx.flow.flip_zones?.slice(0, 4);
      data.liquidityLevels = ctx.flow.liquidity_levels?.slice(0, 5);
      data.mostLikelyPath = ctx.flow.most_likely_path;
      data.riskFactors = ctx.flow.risk;
      if (ctx.flow.probability_matrix) {
        data.probabilityMatrix = ctx.flow.probability_matrix;
      }
    }

    // Options (equity only)
    if (ctx.options) {
      data.iv = ctx.options.iv;
      data.ivRank = ctx.options.ivRank;
      data.optionsExpectedMove = ctx.options.expectedMove;
      data.putCallRatio = ctx.options.putCallRatio;
      data.maxPain = ctx.options.maxPain;
      data.gex = ctx.options.gex;
      data.dex = ctx.options.dex;
      data.topStrikes = ctx.options.topStrikes?.slice(0, 5);
    }

    // Crypto derivatives
    if (ctx.cryptoDerivatives) {
      data.fundingRate = ctx.cryptoDerivatives.fundingRate;
      data.longShortRatio = ctx.cryptoDerivatives.longShortRatio;
      data.cryptoSentiment = ctx.cryptoDerivatives.sentiment;
      data.openInterest = ctx.cryptoDerivatives.openInterest;
      if (ctx.cryptoDerivatives.liquidations) {
        data.liquidations = ctx.cryptoDerivatives.liquidations;
      }
    }

    // Upcoming events (for event risk awareness)
    if (ctx.earnings.length > 0) {
      data.upcomingEarnings = ctx.earnings.slice(0, 3).map(e => ({
        symbol: e.symbol, reportDate: e.reportDate, estimate: e.estimate,
      }));
    }
    if (ctx.economic.length > 0) {
      data.upcomingEconomic = ctx.economic.slice(0, 3).map(e => ({
        event: e.event, date: e.date, impact: e.impact,
      }));
    }

    return data;
  }, [ctx, lens]);

  const aiSummary = useMemo(() => {
    if (!ctx.symbol || !lens) return undefined;
    return `${ctx.symbol} (${ctx.assetClass}) — Verdict: ${lens.verdict.toUpperCase()}, ` +
      `Alignment: ${lens.alignment}%, Confidence: ${lens.confidence}%, ` +
      `Authorization: ${lens.authorization}, R-Budget: ${lens.ruBudget}` +
      (ctx.flow ? `, Flow: ${ctx.flow.market_mode}/${ctx.flow.gamma_state}/${ctx.flow.bias} (${ctx.flow.conviction}% conviction)` : '') +
      (ctx.scanner ? `, Scanner: ${ctx.scanner.direction} ${ctx.scanner.setup} score=${ctx.scanner.score}` : '');
  }, [ctx, lens]);

  useRegisterPageData(
    'market_movers',
    aiData,
    ctx.symbol ? [ctx.symbol] : [],
    aiSummary,
  );

  if (isLoading) return <div className="min-h-screen bg-[var(--msp-bg)]" />;
  if (!canAccessPortfolioInsights(tier)) return <UpgradeGate requiredTier="pro" feature="Markets Cockpit" />;

  return (
    <div className="min-h-screen bg-[var(--msp-bg)] px-2 py-3 text-slate-100 md:px-3">
      <div className="mx-auto grid w-full max-w-none gap-2">
        {/* 1. Institutional State Strip — sticky regime/risk/R-budget bar */}
        <InstitutionalStateStrip />

        {/* 2. Toolbar — asset class toggle + unified ticker search */}
        <MarketsToolbar
          assetClass={assetClass}
          onAssetClassChange={setAssetClass}
          symbol={symbol}
          onSymbolChange={setSymbol}
        />

        {/* 3. Main content: Decision Lens + Tabs (left) + Right Rail */}
        <div className="grid gap-2 xl:grid-cols-[1fr_320px]">
          {/* Left column — Decision Lens on top, TickerTabs below */}
          <div className="grid gap-2">
            <DecisionLens ctx={ctx} />
            <TickerTabs ctx={ctx} />
            {symbol && (
              <CorrelationConfluenceCard
                symbol={symbol}
                type={assetClass === 'crypto' ? 'crypto' : 'equity'}
              />
            )}
          </div>

          {/* Right rail — contextual support */}
          <aside className="hidden xl:block">
            <div className="sticky top-[52px]">
              <RightRail ctx={ctx} />
            </div>
          </aside>
        </div>

        {/* Mobile right rail — stacked below on smaller screens */}
        <div className="xl:hidden">
          <RightRail ctx={ctx} />
        </div>
      </div>
    </div>
  );
}
