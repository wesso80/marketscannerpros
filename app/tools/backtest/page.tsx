'use client';

import { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ToolsPageHeader from '@/components/ToolsPageHeader';
import UpgradeGate from '@/components/UpgradeGate';
import { useUserTier, canAccessBacktest } from '@/lib/useUserTier';
import { useAIPageContext } from '@/lib/ai/pageContext';
import { writeOperatorState } from '@/lib/operatorState';
import CommandCenterStateBar from '@/components/CommandCenterStateBar';
import {
  BACKTEST_STRATEGY_CATEGORIES,
  BACKTEST_TIMEFRAME_GROUPS,
  DEFAULT_BACKTEST_STRATEGY,
  getBacktestStrategy,
  isBacktestStrategy,
} from '@/lib/strategies/registry';
import {
  findEdgeGroupForStrategyWithPreference,
  findEdgeGroupForStrategy,
  getPreferredStrategyForEdgeGroup,
  STRATEGY_EDGE_GROUPS,
  type EdgeGroupId,
} from '@/lib/backtest/edgeGroups';
import { parseBacktestTimeframe } from '@/lib/backtest/timeframe';
import { buildInverseComparisonSnapshot } from '@/lib/backtest/inverseComparison';
import { createWorkflowEvent, emitWorkflowEvents } from '@/lib/workflow/client';
import type { JournalDraft, TradePlan } from '@/lib/workflow/types';

interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  cagr: number;
  volatility: number;
  sortinoRatio: number;
  calmarRatio: number;
  timeInMarket: number;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
  equityCurve: EquityPoint[];
  trades: Trade[];
  dataSources?: {
    priceData: 'alpha_vantage' | 'binance' | 'coingecko';
    assetType: 'stock' | 'crypto';
  };
  signalReplay?: {
    snapshots: number;
    qualifiedSignals: number;
    mode: 'brain_signal_replay' | 'options_signal_replay' | 'time_scanner_signal_replay';
    minSignalScore: number;
    sourceFilterLabel?: string;
    symbolCandidates?: string[];
    noDataReason?: string | null;
    filterStats?: {
      rejectedByScore: number;
      rejectedByNeutralBias: number;
      rejectedByOutOfRange: number;
    };
  };
  dataCoverage?: {
    requested: { startDate: string; endDate: string };
    applied: { startDate: string; endDate: string };
    minAvailable: string;
    maxAvailable: string;
    bars: number;
    provider?: 'alpha_vantage' | 'binance' | 'coingecko';
  };
  validation?: {
    status: 'validated' | 'invalidated' | 'mixed';
    direction: 'bullish' | 'bearish' | 'both';
    reason: string;
    suggestedAlternatives?: Array<{ strategyId: string; why: string }>;
  };
  strategyProfile?: {
    id: string;
    label: string;
    direction: 'bullish' | 'bearish' | 'both';
    invalidation?: {
      status: 'valid' | 'watch' | 'invalidated';
      rule: string;
      reason: string;
    };
  };
  diagnostics?: {
    score: number;
    verdict: 'healthy' | 'watch' | 'invalidated';
    failureTags: string[];
    summary: string;
    adjustments: Array<{
      key: string;
      title: string;
      reason: string;
    }>;
    invalidation: {
      status: 'valid' | 'watch' | 'invalidated';
      rule: string;
      reason: string;
    };
  };
}

interface Trade {
  entryDate: string;
  exitDate: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  direction?: 'long' | 'short';
  entryTs?: string;
  exitTs?: string;
  entry: number;
  exit: number;
  return: number;
  returnPercent: number;
  mfe?: number;
  mae?: number;
  exitReason?: 'stop' | 'target' | 'timeout' | 'signal_flip' | 'manual' | 'end_of_data';
  holdingPeriodDays: number;
}

interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number;
}

interface TimeframeScanResult {
  timeframe: string;
  totalReturn: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  totalTrades: number;
  score: number;
}

interface UniverseScanResult {
  symbol: string;
  timeframe: string;
  totalReturn: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  totalTrades: number;
  score: number;
}

type DateAnchorSource = 'ipo' | 'coverage' | 'fallback';

type DateAnchorInfo = {
  source: DateAnchorSource;
  startDate: string;
  assetType: 'stock' | 'crypto' | 'unknown';
};

function BacktestContent() {
  const lastPlanEventKeyRef = useRef('');
  const previousEdgeGroupRef = useRef<EdgeGroupId | null>(null);
  const lastResolvedSymbolRef = useRef('');
  const searchParams = useSearchParams();
  const { tier, isLoading: tierLoading } = useUserTier();
  
  // Query params from Options Scanner
  const urlSymbol = searchParams.get('symbol');
  const urlDirection = searchParams.get('direction');
  const urlStrategy = searchParams.get('strategy');
  const fromOptionsScanner = searchParams.get('from') === 'options-scanner';
  
  const [symbol, setSymbol] = useState(urlSymbol?.toUpperCase() || 'SPY');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [initialCapital, setInitialCapital] = useState('10000');
  const [strategy, setStrategy] = useState(DEFAULT_BACKTEST_STRATEGY);
  const [edgeGroup, setEdgeGroup] = useState<EdgeGroupId>('msp_aio_systems');
  const [timeframe, setTimeframe] = useState('daily');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<BacktestResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [backtestError, setBacktestError] = useState<string | null>(null);
  const [showOptionsBanner, setShowOptionsBanner] = useState(fromOptionsScanner);
  const [showEvidenceLayer, setShowEvidenceLayer] = useState(false);
  const [showInverseComparison, setShowInverseComparison] = useState(false);
  const [showReplayDetails, setShowReplayDetails] = useState(false);
  const [replayMinSignalScore, setReplayMinSignalScore] = useState(60);
  const [isScanningTimeframes, setIsScanningTimeframes] = useState(false);
  const [timeframeScanResults, setTimeframeScanResults] = useState<TimeframeScanResult[]>([]);
  const [timeframeScanError, setTimeframeScanError] = useState<string | null>(null);
  const [universeSymbolsInput, setUniverseSymbolsInput] = useState('SPY, QQQ, AAPL, MSFT, NVDA, TSLA, AMZN, META');
  const [isScanningUniverse, setIsScanningUniverse] = useState(false);
  const [universeScanResults, setUniverseScanResults] = useState<UniverseScanResult[]>([]);
  const [universeScanError, setUniverseScanError] = useState<string | null>(null);
  const [recommendationStrategy, setRecommendationStrategy] = useState(DEFAULT_BACKTEST_STRATEGY);
  const [recommendationTimeframe, setRecommendationTimeframe] = useState('daily');
  const [recommendationStartDate, setRecommendationStartDate] = useState('2024-01-01');
  const [recommendationEndDate, setRecommendationEndDate] = useState('2024-12-31');
  const [recommendationMinSignalScore, setRecommendationMinSignalScore] = useState(60);
  const [planEventId, setPlanEventId] = useState<string | null>(null);
  const [dateAnchorInfo, setDateAnchorInfo] = useState<DateAnchorInfo | null>(null);

  const workflowId = useMemo(() => {
    const dateKey = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `wf_backtest_${symbol}_${dateKey}`;
  }, [symbol]);

  // AI Page Context - share backtest results with copilot
  const { setPageData } = useAIPageContext();

  const edgeGroupCategories = useMemo(() => {
    const categoryMap = new Map(BACKTEST_STRATEGY_CATEGORIES.map((category) => [category.id, category]));

    return STRATEGY_EDGE_GROUPS.map((group) => ({
      ...group,
      categories: group.categoryIds
        .map((id) => categoryMap.get(id))
        .filter((category): category is (typeof BACKTEST_STRATEGY_CATEGORIES)[number] => Boolean(category)),
    }));
  }, []);

  const activeEdgeGroup = edgeGroupCategories.find((group) => group.id === edgeGroup) ?? edgeGroupCategories[0];
  const activeEdgeStrategies = activeEdgeGroup?.categories.flatMap((category) => category.strategies) ?? [];

  const strategyMeta = getBacktestStrategy(strategy);
  const getWorkflowAssetClass = (assetType?: 'stock' | 'crypto') => (assetType === 'crypto' ? 'crypto' : 'equity');
  const inverseComparison = useMemo(() => {
    if (!results || !showInverseComparison) return null;
    return buildInverseComparisonSnapshot(results);
  }, [results, showInverseComparison]);

  const journalDraftHref = useMemo(() => {
    if (!results) return '/tools/journal';

    const bias = results.totalReturn > 2 ? 'bullish' : results.totalReturn < -2 ? 'bearish' : 'neutral';
    const score = Math.max(
      1,
      Math.min(
        99,
        Math.round((results.profitFactor * 25) + (results.winRate * 0.35) - (results.maxDrawdown * 0.45))
      )
    );

    const params = new URLSearchParams({
      source: 'backtest',
      symbol,
      strategy,
      setup: strategyMeta?.label || strategy,
      timeframe,
      bias,
      score: String(score),
      assetClass: getWorkflowAssetClass(results.dataSources?.assetType),
      workflowId,
      parentEventId: planEventId || '',
    });

    return `/tools/journal?${params.toString()}`;
  }, [results, symbol, strategy, strategyMeta, timeframe, workflowId, planEventId]);

  useEffect(() => {
    if (!urlStrategy) return;
    if (!isBacktestStrategy(urlStrategy)) return;
    setStrategy(urlStrategy);
  }, [urlStrategy]);

  useEffect(() => {
    const matchingGroup = findEdgeGroupForStrategyWithPreference(strategy, edgeGroup, STRATEGY_EDGE_GROUPS);

    if (!matchingGroup) return;
    setEdgeGroup((previous) => (previous === matchingGroup.id ? previous : matchingGroup.id));
  }, [strategy]);

  useEffect(() => {
    if (!activeEdgeStrategies.length) return;

    const currentEdgeGroup = edgeGroup;
    const previousEdgeGroup = previousEdgeGroupRef.current;
    previousEdgeGroupRef.current = currentEdgeGroup;

    const availableStrategyIds = activeEdgeStrategies.map((item) => item.id);
    const strategyAllowed = availableStrategyIds.includes(strategy);

    if (previousEdgeGroup !== currentEdgeGroup) {
      const preferredStrategy = getPreferredStrategyForEdgeGroup(currentEdgeGroup, availableStrategyIds);
      if (preferredStrategy && preferredStrategy !== strategy) {
        setStrategy(preferredStrategy);
        return;
      }
    }

    if (!strategyAllowed) {
      const fallbackStrategy = getPreferredStrategyForEdgeGroup(currentEdgeGroup, availableStrategyIds);
      if (fallbackStrategy && fallbackStrategy !== strategy) {
        setStrategy(fallbackStrategy);
      }
    }
  }, [edgeGroup, activeEdgeStrategies, strategy]);

  useEffect(() => {
    if (results) {
      setPageData({
        skill: 'backtest',
        symbols: [symbol],
        data: {
          symbol,
          strategy,
          timeframe,
          startDate,
          endDate,
          totalTrades: results.totalTrades,
          winRate: results.winRate,
          totalReturn: results.totalReturn,
          maxDrawdown: results.maxDrawdown,
          profitFactor: results.profitFactor,
          sharpeRatio: results.sharpeRatio,
          cagr: results.cagr,
        },
        summary: `Backtest ${symbol} (${strategy}): ${results.winRate.toFixed(1)}% win rate, ${results.totalReturn >= 0 ? '+' : ''}${results.totalReturn.toFixed(1)}% return, ${results.maxDrawdown.toFixed(1)}% max drawdown`,
      });
    }
  }, [results, symbol, strategy, timeframe, startDate, endDate, setPageData]);

  useEffect(() => {
    if (!results) return;

    const edge = Math.max(
      1,
      Math.min(
        99,
        Math.round((results.profitFactor * 25) + (results.winRate * 0.35) - (results.maxDrawdown * 0.45))
      )
    );
    const bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = results.totalReturn > 2
      ? 'BULLISH'
      : results.totalReturn < -2
      ? 'BEARISH'
      : 'NEUTRAL';
    const action: 'WAIT' | 'PREP' | 'EXECUTE' = results.profitFactor >= 1.25 && results.maxDrawdown <= 20
      ? 'EXECUTE'
      : results.profitFactor >= 1
      ? 'PREP'
      : 'WAIT';
    const risk: 'LOW' | 'MODERATE' | 'HIGH' = results.maxDrawdown <= 10
      ? 'LOW'
      : results.maxDrawdown <= 20
      ? 'MODERATE'
      : 'HIGH';

    writeOperatorState({
      symbol,
      edge,
      bias,
      action,
      risk,
      next: action === 'EXECUTE' ? 'Deploy live with guardrails' : action === 'PREP' ? 'Refine and rerun sample' : 'Reject setup and iterate',
      mode: 'EXECUTE',
    });
  }, [results, symbol]);

  useEffect(() => {
    if (!results) return;

    const eventKey = `${symbol}:${strategy}:${timeframe}:${results.totalTrades}:${results.winRate}:${results.totalReturn}`;
    if (lastPlanEventKeyRef.current === eventKey) return;
    lastPlanEventKeyRef.current = eventKey;

    const direction = results.totalReturn >= 0 ? 'long' : 'short';
    const entry = results.trades[0]?.entry ?? 0;
    const stop = direction === 'long' ? entry * 0.99 : entry * 1.01;
    const target = direction === 'long' ? entry * 1.02 : entry * 0.98;
    const riskAmount = Number(initialCapital) * 0.0025;
    const unitRisk = Math.max(Math.abs(entry - stop), 0.01);
    const quantity = Math.max(1, Math.floor(riskAmount / unitRisk));
    const workflowAssetClass = getWorkflowAssetClass(results.dataSources?.assetType);

    const tradePlan: TradePlan = {
      plan_id: `plan_${symbol}_${Date.now()}`,
      created_at: new Date().toISOString(),
      symbol,
      asset_class: workflowAssetClass,
      direction,
      timeframe,
      setup: {
        strategy,
        label: strategyMeta?.label || strategy,
        tags: [activeEdgeGroup?.label || 'edge_group'],
      },
      entry: {
        type: 'market',
        price: Number(entry.toFixed(4)),
      },
      risk: {
        stop: { type: 'price', price: Number(stop.toFixed(4)) },
        take_profit: [{ type: 'rr', rr: 2, price: Number(target.toFixed(4)), size_pct: 100 }],
        invalidate_if: [{ type: 'max_drawdown', value: Number(results.maxDrawdown.toFixed(2)) }],
      },
      position_sizing: {
        account_value: Number(initialCapital),
        risk_per_trade_pct: 0.25,
        risk_amount: Number(riskAmount.toFixed(2)),
        unit_risk: Number(unitRisk.toFixed(4)),
        quantity,
      },
      links: {
        symbol,
        strategy,
      },
    };

    const event = createWorkflowEvent({
      eventType: 'trade.plan.created',
      workflowId,
      route: '/tools/backtest',
      module: 'backtest',
      entity: {
        entity_type: 'trade_plan',
        entity_id: tradePlan.plan_id,
        symbol,
        asset_class: tradePlan.asset_class,
      },
      payload: {
        trade_plan: tradePlan,
      },
    });

    setPlanEventId(event.event_id);
    emitWorkflowEvents([event]);
  }, [results, symbol, strategy, timeframe, strategyMeta, activeEdgeGroup?.label, initialCapital, workflowId]);

  const handleAutoJournalDraftClick = () => {
    if (!results) return;

    const draft: JournalDraft = {
      journal_id: `jrnl_draft_${symbol}_${Date.now()}`,
      created_at: new Date().toISOString(),
      symbol,
      asset_class: getWorkflowAssetClass(results.dataSources?.assetType),
      side: results.totalReturn >= 0 ? 'long' : 'short',
      trade_type: 'spot',
      quantity: 1,
      prices: {
        entry: results.trades[0]?.entry ?? null,
        stop: null,
        target: null,
        exit: null,
      },
      strategy,
      tags: ['backtest', 'auto_draft'],
      auto_context: {
        market_mode: 'evaluate',
        risk_state: results.maxDrawdown <= 10 ? 'controlled' : results.maxDrawdown <= 20 ? 'moderate' : 'elevated',
        win_rate: Number(results.winRate.toFixed(2)),
      },
      why_this_trade_auto: [
        `Backtest confidence ${Math.round(results.winRate)}% win rate`,
        `Profit factor ${results.profitFactor.toFixed(2)}`,
        `Max drawdown ${results.maxDrawdown.toFixed(2)}%`,
      ],
      user_inputs_required: {
        entry_reason: { status: 'required', prompt: 'Why did you enter?' },
        emotions: { status: 'required', prompt: 'How did you feel at entry?' },
      },
      links: {
        plan_event_id: planEventId,
      },
    };

    const event = createWorkflowEvent({
      eventType: 'journal.draft.created',
      workflowId,
      parentEventId: planEventId,
      route: '/tools/backtest',
      module: 'backtest',
      entity: {
        entity_type: 'journal',
        entity_id: draft.journal_id,
        symbol,
        asset_class: draft.asset_class,
      },
      payload: {
        journal_draft: draft,
      },
    });

    emitWorkflowEvents([event]);
  };

  // Update symbol if URL param changes
  useEffect(() => {
    if (urlSymbol) {
      setSymbol(urlSymbol.toUpperCase());
    }
  }, [urlSymbol]);

  useEffect(() => {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (!normalizedSymbol) return;
    if (normalizedSymbol === lastResolvedSymbolRef.current) return;

    let cancelled = false;

    const timer = setTimeout(async () => {
      const today = new Date().toISOString().slice(0, 10);
      const fallbackStart = new Date(`${today}T00:00:00Z`);
      fallbackStart.setUTCFullYear(fallbackStart.getUTCFullYear() - 5);
      const fallbackStartDate = fallbackStart.toISOString().slice(0, 10);
      let coverageStartDate: string | null = null;

      try {
        const rangeResponse = await fetch(`/api/backtest/symbol-range?symbol=${encodeURIComponent(normalizedSymbol)}`, {
          cache: 'no-store',
        });

        const rangePayload = rangeResponse.ok ? await rangeResponse.json() : null;
        const assetType = String(rangePayload?.assetType || '').toLowerCase();
        coverageStartDate = typeof rangePayload?.coverage?.startDate === 'string'
          ? rangePayload.coverage.startDate
          : null;

        if (!cancelled && assetType === 'crypto') {
          const resolvedStart = coverageStartDate || fallbackStartDate;
          setStartDate(resolvedStart);
          setEndDate(today);
          setDateAnchorInfo({
            source: coverageStartDate ? 'coverage' : 'fallback',
            startDate: resolvedStart,
            assetType: 'crypto',
          });
          lastResolvedSymbolRef.current = normalizedSymbol;
          return;
        }

        const response = await fetch(`/api/company-overview?symbol=${encodeURIComponent(normalizedSymbol)}&includeQuote=0`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          if (!cancelled) {
            const fallbackStartForEquity =
              coverageStartDate && /^\d{4}-\d{2}-\d{2}$/.test(coverageStartDate)
                ? (coverageStartDate < fallbackStartDate ? coverageStartDate : fallbackStartDate)
                : fallbackStartDate;
            setStartDate(fallbackStartForEquity);
            setEndDate(today);
            setDateAnchorInfo({
              source: coverageStartDate ? 'coverage' : 'fallback',
              startDate: fallbackStartForEquity,
              assetType: 'stock',
            });
            lastResolvedSymbolRef.current = normalizedSymbol;
          }
          return;
        }

        const payload = await response.json();
        const rawIpoDate = payload?.data?.ipoDate;
        const ipoDate =
          typeof rawIpoDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawIpoDate)
            ? rawIpoDate
            : null;

        if (cancelled) return;

        if (ipoDate) {
          setStartDate(ipoDate);
          setDateAnchorInfo({ source: 'ipo', startDate: ipoDate, assetType: 'stock' });
        } else if (coverageStartDate) {
          const resolvedStart = coverageStartDate < fallbackStartDate ? coverageStartDate : fallbackStartDate;
          setStartDate(resolvedStart);
          setDateAnchorInfo({ source: 'coverage', startDate: resolvedStart, assetType: 'stock' });
        } else {
          setStartDate(fallbackStartDate);
          setDateAnchorInfo({ source: 'fallback', startDate: fallbackStartDate, assetType: 'stock' });
        }

        setEndDate(today);
        lastResolvedSymbolRef.current = normalizedSymbol;
      } catch {
        if (cancelled) return;
        const fallbackStartForEquity =
          coverageStartDate && /^\d{4}-\d{2}-\d{2}$/.test(coverageStartDate)
            ? (coverageStartDate < fallbackStartDate ? coverageStartDate : fallbackStartDate)
            : fallbackStartDate;
        setStartDate(fallbackStartForEquity);
        setEndDate(today);
        setDateAnchorInfo({
          source: coverageStartDate ? 'coverage' : 'fallback',
          startDate: fallbackStartForEquity,
          assetType: 'unknown',
        });
        lastResolvedSymbolRef.current = normalizedSymbol;
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [symbol]);

  // Tier gate - Pro Trader only
  if (tierLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#94a3b8' }}>Loading...</div>
      </div>
    );
  }

  if (!canAccessBacktest(tier)) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a' }}>
        <ToolsPageHeader
          badge="ELITE STRATEGY LAB"
          title="Strategy Backtester"
          subtitle="Pro Trader exclusive: Test and iterate trading ideas with historical data."
          icon="🧪"
          backHref="/dashboard"
        />
        <UpgradeGate requiredTier="pro_trader" feature="Elite Strategy Backtesting">
          <ul style={{ textAlign: 'left', color: '#94a3b8', fontSize: '14px', marginBottom: '24px', paddingLeft: '20px' }}>
            <li>🔥 25+ elite trading strategies (MSP, scalping, swing)</li>
            <li>⏱️ Multi-timeframe testing (15m, 30m, 1h, daily)</li>
            <li>📊 Real Alpha Vantage market data</li>
            <li>📈 Full performance metrics & equity curves</li>
            <li>🤖 AI-powered backtest analysis</li>
            <li>💹 Intraday scalping & swing trade strategies</li>
          </ul>
        </UpgradeGate>
      </div>
    );
  }

  const getMinimumDaysForTimeframe = (value: string) => {
    const parsed = parseBacktestTimeframe(value);
    if (!parsed) return 21;

    const minutes = parsed.minutes;

    if (minutes >= 525600) return 365 * 3;
    if (minutes >= 43200) return 365 * 2;
    if (minutes >= 10080) return 365;
    if (minutes >= 1440) return 120;

    if (minutes <= 1) return 3;
    if (minutes <= 5) return 5;
    if (minutes <= 15) return 10;
    if (minutes <= 30) return 14;
    if (minutes <= 60) return 21;
    if (minutes <= 240) return 45;
    return 90;
  };

  const getRangeDays = (from: string, to: string) => {
    const start = new Date(`${from}T00:00:00Z`).getTime();
    const end = new Date(`${to}T00:00:00Z`).getTime();
    return Math.floor((end - start) / 86400000) + 1;
  };

  const isReplayStrategy =
    strategy === 'brain_signal_replay' ||
    strategy === 'options_signal_replay' ||
    strategy === 'time_scanner_signal_replay';

  const applySuggestedDateRange = () => {
    const minDays = getMinimumDaysForTimeframe(timeframe);
    const end = new Date(`${endDate}T00:00:00Z`);
    if (Number.isNaN(end.getTime())) return;
    end.setUTCDate(end.getUTCDate() - (minDays - 1));
    const suggestedStart = end.toISOString().slice(0, 10);
    setStartDate(suggestedStart);
    setBacktestError(null);
  };

  const expandDateRange = (extraDays: number): string | null => {
    const start = new Date(`${startDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime())) return null;
    start.setUTCDate(start.getUTCDate() - Math.max(1, extraDays));
    const nextStartDate = start.toISOString().slice(0, 10);
    setStartDate(nextStartDate);
    setBacktestError(null);
    return nextStartDate;
  };

  const resolveBacktestEndpoint = (strategyId: string) => (
    strategyId === 'brain_signal_replay'
      ? '/api/backtest/brain'
      : strategyId === 'options_signal_replay'
        ? '/api/backtest/options'
        : strategyId === 'time_scanner_signal_replay'
          ? '/api/backtest/time-scanner'
          : '/api/backtest'
  );

  const requestBacktest = async (params: {
    strategy: string;
    timeframe: string;
    startDate: string;
    endDate: string;
    replayMinSignalScore: number;
    symbol?: string;
  }): Promise<BacktestResult> => {
    const response = await fetch(resolveBacktestEndpoint(params.strategy), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: params.symbol ?? symbol,
        strategy: params.strategy,
        startDate: params.startDate,
        endDate: params.endDate,
        initialCapital: parseFloat(initialCapital),
        timeframe: params.timeframe,
        minSignalScore: params.replayMinSignalScore,
      })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.error || 'Backtest failed');
    }
    if (result.error) {
      throw new Error(result.error);
    }

    return result as BacktestResult;
  };

  const scanBestTimeframe = async () => {
    if (!Number.isFinite(parseFloat(initialCapital)) || parseFloat(initialCapital) <= 0) {
      setBacktestError('Initial capital must be greater than 0.');
      return;
    }

    const baselineRangeDays = getRangeDays(startDate, endDate);
    if (!Number.isFinite(baselineRangeDays) || baselineRangeDays <= 0) {
      setBacktestError('Please select a valid date range before scanning.');
      return;
    }

    const candidateTimeframes = Array.from(new Set([
      timeframe,
      '5min',
      '15min',
      '30min',
      '60min',
      '4h',
      'daily',
      '1w',
    ]));

    setIsScanningTimeframes(true);
    setTimeframeScanError(null);
    setTimeframeScanResults([]);
    setBacktestError(null);

    try {
      const rows: TimeframeScanResult[] = [];

      for (const tf of candidateTimeframes) {
        const minDays = getMinimumDaysForTimeframe(tf);
        if (baselineRangeDays < minDays) {
          continue;
        }

        try {
          const result = await requestBacktest({
            strategy,
            timeframe: tf,
            startDate,
            endDate,
            replayMinSignalScore,
          });

          const score =
            result.totalReturn +
            (result.winRate * 0.15) +
            (result.profitFactor * 8) -
            (result.maxDrawdown * 0.3);

          rows.push({
            timeframe: tf,
            totalReturn: result.totalReturn,
            winRate: result.winRate,
            profitFactor: result.profitFactor,
            maxDrawdown: result.maxDrawdown,
            totalTrades: result.totalTrades,
            score,
          });
        } catch {
          continue;
        }
      }

      const ranked = rows.sort((a, b) => b.score - a.score);
      setTimeframeScanResults(ranked);

      if (!ranked.length) {
        setTimeframeScanError('No timeframe candidates produced a valid backtest for this strategy and date range.');
      }
    } finally {
      setIsScanningTimeframes(false);
    }
  };

  const applyBestTimeframeAndRerun = async () => {
    if (!timeframeScanResults.length) return;
    const best = timeframeScanResults[0];
    setTimeframe(best.timeframe);
    await runBacktest({ timeframe: best.timeframe });
  };

  const parseUniverseSymbols = () => {
    const parsed = universeSymbolsInput
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter((value) => value.length > 0);

    return Array.from(new Set(parsed));
  };

  const scanBestUniversePair = async () => {
    const symbols = parseUniverseSymbols();
    if (symbols.length === 0) {
      setUniverseScanError('Please enter at least one symbol in the universe list.');
      return;
    }

    const baselineRangeDays = getRangeDays(startDate, endDate);
    if (!Number.isFinite(baselineRangeDays) || baselineRangeDays <= 0) {
      setUniverseScanError('Please select a valid date range before scanning.');
      return;
    }

    const candidateTimeframes = Array.from(new Set([
      timeframe,
      '5min',
      '15min',
      '30min',
      '60min',
      '4h',
      'daily',
    ]));

    const maxCombos = 60;
    const concurrency = 6;

    setIsScanningUniverse(true);
    setUniverseScanError(null);
    setUniverseScanResults([]);
    setBacktestError(null);

    try {
      const rows: UniverseScanResult[] = [];

      const combos = symbols
        .flatMap((scanSymbol) => candidateTimeframes.map((tf) => ({ scanSymbol, tf })))
        .filter(({ tf }) => baselineRangeDays >= getMinimumDaysForTimeframe(tf))
        .slice(0, maxCombos);

      for (let i = 0; i < combos.length; i += concurrency) {
        const batch = combos.slice(i, i + concurrency);
        const settled = await Promise.allSettled(
          batch.map(async ({ scanSymbol, tf }) => {
            const result = await requestBacktest({
              symbol: scanSymbol,
              strategy,
              timeframe: tf,
              startDate,
              endDate,
              replayMinSignalScore,
            });

            const score =
              result.totalReturn +
              (result.winRate * 0.15) +
              (result.profitFactor * 8) -
              (result.maxDrawdown * 0.3);

            return {
              symbol: scanSymbol,
              timeframe: tf,
              totalReturn: result.totalReturn,
              winRate: result.winRate,
              profitFactor: result.profitFactor,
              maxDrawdown: result.maxDrawdown,
              totalTrades: result.totalTrades,
              score,
            } satisfies UniverseScanResult;
          })
        );

        settled.forEach((entry) => {
          if (entry.status === 'fulfilled') {
            rows.push(entry.value);
          }
        });
      }

      const ranked = rows.sort((a, b) => b.score - a.score);
      setUniverseScanResults(ranked);

      if (!ranked.length) {
        setUniverseScanError('No valid symbol + timeframe combinations produced a backtest result.');
      }
    } finally {
      setIsScanningUniverse(false);
    }
  };

  const applyBestUniversePairAndRerun = async () => {
    if (!universeScanResults.length) return;
    const best = universeScanResults[0];
    setSymbol(best.symbol);
    setTimeframe(best.timeframe);
    await runBacktest({ symbol: best.symbol, timeframe: best.timeframe });
  };

  const runBacktest = async (overrides?: {
    symbol?: string;
    startDate?: string;
    endDate?: string;
    timeframe?: string;
    replayMinSignalScore?: number;
    strategy?: string;
  }) => {
    const effectiveSymbol = (overrides?.symbol ?? symbol).toUpperCase();
    const effectiveStartDate = overrides?.startDate ?? startDate;
    const effectiveEndDate = overrides?.endDate ?? endDate;
    const effectiveTimeframe = overrides?.timeframe ?? timeframe;
    const effectiveReplayMinSignalScore = overrides?.replayMinSignalScore ?? replayMinSignalScore;
    const effectiveStrategy = overrides?.strategy ?? strategy;

    const rangeDays = getRangeDays(effectiveStartDate, effectiveEndDate);
    const minDays = getMinimumDaysForTimeframe(effectiveTimeframe);

    if (Number.isNaN(rangeDays)) {
      setBacktestError('Please select valid start and end dates.');
      return;
    }

    if (rangeDays <= 0) {
      setBacktestError('Start date must be before end date.');
      return;
    }

    if (!Number.isFinite(parseFloat(initialCapital)) || parseFloat(initialCapital) <= 0) {
      setBacktestError('Initial capital must be greater than 0.');
      return;
    }

    if (rangeDays < minDays) {
      setBacktestError(`Selected range is too short for ${effectiveTimeframe}. Use at least ${minDays} days for reliable results.`);
      return;
    }

    setIsLoading(true);
    setBacktestError(null);
    setResults(null);
    setShowInverseComparison(false);
    setAiText(null);
    setAiError(null);
    
    try {
      const result = await requestBacktest({
        symbol: effectiveSymbol,
        strategy: effectiveStrategy,
        timeframe: effectiveTimeframe,
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        replayMinSignalScore: effectiveReplayMinSignalScore,
      });
      setResults(result);
    } catch (error) {
      console.error('Backtest error:', error);
      const errMsg = error instanceof Error ? error.message : 'Failed to run backtest';
      setBacktestError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const applyCoachAdjustment = (adjustmentKey: string): {
    startDate?: string;
    replayMinSignalScore?: number;
  } | null => {
    if (adjustmentKey === 'expand_sample' || adjustmentKey === 'increase_coverage') {
      const currentRange = getRangeDays(startDate, endDate);
      const extraDays = Number.isFinite(currentRange) ? Math.max(30, Math.floor(currentRange * 0.5)) : 90;
      const nextStartDate = expandDateRange(extraDays);
      return nextStartDate ? { startDate: nextStartDate } : null;
    }

    if (adjustmentKey === 'tighten_entries' || adjustmentKey === 'raise_expectancy') {
      if (!isReplayStrategy) {
        setBacktestError('This adjustment is auto-applicable for replay strategies. For indicator strategies, tighten your strategy rules and rerun.');
        return null;
      }

      const nextScore = Math.min(95, replayMinSignalScore + 5);
      setReplayMinSignalScore(nextScore);
      setBacktestError(null);
      return { replayMinSignalScore: nextScore };
    }

    if (adjustmentKey === 'reduce_drawdown' || adjustmentKey === 'improve_rr') {
      setBacktestError('Apply this manually by tightening stop/target logic in strategy rules, then rerun.');
      return null;
    }

    return null;
  };

  const applyCoachAdjustmentAndRerun = async (adjustmentKey: string) => {
    const overrides = applyCoachAdjustment(adjustmentKey);
    if (!overrides) return;
    await runBacktest(overrides);
  };

  const applySuggestedAlternative = async (strategyId: string) => {
    setStrategy(strategyId);
    setBacktestError(null);
    await runBacktest({ strategy: strategyId });
  };

  const loadSuggestionToRunner = (strategyId: string) => {
    setRecommendationStrategy(strategyId);
    setBacktestError(null);
  };

  const loadCurrentInputsToRunner = () => {
    setRecommendationStrategy(strategy);
    setRecommendationTimeframe(timeframe);
    setRecommendationStartDate(startDate);
    setRecommendationEndDate(endDate);
    setRecommendationMinSignalScore(replayMinSignalScore);
    setBacktestError(null);
  };

  const runRecommendation = async () => {
    const candidateStrategy = recommendationStrategy.trim();
    if (!isBacktestStrategy(candidateStrategy)) {
      setBacktestError(`Unknown strategy in recommendation runner: ${candidateStrategy}`);
      return;
    }

    const score = Math.max(1, Math.min(95, Number(recommendationMinSignalScore) || replayMinSignalScore));

    setStrategy(candidateStrategy);
    setTimeframe(recommendationTimeframe);
    setStartDate(recommendationStartDate);
    setEndDate(recommendationEndDate);
    setReplayMinSignalScore(score);
    setBacktestError(null);

    await runBacktest({
      strategy: candidateStrategy,
      timeframe: recommendationTimeframe,
      startDate: recommendationStartDate,
      endDate: recommendationEndDate,
      replayMinSignalScore: score,
    });
  };

  const summarizeBacktest = async () => {
    if (!results) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await fetch('/api/msp-analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `Summarize backtest results in 4 bullets and a one-line risk note. Symbol ${symbol}, strategy ${strategy}, total trades ${results.totalTrades}, win rate ${results.winRate}%, total return ${results.totalReturn}%, max drawdown ${results.maxDrawdown}%, sharpe ${results.sharpeRatio}, profit factor ${results.profitFactor}, avg win ${results.avgWin}, avg loss ${results.avgLoss}, cagr ${results.cagr}, volatility ${results.volatility}, sortino ${results.sortinoRatio}, calmar ${results.calmarRatio}, time in market ${results.timeInMarket}%. Best trade ${results.bestTrade ? results.bestTrade.returnPercent : 'n/a'}%, worst trade ${results.worstTrade ? results.worstTrade.returnPercent : 'n/a'}%. Keep it concise.`,
          context: {
            symbol,
            timeframe: `${startDate} to ${endDate}`,
          },
        })
      });
      const data = await response.json();
      if (response.status === 401) {
        setAiError('Unable to use AI. Please try again later.');
        return;
      }
      if (response.status === 429) {
        setAiError(data.error || 'Daily limit reached. Upgrade for more AI questions.');
        return;
      }
      if (!response.ok) {
        const errMsg = data?.error || data?.message || `AI request failed (${response.status})`;
        throw new Error(errMsg);
      }
      const text = data?.text || data?.content || data?.message || data?.response || JSON.stringify(data);
      setAiText(text);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to get AI summary');
    } finally {
      setAiLoading(false);
    }
  };
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#0f172a',
      padding: 0
    }}>
      <ToolsPageHeader
        badge="ELITE STRATEGY LAB"
        title="Strategy Backtester"
        subtitle="Validate strategy edge before risking capital with real historical market data."
        icon="🧪"
        backHref="/dashboard"
      />
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
        <CommandCenterStateBar
          mode="EXECUTE"
          actionableNow={results
            ? `Top setup: ${symbol} • ${strategy} • ${results.winRate.toFixed(1)}% win rate`
            : `No validated setup yet for ${symbol}. Run backtest to qualify execution.`}
          nextStep={results
            ? results.profitFactor >= 1.25 && results.maxDrawdown <= 20
              ? 'Convert validated setup into execution plan'
              : 'Adjust rules/timeframe and revalidate'
            : 'Set strategy + timeframe and run validation'}
        />

        {/* Options Scanner Context Banner */}
        {showOptionsBanner && (
          <div style={{
            background: 'var(--msp-panel)',
            border: '1px solid var(--msp-border)',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '1.5rem' }}>🔬</span>
              <div>
                <div style={{ 
                  color: 'var(--msp-accent)', 
                  fontWeight: '600', 
                  fontSize: '14px',
                  marginBottom: '2px'
                }}>
                  Testing Options Scanner Setup
                </div>
                <div style={{ color: '#94A3B8', fontSize: '13px' }}>
                  Symbol: <span style={{ color: '#E2E8F0', fontWeight: '500' }}>{symbol}</span>
                  {urlDirection && (
                    <>
                      {' • '}Direction: <span style={{ 
                        color: urlDirection === 'bullish' ? '#10B981' : urlDirection === 'bearish' ? '#EF4444' : '#F59E0B',
                        fontWeight: '500'
                      }}>
                        {urlDirection.toUpperCase()}
                      </span>
                    </>
                  )}
                  {urlStrategy && (
                    <>
                      {' • '}Strategy: <span style={{ color: '#A78BFA', fontWeight: '500' }}>{urlStrategy}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Link
                href={`/tools/options-confluence?symbol=${symbol}`}
                style={{
                  padding: '8px 14px',
                  background: 'var(--msp-panel)',
                  border: '1px solid var(--msp-border)',
                  borderRadius: '8px',
                  color: 'var(--msp-accent)',
                  textDecoration: 'none',
                  fontSize: '12px',
                  fontWeight: '500',
                }}
              >
                ← Back to Scanner
              </Link>
              <button
                onClick={() => setShowOptionsBanner(false)}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: '1px solid rgba(100,116,139,0.4)',
                  borderRadius: '8px',
                  color: '#64748B',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #1f2937', paddingBottom: '2px', marginBottom: '30px' }}>
          <Link href="/tools/portfolio" style={{
            padding: '10px 20px',
            color: '#9ca3af',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            Portfolio
          </Link>

          <Link href="/tools/backtest" style={{
            padding: '10px 20px',
            color: '#10b981',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
            borderBottom: '2px solid #10b981'
          }}>
            Backtest
          </Link>
          <Link href="/tools/journal" style={{
            padding: '10px 20px',
            color: '#9ca3af',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            Trade Journal
          </Link>
        </div>

        {/* Backtest Configuration */}
        <div style={{
          background: 'var(--msp-card)',
          border: '1px solid rgba(51,65,85,0.8)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
        }}>
          <h2 style={{ 
            color: '#f1f5f9', 
            fontSize: '15px', 
            fontWeight: '600', 
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            <span style={{ 
              background: 'var(--msp-accent)',
              borderRadius: '8px',
              padding: '6px 8px',
              fontSize: '14px'
            }}>⚙️</span>
            Backtest Configuration
          </h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                Symbol
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px'
                }}
                placeholder="e.g., SPY, AAPL"
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                Universe Symbols (for symbol + timeframe scan)
              </label>
              <input
                type="text"
                value={universeSymbolsInput}
                onChange={(e) => setUniverseSymbolsInput(e.target.value.toUpperCase())}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px'
                }}
                placeholder="SPY, QQQ, AAPL, MSFT, NVDA"
              />
              <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                Comma-separated tickers. Scanner ranks best symbol + timeframe combo for this strategy.
              </p>
            </div>

            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                Edge Type
              </label>
              <select
                value={edgeGroup}
                onChange={(e) => setEdgeGroup(e.target.value as EdgeGroupId)}
                onWheel={(e) => e.currentTarget.blur()}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px'
                }}
              >
                {STRATEGY_EDGE_GROUPS.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                Strategy Variant
              </label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px'
                }}
              >
                {(activeEdgeGroup?.categories || []).map((category) => (
                  <optgroup key={category.id} label={category.label}>
                    {category.strategies.map((strategyOption) => (
                      <option key={strategyOption.id} value={strategyOption.id}>
                        {strategyOption.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                Institutional flow: choose edge type first, then deploy the strategy variant.
              </p>
            </div>

            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                Timeframe
              </label>
              <input
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                list="backtest-timeframe-options"
                placeholder="e.g. 6m, 12m, 1h, daily"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px'
                }}
              />
              <datalist id="backtest-timeframe-options">
                {Array.from(new Set(BACKTEST_TIMEFRAME_GROUPS.flatMap((group) => group.timeframes))).map((value) => (
                  <option key={value} value={value} />
                ))}
                {['2min', '3min', '6min', '10min', '12min', '20min', '45min', '2h', '4h'].map((value) => (
                  <option key={value} value={value} />
                ))}
                {['1w', '2w', '1mo', '3mo', '6mo', '1y', '2y'].map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
              <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                Free input enabled. Use formats like 6m, 2h, 2hour, 1d/daily.
              </p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                {['1min', '5min', '15min', '30min', '60min', 'daily'].map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setTimeframe(tf)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '999px',
                      border: timeframe === tf ? '1px solid rgba(16,185,129,0.55)' : '1px solid rgba(148,163,184,0.35)',
                      background: timeframe === tf ? 'rgba(16,185,129,0.18)' : 'rgba(30,41,59,0.5)',
                      color: timeframe === tf ? '#6ee7b7' : '#cbd5e1',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {tf}
                  </button>
                ))}
              </div>
              {timeframe !== 'daily' && (
                <p style={{ fontSize: '11px', color: '#10b981', marginTop: '4px' }}>
                  ✓ Custom intraday timeframes may be resampled from base bars.
                </p>
              )}
            </div>

            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: '999px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(148,163,184,0.12)',
                color: '#cbd5e1',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.02em'
              }}>
                <span>
                  Date Anchor:
                  {' '}
                  {dateAnchorInfo?.source === 'ipo'
                    ? 'IPO'
                    : dateAnchorInfo?.source === 'coverage'
                    ? 'Coverage'
                    : 'Fallback'}
                </span>
                <span style={{ color: '#94a3b8' }}>•</span>
                <span>
                  Earliest used: {dateAnchorInfo?.startDate || startDate}
                </span>
                <span style={{ color: '#94a3b8' }}>•</span>
                <span>
                  Asset: {dateAnchorInfo?.assetType || 'unknown'}
                </span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                Initial Capital
              </label>
              <input
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px'
                }}
                placeholder="10000"
              />
            </div>

            {isReplayStrategy && (
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                  Min Signal Score
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={replayMinSignalScore}
                  onChange={(e) => setReplayMinSignalScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '14px'
                  }}
                />
              </div>
            )}
          </div>

          <button
            onClick={() => runBacktest()}
            disabled={isLoading || isScanningTimeframes || isScanningUniverse}
            style={{
              width: '100%',
              padding: '14px',
              background: isLoading ? '#374151' : 'var(--msp-accent)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '15px',
              fontWeight: '600',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1
            }}
          >
            {isLoading ? '⏳ Validating Strategy...' : '🚀 Validate Strategy'}
          </button>

          <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={scanBestTimeframe}
              disabled={isLoading || isScanningTimeframes || isScanningUniverse}
              style={{
                flex: '1 1 200px',
                padding: '10px 12px',
                background: 'rgba(56,189,248,0.15)',
                border: '1px solid rgba(56,189,248,0.35)',
                borderRadius: '8px',
                color: '#67e8f9',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isLoading || isScanningTimeframes || isScanningUniverse ? 'not-allowed' : 'pointer',
                opacity: isLoading || isScanningTimeframes || isScanningUniverse ? 0.65 : 1,
              }}
            >
              {isScanningTimeframes ? 'Scanning timeframes…' : '🔎 Scan Best Timeframe'}
            </button>

            <button
              type="button"
              onClick={applyBestTimeframeAndRerun}
              disabled={isLoading || isScanningTimeframes || isScanningUniverse || timeframeScanResults.length === 0}
              style={{
                flex: '1 1 200px',
                padding: '10px 12px',
                background: 'rgba(16,185,129,0.15)',
                border: '1px solid rgba(16,185,129,0.35)',
                borderRadius: '8px',
                color: '#6ee7b7',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isLoading || isScanningTimeframes || isScanningUniverse || timeframeScanResults.length === 0 ? 'not-allowed' : 'pointer',
                opacity: isLoading || isScanningTimeframes || isScanningUniverse || timeframeScanResults.length === 0 ? 0.65 : 1,
              }}
            >
              ⚡ Use Best & Rerun
            </button>

            <button
              type="button"
              onClick={scanBestUniversePair}
              disabled={isLoading || isScanningTimeframes || isScanningUniverse}
              style={{
                flex: '1 1 220px',
                padding: '10px 12px',
                background: 'rgba(168,85,247,0.15)',
                border: '1px solid rgba(168,85,247,0.35)',
                borderRadius: '8px',
                color: '#d8b4fe',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isLoading || isScanningTimeframes || isScanningUniverse ? 'not-allowed' : 'pointer',
                opacity: isLoading || isScanningTimeframes || isScanningUniverse ? 0.65 : 1,
              }}
            >
              {isScanningUniverse ? 'Scanning universe…' : '🌐 Scan Universe'}
            </button>

            <button
              type="button"
              onClick={applyBestUniversePairAndRerun}
              disabled={isLoading || isScanningTimeframes || isScanningUniverse || universeScanResults.length === 0}
              style={{
                flex: '1 1 220px',
                padding: '10px 12px',
                background: 'rgba(59,130,246,0.15)',
                border: '1px solid rgba(59,130,246,0.35)',
                borderRadius: '8px',
                color: '#93c5fd',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isLoading || isScanningTimeframes || isScanningUniverse || universeScanResults.length === 0 ? 'not-allowed' : 'pointer',
                opacity: isLoading || isScanningTimeframes || isScanningUniverse || universeScanResults.length === 0 ? 0.65 : 1,
              }}
            >
              🧭 Use Best Pair & Rerun
            </button>
          </div>

          {timeframeScanError && (
            <div style={{
              marginTop: '8px',
              color: '#fca5a5',
              fontSize: '12px',
              border: '1px solid rgba(239,68,68,0.35)',
              borderRadius: '8px',
              padding: '8px 10px',
              background: 'rgba(127,29,29,0.2)'
            }}>
              {timeframeScanError}
            </div>
          )}

          {timeframeScanResults.length > 0 && (
            <div style={{
              marginTop: '10px',
              border: '1px solid rgba(51,65,85,0.7)',
              borderRadius: '10px',
              background: 'rgba(15,23,42,0.5)',
              padding: '10px'
            }}>
              <div style={{ color: '#cbd5e1', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                Timeframe Scan Leaderboard
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                {timeframeScanResults.slice(0, 5).map((row, idx) => (
                  <div key={row.timeframe} style={{
                    display: 'grid',
                    gridTemplateColumns: '88px 1fr',
                    gap: '10px',
                    padding: '7px 8px',
                    borderRadius: '8px',
                    border: idx === 0 ? '1px solid rgba(16,185,129,0.45)' : '1px solid rgba(51,65,85,0.6)',
                    background: idx === 0 ? 'rgba(16,185,129,0.1)' : 'rgba(30,41,59,0.45)'
                  }}>
                    <div style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 700 }}>
                      {idx + 1}. {row.timeframe}
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                      Return {row.totalReturn >= 0 ? '+' : ''}{row.totalReturn.toFixed(2)}% · WR {row.winRate.toFixed(1)}% · PF {row.profitFactor.toFixed(2)} · DD {row.maxDrawdown.toFixed(2)}% · Trades {row.totalTrades}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {universeScanError && (
            <div style={{
              marginTop: '8px',
              color: '#fca5a5',
              fontSize: '12px',
              border: '1px solid rgba(239,68,68,0.35)',
              borderRadius: '8px',
              padding: '8px 10px',
              background: 'rgba(127,29,29,0.2)'
            }}>
              {universeScanError}
            </div>
          )}

          {universeScanResults.length > 0 && (
            <div style={{
              marginTop: '10px',
              border: '1px solid rgba(51,65,85,0.7)',
              borderRadius: '10px',
              background: 'rgba(15,23,42,0.5)',
              padding: '10px'
            }}>
              <div style={{ color: '#cbd5e1', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                Universe Scan Leaderboard (Symbol + Timeframe)
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                {universeScanResults.slice(0, 8).map((row, idx) => (
                  <div key={`${row.symbol}-${row.timeframe}-${idx}`} style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 1fr',
                    gap: '10px',
                    padding: '7px 8px',
                    borderRadius: '8px',
                    border: idx === 0 ? '1px solid rgba(59,130,246,0.45)' : '1px solid rgba(51,65,85,0.6)',
                    background: idx === 0 ? 'rgba(59,130,246,0.1)' : 'rgba(30,41,59,0.45)'
                  }}>
                    <div style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 700 }}>
                      {idx + 1}. {row.symbol} · {row.timeframe}
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                      Return {row.totalReturn >= 0 ? '+' : ''}{row.totalReturn.toFixed(2)}% · WR {row.winRate.toFixed(1)}% · PF {row.profitFactor.toFixed(2)} · DD {row.maxDrawdown.toFixed(2)}% · Trades {row.totalTrades}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {backtestError && (
            <div style={{
              marginTop: '12px',
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(239,68,68,0.35)',
              background: 'rgba(239,68,68,0.08)',
              color: '#fca5a5',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              flexWrap: 'wrap',
            }}>
              <span>⚠️ {backtestError}</span>
              {(backtestError.toLowerCase().includes('insufficient data') || backtestError.toLowerCase().includes('too short')) && (
                <button
                  onClick={applySuggestedDateRange}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(16,185,129,0.45)',
                    background: 'rgba(16,185,129,0.12)',
                    color: '#34d399',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Auto-fix date range
                </button>
              )}
            </div>
          )}
        </div>

        {/* Results */}
        {results && (
          <>
            <div style={{
              background: 'var(--msp-card)',
              border: '1px solid var(--msp-border-strong)',
              borderRadius: '14px',
              padding: '14px 16px',
              marginBottom: '16px',
              boxShadow: 'var(--msp-shadow)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Command Layer
                </div>
                <button
                  onClick={() => setShowInverseComparison((previous) => !previous)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '999px',
                    border: '1px solid rgba(239,68,68,0.4)',
                    background: showInverseComparison ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.1)',
                    color: '#fca5a5',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em'
                  }}
                >
                  {showInverseComparison ? 'Hide Inverse Compare' : 'Run Inverse (Short) Compare'}
                </button>
              </div>
              <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
                <div style={{ background: 'rgba(30,41,59,0.55)', border: '1px solid rgba(51,65,85,0.5)', borderRadius: '10px', padding: '10px 12px' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Edge State</div>
                  <div style={{ color: results.profitFactor >= 1.25 ? '#10b981' : results.profitFactor >= 1 ? '#fbbf24' : '#ef4444', fontSize: '14px', fontWeight: 700 }}>
                    {results.profitFactor >= 1.25 ? 'Positive' : results.profitFactor >= 1 ? 'Marginal' : 'Negative'}
                  </div>
                </div>
                <div style={{ background: 'rgba(30,41,59,0.55)', border: '1px solid rgba(51,65,85,0.5)', borderRadius: '10px', padding: '10px 12px' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Risk State</div>
                  <div style={{ color: results.maxDrawdown <= 10 ? '#10b981' : results.maxDrawdown <= 20 ? '#fbbf24' : '#ef4444', fontSize: '14px', fontWeight: 700 }}>
                    {results.maxDrawdown <= 10 ? 'Controlled' : results.maxDrawdown <= 20 ? 'Moderate' : 'Elevated'}
                  </div>
                </div>
                <div style={{ background: 'rgba(30,41,59,0.55)', border: '1px solid rgba(51,65,85,0.5)', borderRadius: '10px', padding: '10px 12px' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Action</div>
                  <div style={{ color: results.profitFactor >= 1.25 && results.maxDrawdown <= 20 ? '#10b981' : results.profitFactor >= 1 ? '#fbbf24' : '#94a3b8', fontSize: '14px', fontWeight: 700 }}>
                    {results.profitFactor >= 1.25 && results.maxDrawdown <= 20 ? 'EXECUTE' : results.profitFactor >= 1 ? 'PREP' : 'WAIT'}
                  </div>
                </div>
                <div style={{ background: 'rgba(30,41,59,0.55)', border: '1px solid rgba(51,65,85,0.5)', borderRadius: '10px', padding: '10px 12px' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Bias</div>
                  <div style={{ color: results.totalReturn > 2 ? '#10b981' : results.totalReturn < -2 ? '#ef4444' : '#e2e8f0', fontSize: '14px', fontWeight: 700 }}>
                    {results.totalReturn > 2 ? 'Bullish' : results.totalReturn < -2 ? 'Bearish' : 'Neutral'}
                  </div>
                </div>
              </div>

              {showInverseComparison && inverseComparison && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(239,68,68,0.28)',
                  background: 'rgba(127,29,29,0.12)'
                }}>
                  <div style={{ color: '#fca5a5', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                    Inverse (Short) Replay
                  </div>
                  <div style={{ color: '#fecaca', fontSize: '12px', marginBottom: '8px' }}>
                    Mirrors each signal direction in the same sample window to simulate long-fail vs short-side outcome.
                  </div>
                  <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
                    <div style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(148,163,184,0.28)', borderRadius: '8px', padding: '8px 10px' }}>
                      <div style={{ color: '#94a3b8', fontSize: '11px' }}>Return</div>
                      <div style={{ color: '#e2e8f0', fontSize: '12px' }}>Base: {results.totalReturn >= 0 ? '+' : ''}{results.totalReturn.toFixed(2)}%</div>
                      <div style={{ color: inverseComparison.inverse.totalReturn >= 0 ? '#6ee7b7' : '#fca5a5', fontSize: '12px', fontWeight: 700 }}>
                        Inverse: {inverseComparison.inverse.totalReturn >= 0 ? '+' : ''}{inverseComparison.inverse.totalReturn.toFixed(2)}%
                      </div>
                    </div>
                    <div style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(148,163,184,0.28)', borderRadius: '8px', padding: '8px 10px' }}>
                      <div style={{ color: '#94a3b8', fontSize: '11px' }}>Win Rate</div>
                      <div style={{ color: '#e2e8f0', fontSize: '12px' }}>Base: {results.winRate.toFixed(1)}%</div>
                      <div style={{ color: '#fecaca', fontSize: '12px', fontWeight: 700 }}>
                        Inverse: {inverseComparison.inverse.winRate.toFixed(1)}%
                      </div>
                    </div>
                    <div style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(148,163,184,0.28)', borderRadius: '8px', padding: '8px 10px' }}>
                      <div style={{ color: '#94a3b8', fontSize: '11px' }}>Max Drawdown</div>
                      <div style={{ color: '#e2e8f0', fontSize: '12px' }}>Base: {results.maxDrawdown.toFixed(2)}%</div>
                      <div style={{ color: '#fecaca', fontSize: '12px', fontWeight: 700 }}>
                        Inverse: {inverseComparison.inverse.maxDrawdown.toFixed(2)}%
                      </div>
                    </div>
                    <div style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(148,163,184,0.28)', borderRadius: '8px', padding: '8px 10px' }}>
                      <div style={{ color: '#94a3b8', fontSize: '11px' }}>Profit Factor</div>
                      <div style={{ color: '#e2e8f0', fontSize: '12px' }}>Base: {results.profitFactor.toFixed(2)}</div>
                      <div style={{ color: '#fecaca', fontSize: '12px', fontWeight: 700 }}>
                        Inverse: {inverseComparison.inverse.profitFactor.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div style={{ color: '#fda4af', fontSize: '11px', marginTop: '8px' }}>
                    Delta vs base — Return {inverseComparison.delta.totalReturn >= 0 ? '+' : ''}{inverseComparison.delta.totalReturn.toFixed(2)}%, Win Rate {inverseComparison.delta.winRate >= 0 ? '+' : ''}{inverseComparison.delta.winRate.toFixed(1)}%, Drawdown {inverseComparison.delta.maxDrawdown >= 0 ? '+' : ''}{inverseComparison.delta.maxDrawdown.toFixed(2)}%.
                  </div>
                </div>
              )}
            </div>

            {results.validation && (
              <div style={{
                background: 'var(--msp-card)',
                border: '1px solid rgba(51,65,85,0.8)',
                borderRadius: '14px',
                padding: '14px 16px',
                marginBottom: '16px',
                boxShadow: 'var(--msp-shadow)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Validation
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>{results.validation.reason}</div>
                  </div>
                  <span style={{
                    padding: '6px 10px',
                    borderRadius: '999px',
                    background: results.validation.status === 'validated'
                      ? 'rgba(16,185,129,0.15)'
                      : results.validation.status === 'mixed'
                        ? 'rgba(251,191,36,0.15)'
                        : 'rgba(239,68,68,0.15)',
                    border: results.validation.status === 'validated'
                      ? '1px solid rgba(16,185,129,0.35)'
                      : results.validation.status === 'mixed'
                        ? '1px solid rgba(251,191,36,0.35)'
                        : '1px solid rgba(239,68,68,0.35)',
                    color: results.validation.status === 'validated'
                      ? '#6ee7b7'
                      : results.validation.status === 'mixed'
                        ? '#fde68a'
                        : '#fca5a5',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase'
                  }}>
                    {results.validation.status} ({results.validation.direction})
                  </span>
                </div>

                {results.validation.suggestedAlternatives && results.validation.suggestedAlternatives.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Suggested Alternatives
                    </div>
                    <div style={{ display: 'grid', gap: '6px' }}>
                      {results.validation.suggestedAlternatives.map((alternative) => (
                        <div
                          key={alternative.strategyId}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: '1px solid rgba(51,65,85,0.5)',
                            background: 'rgba(30,41,59,0.45)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                            <div style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 600 }}>{alternative.strategyId}</div>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <button
                                onClick={() => loadSuggestionToRunner(alternative.strategyId)}
                                disabled={isLoading}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  border: '1px solid rgba(148,163,184,0.35)',
                                  background: 'rgba(148,163,184,0.12)',
                                  color: '#cbd5e1',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: isLoading ? 'not-allowed' : 'pointer',
                                  opacity: isLoading ? 0.65 : 1,
                                }}
                              >
                                Load
                              </button>
                              <button
                                onClick={() => applySuggestedAlternative(alternative.strategyId)}
                                disabled={isLoading}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  border: '1px solid rgba(16,185,129,0.35)',
                                  background: 'rgba(16,185,129,0.15)',
                                  color: '#10b981',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: isLoading ? 'not-allowed' : 'pointer',
                                  opacity: isLoading ? 0.65 : 1,
                                }}
                              >
                                {isLoading ? 'Applying…' : 'Apply'}
                              </button>
                            </div>
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '2px' }}>{alternative.why}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(51,65,85,0.6)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase' }}>
                      Recommendation Runner (TradingView-style inputs)
                    </div>
                    <button
                      type="button"
                      onClick={loadCurrentInputsToRunner}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '999px',
                        border: '1px solid rgba(148,163,184,0.35)',
                        background: 'rgba(148,163,184,0.12)',
                        color: '#cbd5e1',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Load Current Inputs
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', marginTop: '8px' }}>
                    <input
                      value={recommendationStrategy}
                      onChange={(e) => setRecommendationStrategy(e.target.value)}
                      list="backtest-strategy-recommendation-options"
                      placeholder="Strategy ID"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#f1f5f9',
                        fontSize: '12px'
                      }}
                    />
                    <input
                      value={recommendationTimeframe}
                      onChange={(e) => setRecommendationTimeframe(e.target.value)}
                      list="backtest-timeframe-options"
                      placeholder="Timeframe"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#f1f5f9',
                        fontSize: '12px'
                      }}
                    />
                    <input
                      type="date"
                      value={recommendationStartDate}
                      onChange={(e) => setRecommendationStartDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#f1f5f9',
                        fontSize: '12px'
                      }}
                    />
                    <input
                      type="date"
                      value={recommendationEndDate}
                      onChange={(e) => setRecommendationEndDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#f1f5f9',
                        fontSize: '12px'
                      }}
                    />
                    <input
                      type="number"
                      min={1}
                      max={95}
                      value={recommendationMinSignalScore}
                      onChange={(e) => setRecommendationMinSignalScore(Math.max(1, Math.min(95, Number(e.target.value) || 1)))}
                      placeholder="Replay Min Score"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#f1f5f9',
                        fontSize: '12px'
                      }}
                    />
                    <button
                      type="button"
                      onClick={runRecommendation}
                      disabled={isLoading}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid rgba(16,185,129,0.35)',
                        background: 'rgba(16,185,129,0.15)',
                        color: '#10b981',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        opacity: isLoading ? 0.65 : 1,
                      }}
                    >
                      {isLoading ? 'Running…' : 'Run Recommendation'}
                    </button>
                  </div>
                  <datalist id="backtest-strategy-recommendation-options">
                    {BACKTEST_STRATEGY_CATEGORIES.flatMap((category) => category.strategies).map((item) => (
                      <option key={item.id} value={item.id} />
                    ))}
                  </datalist>
                </div>
              </div>
            )}

            {results.diagnostics && (
              <div style={{
                background: 'var(--msp-card)',
                border: '1px solid rgba(51,65,85,0.8)',
                borderRadius: '14px',
                padding: '14px 16px',
                marginBottom: '16px',
                boxShadow: 'var(--msp-shadow)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Post-Backtest Coach
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>{results.diagnostics.summary}</div>
                  </div>
                  <span style={{
                    padding: '6px 10px',
                    borderRadius: '999px',
                    background: results.diagnostics.verdict === 'healthy'
                      ? 'rgba(16,185,129,0.15)'
                      : results.diagnostics.verdict === 'watch'
                      ? 'rgba(251,191,36,0.15)'
                      : 'rgba(239,68,68,0.15)',
                    border: results.diagnostics.verdict === 'healthy'
                      ? '1px solid rgba(16,185,129,0.35)'
                      : results.diagnostics.verdict === 'watch'
                      ? '1px solid rgba(251,191,36,0.35)'
                      : '1px solid rgba(239,68,68,0.35)',
                    color: results.diagnostics.verdict === 'healthy'
                      ? '#6ee7b7'
                      : results.diagnostics.verdict === 'watch'
                      ? '#fde68a'
                      : '#fca5a5',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase'
                  }}>
                    Score {results.diagnostics.score}/100
                  </span>
                </div>

                <div style={{
                  marginTop: '10px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(51,65,85,0.55)',
                  background: 'rgba(15,23,42,0.55)',
                  color: '#cbd5e1',
                  fontSize: '12px'
                }}>
                  <div style={{ color: '#94a3b8', marginBottom: '4px' }}>Directional Invalidation</div>
                  <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{results.diagnostics.invalidation.rule}</div>
                  <div style={{ color: '#cbd5e1', marginTop: '4px' }}>{results.diagnostics.invalidation.reason}</div>
                </div>

                {results.diagnostics.adjustments.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px' }}>
                      What to Adjust Next
                    </div>
                    <div style={{ display: 'grid', gap: '6px' }}>
                      {results.diagnostics.adjustments.map((adjustment) => (
                        <div
                          key={adjustment.key}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: '1px solid rgba(51,65,85,0.5)',
                            background: 'rgba(30,41,59,0.45)'
                          }}
                        >
                          <div style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 600 }}>{adjustment.title}</div>
                          <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '2px' }}>{adjustment.reason}</div>
                          <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => applyCoachAdjustment(adjustment.key)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: '8px',
                                border: '1px solid rgba(16,185,129,0.45)',
                                background: 'rgba(16,185,129,0.14)',
                                color: '#6ee7b7',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em'
                              }}
                            >
                              Apply
                            </button>
                            <button
                              onClick={() => applyCoachAdjustmentAndRerun(adjustment.key)}
                              disabled={isLoading}
                              style={{
                                padding: '6px 10px',
                                borderRadius: '8px',
                                border: '1px solid rgba(59,130,246,0.45)',
                                background: isLoading ? 'rgba(30,41,59,0.75)' : 'rgba(59,130,246,0.14)',
                                color: isLoading ? '#94a3b8' : '#93c5fd',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: isLoading ? 'not-allowed' : 'pointer',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em'
                              }}
                            >
                              Apply + Rerun
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {results.diagnostics.failureTags.length > 0 && (
                  <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {results.diagnostics.failureTags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '999px',
                          border: '1px solid rgba(148,163,184,0.3)',
                          background: 'rgba(148,163,184,0.12)',
                          color: '#cbd5e1',
                          fontSize: '10px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em'
                        }}
                      >
                        {tag.replaceAll('_', ' ')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {results.dataCoverage && (
              <div style={{
                background: 'var(--msp-card)',
                border: '1px solid rgba(51,65,85,0.8)',
                borderRadius: '14px',
                padding: '12px 14px',
                marginBottom: '16px',
                boxShadow: 'var(--msp-shadow)'
              }}>
                <div style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                  Data Coverage
                </div>
                <div style={{ color: '#cbd5e1', fontSize: '12px' }}>
                  Coverage: {results.dataCoverage.minAvailable} → {results.dataCoverage.maxAvailable}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px' }}>
                  Applied range: {results.dataCoverage.applied.startDate} → {results.dataCoverage.applied.endDate} · {results.dataCoverage.bars} bars
                  {results.dataCoverage.provider ? ` · Provider: ${results.dataCoverage.provider}` : ''}
                </div>
              </div>
            )}

            {results.signalReplay && (
              (() => {
                const snapshots = Math.max(0, results.signalReplay.snapshots);
                const qualified = Math.max(0, results.signalReplay.qualifiedSignals);
                const ratioPct = snapshots > 0 ? (qualified / snapshots) * 100 : 0;
                const sourceFilter = results.signalReplay.sourceFilterLabel || (results.signalReplay.mode === 'brain_signal_replay'
                  ? 'decision_packets (all sources)'
                  : results.signalReplay.mode === 'options_signal_replay'
                  ? "signal_source = 'options.confluence'"
                  : "signal_source IN ('scanner.run', 'scanner.bulk')");

                return (
              <div style={{
                background: 'var(--msp-card)',
                border: '1px solid rgba(51,65,85,0.8)',
                borderRadius: '14px',
                padding: '14px 16px',
                marginBottom: '16px',
                boxShadow: 'var(--msp-shadow)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Replay Diagnostics
                    </div>
                    <div style={{ color: '#64748b', fontSize: '12px' }}>
                      {results.signalReplay.mode === 'brain_signal_replay'
                        ? 'Brain signals'
                        : results.signalReplay.mode === 'options_signal_replay'
                        ? 'Options confluence signals'
                        : 'Time scanner signals'}
                      {' · '}Minimum score {results.signalReplay.minSignalScore}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '6px 10px',
                      borderRadius: '999px',
                      background: 'rgba(59,130,246,0.15)',
                      border: '1px solid rgba(59,130,246,0.35)',
                      color: '#93c5fd',
                      fontSize: '11px',
                      fontWeight: 700
                    }}>
                      Snapshots: {results.signalReplay.snapshots}
                    </span>
                    <span style={{
                      padding: '6px 10px',
                      borderRadius: '999px',
                      background: 'rgba(16,185,129,0.15)',
                      border: '1px solid rgba(16,185,129,0.35)',
                      color: '#6ee7b7',
                      fontSize: '11px',
                      fontWeight: 700
                    }}>
                      Qualified: {results.signalReplay.qualifiedSignals}
                    </span>
                    <span style={{
                      padding: '6px 10px',
                      borderRadius: '999px',
                      background: 'rgba(168,85,247,0.14)',
                      border: '1px solid rgba(168,85,247,0.35)',
                      color: '#d8b4fe',
                      fontSize: '11px',
                      fontWeight: 700
                    }}>
                      Quality: {ratioPct.toFixed(1)}%
                    </span>
                    {results.dataSources?.priceData && (
                      <span style={{
                        padding: '6px 10px',
                        borderRadius: '999px',
                        background: 'rgba(148,163,184,0.14)',
                        border: '1px solid rgba(148,163,184,0.35)',
                        color: '#cbd5e1',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase'
                      }}>
                        Source: {results.dataSources.priceData}
                      </span>
                    )}
                    <button
                      onClick={() => setShowReplayDetails((prev) => !prev)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '999px',
                        background: showReplayDetails ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.1)',
                        border: '1px solid rgba(16,185,129,0.35)',
                        color: '#6ee7b7',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {showReplayDetails ? 'Hide Details' : 'Show Details'}
                    </button>
                  </div>
                </div>

                {showReplayDetails && (
                  <div style={{
                    marginTop: '12px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(51,65,85,0.55)',
                    background: 'rgba(15,23,42,0.55)',
                    color: '#cbd5e1',
                    fontSize: '12px',
                    display: 'grid',
                    gap: '6px'
                  }}>
                    <div>
                      <span style={{ color: '#94a3b8', marginRight: '6px' }}>Replay mode:</span>
                      <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{results.signalReplay.mode}</span>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8', marginRight: '6px' }}>Source filter:</span>
                      <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{sourceFilter}</span>
                    </div>
                    {Array.isArray(results.signalReplay.symbolCandidates) && results.signalReplay.symbolCandidates.length > 0 && (
                      <div>
                        <span style={{ color: '#94a3b8', marginRight: '6px' }}>Symbol candidates:</span>
                        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{results.signalReplay.symbolCandidates.join(', ')}</span>
                      </div>
                    )}
                    <div>
                      <span style={{ color: '#94a3b8', marginRight: '6px' }}>Qualified / snapshots:</span>
                      <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{qualified} / {snapshots}</span>
                    </div>
                    {results.signalReplay.filterStats && (
                      <div>
                        <span style={{ color: '#94a3b8', marginRight: '6px' }}>Rejected:</span>
                        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                          score {results.signalReplay.filterStats.rejectedByScore}, neutral {results.signalReplay.filterStats.rejectedByNeutralBias}, range {results.signalReplay.filterStats.rejectedByOutOfRange}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {results.signalReplay.noDataReason && (
                  <div style={{
                    marginTop: '10px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(239,68,68,0.35)',
                    background: 'rgba(239,68,68,0.08)',
                    color: '#fca5a5',
                    fontSize: '12px'
                  }}>
                    No replay trades: {results.signalReplay.noDataReason}
                  </div>
                )}
              </div>
                );
              })()
            )}

            <div style={{
              background: 'var(--msp-card)',
              border: '1px solid var(--msp-border-strong)',
              borderRadius: '14px',
              padding: '14px 16px',
              marginBottom: '16px',
              boxShadow: 'var(--msp-shadow)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Narrative Layer
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Link
                    href={journalDraftHref}
                    onClick={handleAutoJournalDraftClick}
                    style={{
                      padding: '9px 12px',
                      background: 'rgba(59,130,246,0.16)',
                      border: '1px solid rgba(59,130,246,0.35)',
                      borderRadius: '8px',
                      color: '#bfdbfe',
                      fontWeight: 600,
                      textDecoration: 'none',
                      fontSize: '13px'
                    }}
                  >
                    Auto Journal Draft
                  </Link>
                  <button
                    onClick={summarizeBacktest}
                    disabled={aiLoading}
                    style={{
                      padding: '9px 12px',
                      background: aiLoading ? '#1f2937' : 'var(--msp-accent)',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                      fontWeight: 600,
                      cursor: aiLoading ? 'not-allowed' : 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    {aiLoading ? 'Building Brief...' : 'Generate AI Brief'}
                  </button>
                </div>
              </div>
              {aiError && <div style={{ color: '#fca5a5', fontSize: '13px', marginBottom: '8px' }}>{aiError}</div>}

              {aiText ? (
                <div style={{
                  background: 'rgba(34, 197, 94, 0.08)',
                  border: '1px solid rgba(34, 197, 94, 0.35)',
                  borderRadius: '12px',
                  padding: '16px',
                  color: '#d1fae5',
                  lineHeight: 1.55,
                  fontSize: '14px'
                }}>
                  {(() => {
                    const hasPositiveExpectancy = results.totalReturn > 0 && results.profitFactor > 1;
                    const hasNeutralExpectancy = results.totalReturn >= -5 && results.totalReturn <= 5;
                    const verdict = hasPositiveExpectancy 
                      ? { label: '✅ Positive Expectancy', color: '#10b981', bg: 'rgba(16,185,129,0.15)' }
                      : hasNeutralExpectancy
                      ? { label: '⚠️ Marginal Edge', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' }
                      : { label: '❌ Negative Expectancy', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };

                    return (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '6px 12px',
                        background: verdict.bg,
                        border: `1px solid ${verdict.color}40`,
                        borderRadius: '20px',
                        marginBottom: '12px',
                        fontSize: '13px',
                        fontWeight: '700',
                        color: verdict.color
                      }}>
                        Strategy Verdict: {verdict.label}
                      </div>
                    );
                  })()}
                  <div style={{ fontWeight: 700, marginBottom: '6px', color: '#34d399' }}>AI Insight</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{aiText}</div>
                </div>
              ) : (
                <div style={{
                  background: 'rgba(30,41,59,0.45)',
                  border: '1px solid rgba(51,65,85,0.45)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  color: '#94a3b8',
                  fontSize: '13px'
                }}>
                  Generate the AI brief to get an operator summary before reviewing raw analytics.
                </div>
              )}
            </div>

            <div style={{
              background: 'var(--msp-card)',
              border: '1px solid rgba(51,65,85,0.8)',
              borderRadius: '14px',
              padding: '14px 16px',
              marginBottom: '16px',
              boxShadow: 'var(--msp-shadow)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Evidence Layer
                  </div>
                  <div style={{ color: '#64748b', fontSize: '12px' }}>Performance curve, metrics, and trade log</div>
                </div>
                <button
                  onClick={() => setShowEvidenceLayer((prev) => !prev)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(16,185,129,0.4)',
                    background: showEvidenceLayer ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.08)',
                    color: '#10b981',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em'
                  }}
                >
                  {showEvidenceLayer ? 'Hide Evidence' : 'Show Evidence'}
                </button>
              </div>
            </div>

            {showEvidenceLayer && (
              <>

            {/* Equity Curve Chart */}
            <div style={{
              background: 'var(--msp-card)',
              border: '1px solid rgba(51,65,85,0.8)',
              borderRadius: '16px',
              padding: '24px',
              marginBottom: '24px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
            }}>
              <h2 style={{ 
                color: '#f1f5f9', 
                fontSize: '15px', 
                fontWeight: '600', 
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                <span style={{ 
                  background: 'var(--msp-accent)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  fontSize: '14px'
                }}>📈</span>
                Backtest Performance Analysis
              </h2>
              
              <div style={{ 
                height: '400px',
                position: 'relative',
                background: '#1e293b',
                borderRadius: '8px',
                padding: '20px'
              }}>
                <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
                  {(() => {
                    const width = 1000;
                    const height = 360;
                    const padding = { top: 20, right: 40, bottom: 80, left: 60 };
                    const equityCurveHeight = 200;
                    const tradeBarHeight = 80;
                    const gap = 20;

                    const equityPoints = results.equityCurve || [];
                    if (equityPoints.length === 0) {
                      return (
                        <text x={padding.left} y={padding.top + 40} fill="#94a3b8" fontSize="14">
                          No equity data returned for this test.
                        </text>
                      );
                    }

                    const minEquity = Math.min(...equityPoints.map(p => p.equity));
                    const maxEquity = Math.max(...equityPoints.map(p => p.equity));
                    const equityRange = maxEquity - minEquity || 1;

                    // Scale functions for equity curve
                    const chartWidth = width - padding.left - padding.right;
                    const scaleX = (index: number) => padding.left + (index / Math.max(equityPoints.length - 1, 1)) * chartWidth;
                    const scaleYEquity = (value: number) => padding.top + equityCurveHeight - ((value - minEquity) / equityRange) * equityCurveHeight;

                    // Generate equity curve path
                    const equityPath = equityPoints.map((point, i) => {
                      const x = scaleX(i);
                      const y = scaleYEquity(point.equity);
                      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
                    }).join(' ');

                    // Generate gradient path
                    const gradientPath = equityPath + ` L ${scaleX(equityPoints.length - 1)} ${padding.top + equityCurveHeight} L ${padding.left} ${padding.top + equityCurveHeight} Z`;

                    // Scale functions for trade bars
                    const tradeBarY = padding.top + equityCurveHeight + gap;
                    const maxTradeReturn = Math.max(...results.trades.map(t => Math.abs(t.return)), 1);
                    const scaleTradeBar = (value: number) => (value / maxTradeReturn) * (tradeBarHeight / 2);

                    return (
                      <g>
                        {/* Gradient definition */}
                        <defs>
                          <linearGradient id="equityGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
                          </linearGradient>
                        </defs>

                        {/* Equity Curve Section */}
                        <text x={padding.left} y={padding.top - 5} fill="#94a3b8" fontSize="12" fontWeight="600">
                          Equity Curve
                        </text>

                        {/* Equity grid lines */}
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                          const y = padding.top + equityCurveHeight * ratio;
                          const value = maxEquity - (equityRange * ratio);
                          return (
                            <g key={`grid-${i}`}>
                              <line
                                x1={padding.left}
                                y1={y}
                                x2={padding.left + chartWidth}
                                y2={y}
                                stroke="#334155"
                                strokeWidth="1"
                                strokeDasharray="4,4"
                              />
                              <text
                                x={padding.left - 10}
                                y={y + 4}
                                fill="#64748b"
                                fontSize="11"
                                textAnchor="end"
                              >
                                ${(value / 1000).toFixed(1)}k
                              </text>
                            </g>
                          );
                        })}

                        {/* Area under curve */}
                        <path d={gradientPath} fill="url(#equityGradient)" />

                        {/* Main equity line */}
                        <path
                          d={equityPath}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="2.5"
                        />

                        {/* Equity data points */}
                        {equityPoints.map((point, i) => (
                          <circle
                            key={`point-${i}`}
                            cx={scaleX(i)}
                            cy={scaleYEquity(point.equity)}
                            r="3"
                            fill="#10b981"
                            stroke="#0f172a"
                            strokeWidth="2"
                          />
                        ))}

                        {/* Trade P&L Section */}
                        <text x={padding.left} y={tradeBarY - 10} fill="#94a3b8" fontSize="12" fontWeight="600">
                          Trade P&L
                        </text>

                        {/* Zero line for trades */}
                        <line
                          x1={padding.left}
                          y1={tradeBarY + tradeBarHeight / 2}
                          x2={padding.left + chartWidth}
                          y2={tradeBarY + tradeBarHeight / 2}
                          stroke="#475569"
                          strokeWidth="1"
                        />

                        {/* Trade bars */}
                        {results.trades.map((trade, i) => {
                          const x = scaleX(i + 1);
                          const barHeight = scaleTradeBar(trade.return);
                          const barY = trade.return >= 0 
                            ? tradeBarY + tradeBarHeight / 2 - barHeight
                            : tradeBarY + tradeBarHeight / 2;
                          const color = trade.return >= 0 ? '#10b981' : '#ef4444';

                          return (
                            <rect
                              key={`bar-${i}`}
                              x={x - 3}
                              y={barY}
                              width="6"
                              height={Math.abs(barHeight)}
                              fill={color}
                              opacity="0.8"
                            />
                          );
                        })}

                        {/* X-axis labels (dates) */}
                        {equityPoints.map((point, i) => {
                          if (equityPoints.length > 15 && i % Math.ceil(equityPoints.length / 8) !== 0) return null;
                          const date = new Date(point.date);
                          const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                          return (
                            <text
                              key={`label-${i}`}
                              x={scaleX(i)}
                              y={tradeBarY + tradeBarHeight + 25}
                              fill="#64748b"
                              fontSize="10"
                              textAnchor="middle"
                            >
                              {label}
                            </text>
                          );
                        })}

                        {/* Date axis label */}
                        <text
                          x={padding.left + chartWidth / 2}
                          y={tradeBarY + tradeBarHeight + 45}
                          fill="#94a3b8"
                          fontSize="11"
                          textAnchor="middle"
                        >
                          Date
                        </text>
                      </g>
                    );
                  })()}
                </svg>
              </div>
            </div>

            {/* Performance Metrics */}
            <div style={{
              background: 'var(--msp-card)',
              border: '1px solid rgba(51,65,85,0.8)',
              borderRadius: '16px',
              padding: '24px',
              marginBottom: '24px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
            }}>
              <h2 style={{ 
                color: '#f1f5f9', 
                fontSize: '15px', 
                fontWeight: '600', 
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                <span style={{ 
                  background: 'var(--msp-muted)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  fontSize: '14px'
                }}>📊</span>
                Performance Metrics
              </h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Return</div>
                  <div style={{ 
                    color: results.totalReturn >= 0 ? '#10b981' : '#ef4444', 
                    fontSize: '22px', 
                    fontWeight: '700' 
                  }}>
                    {results.totalReturn >= 0 ? '+' : ''}{results.totalReturn.toFixed(2)}%
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Win Rate</div>
                  <div style={{ color: '#94a3b8', fontSize: '20px', fontWeight: '600' }}>
                    {results.winRate.toFixed(1)}%
                  </div>
                  <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>
                    (context matters more than %)
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Trades</div>
                  <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: '700' }}>
                    {results.totalTrades}
                  </div>
                </div>

                {/* Profit Factor - EMPHASIZED */}
                <div style={{ 
                  background: results.profitFactor >= 1.5 ? 'rgba(16,185,129,0.15)' : results.profitFactor >= 1 ? 'rgba(251,191,36,0.1)' : 'rgba(239,68,68,0.1)', 
                  padding: '16px', 
                  borderRadius: '12px', 
                  border: '1px solid var(--msp-border-strong)',
                  borderLeft: `3px solid ${results.profitFactor >= 1.5 ? 'rgba(16,185,129,0.65)' : results.profitFactor >= 1 ? 'rgba(251,191,36,0.55)' : 'rgba(239,68,68,0.65)'}` 
                }}>
                  <div style={{ color: '#e2e8f0', fontSize: '11px', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚡ Profit Factor</div>
                  <div style={{ 
                    color: results.profitFactor >= 1.5 ? '#10b981' : results.profitFactor >= 1 ? '#fbbf24' : '#ef4444', 
                    fontSize: '24px', 
                    fontWeight: '800' 
                  }}>
                    {results.profitFactor.toFixed(2)}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>
                    {results.profitFactor >= 1.5 ? 'Strong edge' : results.profitFactor >= 1 ? 'Break-even' : 'Losing money'}
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sharpe Ratio</div>
                  <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: '700' }}>
                    {results.sharpeRatio.toFixed(2)}
                  </div>
                </div>

                {/* Max Drawdown - EMPHASIZED */}
                <div style={{ 
                  background: results.maxDrawdown <= 10 ? 'rgba(16,185,129,0.1)' : results.maxDrawdown <= 20 ? 'rgba(251,191,36,0.1)' : 'rgba(239,68,68,0.15)', 
                  padding: '16px', 
                  borderRadius: '12px', 
                  border: '1px solid var(--msp-border-strong)',
                  borderLeft: `3px solid ${results.maxDrawdown <= 10 ? 'rgba(16,185,129,0.55)' : results.maxDrawdown <= 20 ? 'rgba(251,191,36,0.55)' : 'rgba(239,68,68,0.65)'}` 
                }}>
                  <div style={{ color: '#e2e8f0', fontSize: '11px', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📉 Max Drawdown</div>
                  <div style={{ 
                    color: results.maxDrawdown <= 10 ? '#10b981' : results.maxDrawdown <= 20 ? '#fbbf24' : '#ef4444', 
                    fontSize: '24px', 
                    fontWeight: '800' 
                  }}>
                    {results.maxDrawdown.toFixed(2)}%
                  </div>
                  <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>
                    {results.maxDrawdown <= 10 ? 'Controlled risk' : results.maxDrawdown <= 20 ? 'Moderate risk' : 'High risk'}
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Win</div>
                  <div style={{ color: '#10b981', fontSize: '22px', fontWeight: '700' }}>
                    ${results.avgWin.toFixed(2)}
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Loss</div>
                  <div style={{ color: '#ef4444', fontSize: '22px', fontWeight: '700' }}>
                    ${results.avgLoss.toFixed(2)}
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CAGR</div>
                  <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: '700' }}>
                    {results.cagr >= 0 ? '+' : ''}{results.cagr.toFixed(2)}%
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Volatility (Ann.)</div>
                  <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: '700' }}>
                    {results.volatility.toFixed(2)}%
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sortino Ratio</div>
                  <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: '700' }}>
                    {results.sortinoRatio.toFixed(2)}
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Calmar Ratio</div>
                  <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: '700' }}>
                    {results.calmarRatio.toFixed(2)}
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time in Market</div>
                  <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: '700' }}>
                    {results.timeInMarket.toFixed(1)}%
                  </div>
                </div>

                {results.bestTrade && (
                  <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.3)' }}>
                    <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Best Trade</div>
                    <div style={{ color: '#10b981', fontSize: '18px', fontWeight: '700' }}>
                      +{results.bestTrade.returnPercent.toFixed(2)}% ({results.bestTrade.symbol})
                    </div>
                    <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
                      {new Date(results.bestTrade.entryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {` x${results.bestTrade.holdingPeriodDays}d`}
                    </div>
                  </div>
                )}

                {results.worstTrade && (
                  <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Worst Trade</div>
                    <div style={{ color: '#ef4444', fontSize: '18px', fontWeight: '700' }}>
                      {results.worstTrade.returnPercent.toFixed(2)}% ({results.worstTrade.symbol})
                    </div>
                    <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
                      {new Date(results.worstTrade.entryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {` x${results.worstTrade.holdingPeriodDays}d`}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Trade History */}
            <div style={{
              background: 'var(--msp-card)',
              border: '1px solid rgba(51,65,85,0.8)',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
            }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(51,65,85,0.5)' }}>
                <h2 style={{ 
                  color: '#f1f5f9', 
                  fontSize: '15px', 
                  fontWeight: '600', 
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  <span style={{ 
                    background: '#f59e0b',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    fontSize: '14px'
                  }}>📋</span>
                  Trade History
                </h2>
              </div>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155' }}>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Entry</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Exit</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Symbol</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Side</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Entry</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Exit</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Hold (d)</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>P&L</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Return %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.trades.map((trade, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '16px 20px', color: '#94a3b8', fontSize: '14px' }}>
                          {new Date(trade.entryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '16px 20px', color: '#94a3b8', fontSize: '14px' }}>
                          {new Date(trade.exitDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '16px 20px', color: '#f1f5f9', fontSize: '14px', fontWeight: '600' }}>
                          {trade.symbol}
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '600',
                            background: trade.side === 'SHORT' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                            color: trade.side === 'SHORT' ? '#ef4444' : '#10b981',
                            border: trade.side === 'SHORT' ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(16,185,129,0.3)'
                          }}>
                            {trade.side}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '14px' }}>
                          ${trade.entry.toFixed(2)}
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#f1f5f9', fontSize: '14px' }}>
                          ${trade.exit.toFixed(2)}
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '14px' }}>
                          {trade.holdingPeriodDays}
                        </td>
                        <td style={{ 
                          padding: '16px 20px', 
                          textAlign: 'right', 
                          fontSize: '14px',
                          fontWeight: '600',
                          color: trade.return >= 0 ? '#10b981' : '#ef4444'
                        }}>
                          {trade.return >= 0 ? '+' : ''}${trade.return.toFixed(2)}
                        </td>
                        <td style={{ 
                          padding: '16px 20px', 
                          textAlign: 'right', 
                          fontSize: '14px',
                          fontWeight: '600',
                          color: trade.returnPercent >= 0 ? '#10b981' : '#ef4444'
                        }}>
                          {trade.returnPercent >= 0 ? '+' : ''}{trade.returnPercent.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
              </>
            )}
          </>
        )}

        {!results && !isLoading && (
          <div style={{
            background: 'var(--msp-card)',
            border: '1px solid #374151',
            borderRadius: '12px',
            padding: '60px 24px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>📈</div>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#f9fafb', marginBottom: '12px' }}>
              Ready to validate your edge
            </h2>
            <p style={{ color: '#9ca3af', fontSize: '16px', maxWidth: '500px', margin: '0 auto' }}>
              Set symbol, timeframe, and date range, then click "Validate Strategy" for performance, drawdown, and trade-by-trade results.
            </p>
          </div>
        )}

        {/* Legal Disclaimer */}
        <div style={{
          marginTop: '24px',
          padding: '12px 16px',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '8px',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '12px', color: '#D97706', margin: 0 }}>
            ⚠️ <strong>Important:</strong> Backtesting results are hypothetical and do not guarantee future performance. 
            Past performance is not indicative of future results. This tool is for educational purposes only and does not constitute investment advice. 
            Trading involves substantial risk of loss.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function BacktestPage() {
  return (
    <Suspense fallback={
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#0f172a'
      }}>
        <div style={{ color: '#9ca3b8' }}>Loading backtest...</div>
      </div>
    }>
      <BacktestContent />
    </Suspense>
  );
}
