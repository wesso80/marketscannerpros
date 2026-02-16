'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ToolsPageHeader } from '@/components/ToolsPageHeader';
import CommandCenterStateBar from '@/components/CommandCenterStateBar';
import DecisionCockpit from '@/components/terminal/DecisionCockpit';
import AdaptivePersonalityCard from '@/components/AdaptivePersonalityCard';
import { writeOperatorState } from '@/lib/operatorState';
import { createWorkflowEvent, emitWorkflowEvents } from '@/lib/workflow/client';
import type { CandidateEvaluation, OperatorContext, UnifiedSignal } from '@/lib/workflow/types';

type Tone = 'aligned' | 'building' | 'conflict';
type PipelineStage = 'Detected' | 'Qualified' | 'Validated' | 'Ready' | 'Active' | 'Closed';
type OperatorMode = 'OBSERVE' | 'EVALUATE' | 'EXECUTE' | 'REVIEW';

interface DailyPick {
  symbol: string;
  score: number;
  direction?: 'bullish' | 'bearish' | 'neutral';
  price?: number;
  indicators?: {
    atr?: number;
    rsi?: number;
    adx?: number;
  };
}

interface Position {
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  currentPrice: number;
}

interface PerformanceSnapshot {
  totalValue: number;
}

interface JournalEntry {
  pl?: number;
  outcome?: 'win' | 'loss' | 'breakeven' | 'open';
  isOpen?: boolean;
}

interface RecentAlert {
  id: string;
  symbol: string;
  condition: string;
  target_price: number;
  triggered_price: number;
  triggered_at: string;
}

interface AdaptivePayload {
  profile?: {
    riskDNA?: string;
    decisionTiming?: string;
  } | null;
  match?: {
    adaptiveScore?: number;
    personalityMatch?: number;
    reasons?: string[];
  };
}

interface WorkflowToday {
  signals: number;
  candidates: number;
  plans: number;
  executions: number;
  closed: number;
  coachAnalyses: number;
  autoAlerts: number;
  autoJournalDrafts: number;
  lastCoachInsight?: {
    analysisId: string | null;
    createdAt: string | null;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    expectancy: number;
    recommendation: string | null;
  } | null;
  lastEventAt: string | null;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

function classifyPhase(score: number, isActive: boolean): PipelineStage {
  if (isActive) return 'Active';
  if (score >= 74) return 'Ready';
  if (score >= 67) return 'Validated';
  if (score >= 58) return 'Qualified';
  return 'Detected';
}

function stageIndex(stage: PipelineStage): number {
  const order: PipelineStage[] = ['Detected', 'Qualified', 'Validated', 'Ready', 'Active', 'Closed'];
  return order.indexOf(stage);
}

function toneBadge(tone: Tone) {
  if (tone === 'aligned') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (tone === 'building') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border-red-500/30 bg-red-500/10 text-red-300';
}

function layerToneLabel(score: number, yellowFloor = 60): { tone: Tone; label: string } {
  if (score >= 72) return { tone: 'aligned', label: 'Aligned' };
  if (score >= yellowFloor) return { tone: 'building', label: 'Building' };
  return { tone: 'conflict', label: 'Conflict' };
}

export default function OperatorDashboardPage() {
  const lastSignalEventKeyRef = useRef('');
  const [loading, setLoading] = useState(true);
  const [operatorMode, setOperatorMode] = useState<OperatorMode>('OBSERVE');
  const [opportunities, setOpportunities] = useState<DailyPick[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceSnapshot[]>([]);
  const [alerts, setAlerts] = useState<RecentAlert[]>([]);
  const [adaptive, setAdaptive] = useState<AdaptivePayload | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [workflowToday, setWorkflowToday] = useState<WorkflowToday | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [dailyPicksRes, portfolioRes, alertsRes, adaptiveRes, journalRes, workflowTodayRes] = await Promise.all([
          fetch('/api/scanner/daily-picks?limit=6&type=top', { cache: 'no-store' }),
          fetch('/api/portfolio', { cache: 'no-store' }),
          fetch('/api/alerts/recent', { cache: 'no-store' }),
          fetch('/api/adaptive/profile?skill=operator&setup=operator_dashboard&baseScore=72', { cache: 'no-store' }),
          fetch('/api/journal', { cache: 'no-store' }),
          fetch('/api/workflow/today', { cache: 'no-store' }),
        ]);

        const dailyPicks = dailyPicksRes.ok ? await dailyPicksRes.json() : null;
        const portfolio = portfolioRes.ok ? await portfolioRes.json() : null;
        const alertData = alertsRes.ok ? await alertsRes.json() : null;
        const adaptiveData = adaptiveRes.ok ? await adaptiveRes.json() : null;
        const journal = journalRes.ok ? await journalRes.json() : null;
        const workflowData = workflowTodayRes.ok ? await workflowTodayRes.json() : null;

        if (!mounted) return;

        const mergedPicks: DailyPick[] = [
          ...(dailyPicks?.topPicks?.equity || []),
          ...(dailyPicks?.topPicks?.crypto || []),
        ]
          .sort((a: DailyPick, b: DailyPick) => (b.score || 0) - (a.score || 0))
          .slice(0, 6);

        setOpportunities(mergedPicks);
        setPositions(portfolio?.positions || []);
        setPerformanceHistory(portfolio?.performanceHistory || []);
        setAlerts(alertData?.alerts || []);
        setAdaptive(adaptiveData || null);
        setJournalEntries(journal?.entries || []);
        setWorkflowToday(workflowData?.today || null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const focusSignal = opportunities[0] || null;

  const totalExposure = useMemo(() => {
    return positions.reduce((sum, pos) => sum + Math.abs(pos.quantity * pos.currentPrice), 0);
  }, [positions]);

  const portfolioValue = useMemo(() => {
    const latest = performanceHistory[performanceHistory.length - 1]?.totalValue;
    if (Number.isFinite(latest) && latest > 0) return latest;
    return totalExposure || 0;
  }, [performanceHistory, totalExposure]);

  const exposurePct = useMemo(() => {
    if (!portfolioValue) return 0;
    return (totalExposure / portfolioValue) * 100;
  }, [portfolioValue, totalExposure]);

  const concentrationPct = useMemo(() => {
    if (!totalExposure) return 0;
    const bySymbol = positions.reduce<Record<string, number>>((acc, pos) => {
      const notional = Math.abs(pos.quantity * pos.currentPrice);
      acc[pos.symbol] = (acc[pos.symbol] || 0) + notional;
      return acc;
    }, {});
    const maxBucket = Math.max(...Object.values(bySymbol), 0);
    return (maxBucket / totalExposure) * 100;
  }, [positions, totalExposure]);

  const drawdownPct = useMemo(() => {
    const values = performanceHistory
      .map((item) => item.totalValue)
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!values.length) return 0;
    let peak = values[0];
    let maxDrawdown = 0;
    for (const value of values) {
      if (value > peak) peak = value;
      const dd = ((peak - value) / peak) * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
    return maxDrawdown;
  }, [performanceHistory]);

  const concentrationLabel = concentrationPct >= 36 ? 'HIGH' : concentrationPct >= 22 ? 'MEDIUM' : 'LOW';
  const drawdownState = drawdownPct >= 12 ? 'Stressed' : drawdownPct >= 6 ? 'Warming' : 'Stable';

  const activeSymbols = useMemo(() => new Set(positions.map((p) => p.symbol.toUpperCase())), [positions]);
  const currentStage = focusSignal
    ? classifyPhase(focusSignal.score || 0, activeSymbols.has((focusSignal.symbol || '').toUpperCase()))
    : 'Detected';

  const edgeScore = Math.max(1, Math.min(99, Math.round(focusSignal?.score || 50)));
  const bias = focusSignal?.direction || 'neutral';
  const quality = edgeScore >= 74 ? 'High' : edgeScore >= 60 ? 'Medium' : 'Low';

  const currentPrice = focusSignal?.price || 0;
  const atr = focusSignal?.indicators?.atr || (currentPrice * 0.02);

  const bullish = bias === 'bullish';
  const entryLow = bullish ? currentPrice - atr * 0.4 : currentPrice;
  const entryHigh = bullish ? currentPrice : currentPrice + atr * 0.4;
  const stop = bullish ? currentPrice - atr * 1.2 : currentPrice + atr * 1.2;
  const targetOne = bullish ? currentPrice + atr * 1.6 : currentPrice - atr * 1.6;
  const targetTwo = bullish ? currentPrice + atr * 2.5 : currentPrice - atr * 2.5;

  const regimeADX = Number(focusSignal?.indicators?.adx || 20);
  const rsi = Number(focusSignal?.indicators?.rsi || 50);
  const atrRatio = currentPrice > 0 ? (atr / currentPrice) * 100 : 2;

  const regimeLayer = layerToneLabel(regimeADX >= 25 ? 75 : 62);
  const liquidityLayer = layerToneLabel(100 - Math.min(exposurePct, 100), 45);
  const volatilityLayer = atrRatio <= 2.5 ? { tone: 'aligned' as Tone, label: 'Aligned' } : atrRatio <= 4 ? { tone: 'building' as Tone, label: 'Building' } : { tone: 'conflict' as Tone, label: 'Conflict' };
  const timingLayer = layerToneLabel(edgeScore, 56);
  const momentumLayer = (() => {
    if (bias === 'bullish' && rsi >= 50 && rsi <= 68) return { tone: 'aligned' as Tone, label: 'Aligned' };
    if (bias === 'bearish' && rsi <= 50 && rsi >= 32) return { tone: 'aligned' as Tone, label: 'Aligned' };
    if (rsi > 74 || rsi < 26) return { tone: 'conflict' as Tone, label: 'Conflict' };
    return { tone: 'building' as Tone, label: 'Building' };
  })();

  const closedTrades = journalEntries.filter((entry) => !entry.isOpen && entry.outcome !== 'open');
  const wins = closedTrades.filter((entry) => (entry.pl || 0) > 0).length;
  const avgWin = wins ? closedTrades.filter((entry) => (entry.pl || 0) > 0).reduce((sum, entry) => sum + (entry.pl || 0), 0) / wins : 0;
  const losses = closedTrades.filter((entry) => (entry.pl || 0) < 0);
  const avgLoss = losses.length ? Math.abs(losses.reduce((sum, entry) => sum + (entry.pl || 0), 0) / losses.length) : 0;

  const coachSuggestion =
    avgWin > 0 && avgLoss > 0 && avgWin < avgLoss
      ? 'Recent pattern: average losses are larger than wins. Suggestion: tighten risk cap and avoid adding to losing positions.'
      : wins > 0 && avgWin > avgLoss
      ? 'Recent pattern: expectancy is positive. Suggestion: keep position sizing consistent and let winners complete target ladder.'
      : 'Recent pattern: sample size still building. Suggestion: focus on disciplined entries and complete post-trade journal notes.';

  const adaptiveScore = Math.round(adaptive?.match?.adaptiveScore || 50);
  const personalityMatch = Math.round(adaptive?.match?.personalityMatch || 50);
  const riskDNA = adaptive?.profile?.riskDNA || 'warming_up';
  const timingDNA = adaptive?.profile?.decisionTiming?.replace('_', ' ') || 'warming_up';

  const pipeline: PipelineStage[] = ['Detected', 'Qualified', 'Validated', 'Ready', 'Active', 'Closed'];
  const workflowId = useMemo(() => {
    const dateKey = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `wf_operator_${dateKey}`;
  }, []);

  const operatorScore = useMemo(() => {
    const regimeScore = regimeADX >= 25 ? 78 : 62;
    const volatilityScore = atrRatio <= 2.5 ? 76 : atrRatio <= 4 ? 62 : 40;
    const riskScore = drawdownState === 'Stable' ? 76 : drawdownState === 'Warming' ? 58 : 35;
    const blended = Math.round(
      edgeScore * 0.42 +
      adaptiveScore * 0.22 +
      regimeScore * 0.14 +
      volatilityScore * 0.12 +
      riskScore * 0.1
    );
    return Math.max(1, Math.min(99, blended));
  }, [edgeScore, adaptiveScore, regimeADX, atrRatio, drawdownState]);

  const mappedCommandMode = operatorMode === 'REVIEW' ? 'MANAGE' : operatorMode === 'OBSERVE' ? 'OBSERVE' : operatorMode;

  const modeActionable = useMemo(() => {
    if (!focusSignal) {
      return {
        actionableNow: 'No active focus signal. Load market context and source opportunities.',
        nextStep: 'Start in Market Intelligence, then scan for candidates.',
      };
    }

    if (operatorMode === 'OBSERVE') {
      return {
        actionableNow: `Observe regime and market structure around ${focusSignal.symbol}.`,
        nextStep: `Move ${focusSignal.symbol} to Evaluate for setup qualification.`,
      };
    }
    if (operatorMode === 'EVALUATE') {
      return {
        actionableNow: `Evaluate ${focusSignal.symbol} against signal quality and layering conflicts.`,
        nextStep: `Open backtest and alerts to validate execution confidence.`,
      };
    }
    if (operatorMode === 'EXECUTE') {
      return {
        actionableNow: `Execute only if ${focusSignal.symbol} remains aligned with risk command.`,
        nextStep: `Send execution context to journal and portfolio tracking.`,
      };
    }
    return {
      actionableNow: `Review ${focusSignal.symbol} outcomes and behavior patterns.`,
      nextStep: 'Apply learning loop updates before next cycle.',
    };
  }, [focusSignal, operatorMode]);

  const connectedRoutes = useMemo(() => {
    const symbol = focusSignal?.symbol || 'SPY';
    const setup = focusSignal ? `${focusSignal.symbol} operator setup` : 'operator setup';
    const biasLabel = bias || 'neutral';

    return {
      markets: '/tools/markets',
      movers: '/tools/market-movers',
      scanner: `/tools/scanner?symbol=${encodeURIComponent(symbol)}`,
      chart: `/tools/intraday-charts?symbol=${encodeURIComponent(symbol)}&from=operator&mode=${operatorMode.toLowerCase()}`,
      alerts: `/tools/alerts?symbol=${encodeURIComponent(symbol)}&from=operator&stage=${currentStage.toLowerCase()}`,
      backtest: `/tools/backtest?symbol=${encodeURIComponent(symbol)}&from=operator`,
      portfolio: `/tools/portfolio?symbol=${encodeURIComponent(symbol)}&from=operator`,
      journalDraft: `/tools/journal?source=operator&symbol=${encodeURIComponent(symbol)}&setup=${encodeURIComponent(setup)}&strategy=operator_flow&timeframe=intraday&bias=${encodeURIComponent(biasLabel)}&score=${edgeScore}`,
    };
  }, [focusSignal, bias, currentStage, edgeScore, operatorMode]);

  const unifiedSignal: UnifiedSignal | null = useMemo(() => {
    if (!focusSignal) return null;

    return {
      signal_id: `sig_${focusSignal.symbol}_${currentStage}_${new Date().toISOString().slice(0, 13)}`,
      created_at: new Date().toISOString(),
      symbol: focusSignal.symbol,
      asset_class: /^[A-Z]{2,6}$/.test(focusSignal.symbol) ? 'equity' : 'mixed',
      timeframe: 'intraday',
      signal_type: currentStage.toLowerCase(),
      direction: bias === 'bullish' ? 'long' : bias === 'bearish' ? 'short' : 'neutral',
      confidence: operatorScore,
      quality_tier: operatorScore >= 75 ? 'A' : operatorScore >= 62 ? 'B' : operatorScore >= 48 ? 'C' : 'D',
      source: {
        module: 'operator_dashboard',
        submodule: 'unified_signal_flow',
        strategy: 'operator_flow',
      },
      drivers: [
        { category: 'trend', name: 'edge_score', value: edgeScore, weight: 0.42, note: 'Operator edge' },
        { category: 'sentiment', name: 'adaptive_confidence', value: adaptiveScore, weight: 0.22, note: 'AI confidence' },
        { category: 'volatility', name: 'atr_ratio', value: Number(atrRatio.toFixed(2)), weight: 0.12, note: 'Risk expansion proxy' },
        { category: 'risk', name: 'drawdown_state', value: drawdownState, weight: 0.1, note: 'Portfolio stress state' },
      ],
      levels: {
        trigger: Number(entryHigh.toFixed(2)),
        key_support: Number(stop.toFixed(2)),
        key_resistance: Number(targetOne.toFixed(2)),
      },
      evidence: {
        inputs: {
          stage: currentStage,
          adx: Number(regimeADX.toFixed(2)),
          rsi: Number(rsi.toFixed(2)),
          exposure_pct: Number(exposurePct.toFixed(2)),
        },
      },
      operator_context_ref: {
        workflow_id: workflowId,
        operator_context_id: `ctx_${new Date().toISOString().slice(0, 13)}`,
      },
      recommended_actions: [
        { action: 'evaluate', label: 'Run confluence check' },
        { action: 'auto_plan', label: 'Build entry/SL/TP + sizing' },
        { action: 'create_alert', label: 'Set trigger alert' },
      ],
    };
  }, [focusSignal, currentStage, bias, operatorScore, edgeScore, adaptiveScore, atrRatio, drawdownState, regimeADX, rsi, exposurePct, entryHigh, stop, targetOne, workflowId]);

  useEffect(() => {
    writeOperatorState({
      symbol: focusSignal?.symbol || '—',
      edge: edgeScore,
      bias: bias === 'bullish' ? 'BULLISH' : bias === 'bearish' ? 'BEARISH' : 'NEUTRAL',
      action: operatorMode === 'EXECUTE' ? 'EXECUTE' : operatorMode === 'EVALUATE' ? 'PREP' : 'WAIT',
      risk: drawdownState === 'Stressed' ? 'HIGH' : drawdownState === 'Warming' ? 'MODERATE' : 'LOW',
      next: modeActionable.nextStep,
      mode: mappedCommandMode,
    });
  }, [focusSignal, edgeScore, bias, operatorMode, drawdownState, modeActionable.nextStep, mappedCommandMode]);

  useEffect(() => {
    if (!unifiedSignal) return;

    const eventKey = `${unifiedSignal.signal_id}:${operatorMode}:${currentStage}:${operatorScore}`;
    if (lastSignalEventKeyRef.current === eventKey) return;
    lastSignalEventKeyRef.current = eventKey;

    const operatorContext: OperatorContext = {
      as_of: new Date().toISOString(),
      market_session: 'US_CLOSED',
      mood: { label: bias, score: Number((operatorScore / 100).toFixed(2)) },
      regime: {
        volatility: { label: volatilityLayer.label.toLowerCase(), score: Number((atrRatio / 5).toFixed(2)) },
        trend: { label: regimeLayer.label.toLowerCase(), score: Number((regimeADX / 40).toFixed(2)) },
        liquidity: { label: liquidityLayer.label.toLowerCase(), score: Number((Math.max(1, 100 - exposurePct) / 100).toFixed(2)) },
      },
      derivatives: {
        crypto_bias: { label: bias, score: Number((operatorScore / 100).toFixed(2)) },
      },
      risk_dna: {
        profile: riskDNA,
        per_trade_risk_pct: 0.25,
      },
      adaptive_confidence: Number((adaptiveScore / 100).toFixed(2)),
      notes: modeActionable.actionableNow,
    };

    const evaluation: CandidateEvaluation = {
      candidate_id: `cand_${unifiedSignal.symbol}_${currentStage.toLowerCase()}`,
      signal_id: unifiedSignal.signal_id,
      evaluated_at: new Date().toISOString(),
      result: operatorScore >= 60 ? 'pass' : operatorScore >= 45 ? 'watch' : 'fail',
      confidence_delta: Math.max(-20, Math.min(20, operatorScore - edgeScore)),
      final_confidence: operatorScore,
      checks: [
        { name: 'multi_tf_alignment', status: operatorScore >= 60 ? 'pass' : 'warn', detail: `Stage ${currentStage}` },
        { name: 'regime_match', status: regimeLayer.tone === 'conflict' ? 'warn' : 'pass', detail: `Regime ${regimeLayer.label}` },
        { name: 'risk_state', status: drawdownState === 'Stressed' ? 'warn' : 'pass', detail: `Drawdown ${drawdownState}` },
      ],
      notes: modeActionable.nextStep,
      suggested_plan: {
        entry: { type: 'zone', low: entryLow, high: entryHigh },
        stop: { type: 'price', price: stop },
        target: { type: 'price', price: targetOne },
      },
    };

    emitWorkflowEvents([
      createWorkflowEvent({
        eventType: 'operator.context.updated',
        workflowId,
        route: '/operator',
        module: 'operator_dashboard',
        entity: {
          entity_type: 'operator_context',
          entity_id: unifiedSignal.operator_context_ref?.operator_context_id || `ctx_${Date.now()}`,
          symbol: unifiedSignal.symbol,
          asset_class: unifiedSignal.asset_class,
        },
        payload: {
          operator_context: operatorContext,
        },
      }),
      createWorkflowEvent({
        eventType: 'signal.created',
        workflowId,
        route: '/operator',
        module: 'operator_dashboard',
        entity: {
          entity_type: 'signal',
          entity_id: unifiedSignal.signal_id,
          symbol: unifiedSignal.symbol,
          asset_class: unifiedSignal.asset_class,
        },
        payload: {
          signal: unifiedSignal,
        },
      }),
      createWorkflowEvent({
        eventType: 'candidate.evaluated',
        workflowId,
        route: '/operator',
        module: 'operator_dashboard',
        entity: {
          entity_type: 'candidate',
          entity_id: evaluation.candidate_id,
          symbol: unifiedSignal.symbol,
          asset_class: unifiedSignal.asset_class,
        },
        payload: {
          evaluation,
        },
      }),
    ]);
  }, [
    unifiedSignal,
    operatorMode,
    currentStage,
    operatorScore,
    workflowId,
    bias,
    volatilityLayer.label,
    atrRatio,
    regimeLayer.tone,
    regimeLayer.label,
    regimeADX,
    liquidityLayer.label,
    exposurePct,
    riskDNA,
    adaptiveScore,
    modeActionable.actionableNow,
    modeActionable.nextStep,
    drawdownState,
    edgeScore,
    entryLow,
    entryHigh,
    stop,
    targetOne,
  ]);

  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      <ToolsPageHeader
        badge="OPERATOR"
        title="Operator Dashboard"
        subtitle="Unified execution surface for signal flow, risk command, and learning loop"
        icon="🧭"
      />

      <div className="mx-auto max-w-[1600px] px-4 py-6">
        <CommandCenterStateBar
          mode={mappedCommandMode}
          actionableNow={modeActionable.actionableNow}
          nextStep={modeActionable.nextStep}
        />

        <section className="mb-4 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Operator Mode</div>
          <div className="grid gap-2 sm:grid-cols-4">
            {(['OBSERVE', 'EVALUATE', 'EXECUTE', 'REVIEW'] as OperatorMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setOperatorMode(mode)}
                className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                  operatorMode === mode
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700 bg-slate-900/50 text-slate-300 hover:border-slate-500'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-4 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Today's Workflow</div>
          <div className="grid gap-2 md:grid-cols-8">
            <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs">
              <div className="text-slate-400 uppercase tracking-wide">Signals</div>
              <div className="font-bold text-emerald-300">{workflowToday?.signals ?? 0}</div>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs">
              <div className="text-slate-400 uppercase tracking-wide">Candidates</div>
              <div className="font-bold text-emerald-300">{workflowToday?.candidates ?? 0}</div>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs">
              <div className="text-slate-400 uppercase tracking-wide">Plans</div>
              <div className="font-bold text-purple-300">{workflowToday?.plans ?? 0}</div>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs">
              <div className="text-slate-400 uppercase tracking-wide">Auto Alerts</div>
              <div className="font-bold text-amber-300">{workflowToday?.autoAlerts ?? 0}</div>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs">
              <div className="text-slate-400 uppercase tracking-wide">Auto Drafts</div>
              <div className="font-bold text-blue-300">{workflowToday?.autoJournalDrafts ?? 0}</div>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs">
              <div className="text-slate-400 uppercase tracking-wide">Executed</div>
              <div className="font-bold text-indigo-300">{workflowToday?.executions ?? 0}</div>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs">
              <div className="text-slate-400 uppercase tracking-wide">Closed</div>
              <div className="font-bold text-emerald-300">{workflowToday?.closed ?? 0}</div>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs">
              <div className="text-slate-400 uppercase tracking-wide">Coach</div>
              <div className="font-bold text-violet-300">{workflowToday?.coachAnalyses ?? 0}</div>
            </div>
          </div>
          <div className="mt-3 rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs">
            <div className="text-violet-200 uppercase tracking-wide">Last Coach Insight</div>
            {workflowToday?.lastCoachInsight ? (
              <div className="mt-1 space-y-1 text-violet-100">
                <div>
                  Win {formatNumber(workflowToday.lastCoachInsight.winRate)}% · Avg Win {formatNumber(workflowToday.lastCoachInsight.avgWin)} · Avg Loss {formatNumber(workflowToday.lastCoachInsight.avgLoss)} · Expectancy {formatNumber(workflowToday.lastCoachInsight.expectancy)}
                </div>
                <div className="text-violet-200/90">
                  {workflowToday.lastCoachInsight.recommendation || 'No recommendation available yet.'}
                </div>
              </div>
            ) : (
              <div className="mt-1 text-violet-200/90">No coach analysis generated yet today.</div>
            )}
          </div>
        </section>

        <div className="mb-4 grid gap-2 md:grid-cols-5">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs">
            <div className="text-emerald-300 uppercase tracking-wide">Operator Mode</div>
            <div className="font-bold">{operatorMode}</div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs">
            <div className="text-slate-400 uppercase tracking-wide">Regime</div>
            <div className="font-bold">{regimeADX >= 25 ? 'TRENDING' : 'TRANSITIONAL'}</div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs">
            <div className="text-slate-400 uppercase tracking-wide">Risk DNA</div>
            <div className="font-bold uppercase">{riskDNA}</div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs">
            <div className="text-slate-400 uppercase tracking-wide">Timing</div>
            <div className="font-bold uppercase">{timingDNA}</div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs">
            <div className="text-slate-400 uppercase tracking-wide">Adaptive Confidence</div>
            <div className="font-bold text-emerald-300">{adaptiveScore}%</div>
          </div>
          <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs">
            <div className="text-indigo-300 uppercase tracking-wide">MSP Operator Score™</div>
            <div className="font-bold text-indigo-200">{operatorScore}/100</div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <aside className="space-y-4 lg:col-span-3">
            <section className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-300">Signal Flow</h2>
              <div className="space-y-2">
                {loading ? (
                  <p className="text-xs text-slate-500">Loading opportunities...</p>
                ) : opportunities.length === 0 ? (
                  <p className="text-xs text-slate-500">No opportunities available.</p>
                ) : (
                  opportunities.slice(0, 5).map((item) => {
                    const stage = classifyPhase(item.score || 0, activeSymbols.has(item.symbol.toUpperCase()));
                    return (
                      <div key={`${item.symbol}-${item.score}`} className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-emerald-300">{item.symbol}</span>
                          <span className="text-xs text-slate-400">{(item.direction || 'neutral').toUpperCase()}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-400">Confidence: {formatNumber(item.score)}</div>
                        <div className="mt-1 text-xs text-purple-300">Phase: {stage.toUpperCase()}</div>
                        <Link href={`/tools/backtest?symbol=${encodeURIComponent(item.symbol)}&from=operator`} className="mt-2 inline-block text-xs text-emerald-300 hover:text-emerald-200">
                          → Continue to Validation
                        </Link>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-300">Signal Pipeline</h3>
              <div className="space-y-2">
                {pipeline.map((step, index) => {
                  const active = index <= stageIndex(currentStage);
                  return (
                    <div key={step} className={`rounded-md border px-2 py-1 text-xs ${active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-900/50 text-slate-500'}`}>
                      {step}
                    </div>
                  );
                })}
              </div>
            </section>
          </aside>

          <main className="space-y-4 lg:col-span-6">
            <section className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">Decision Cockpit</h2>
              <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Current Focus Trade</div>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <div>
                    <div className="text-slate-500">Symbol</div>
                    <div className="font-bold text-emerald-300">{focusSignal?.symbol || '—'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Bias</div>
                    <div className="font-bold uppercase">{bias}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Edge</div>
                    <div className="font-bold text-emerald-300">{edgeScore}%</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Quality</div>
                    <div className="font-bold">{quality}</div>
                  </div>
                </div>
              </div>
            </section>

            <DecisionCockpit
              left={
                <div className="space-y-2 text-xs">
                  <div className={`rounded-md border px-2 py-1 ${toneBadge(regimeLayer.tone)}`}>Market Regime: {regimeLayer.label}</div>
                  <div className={`rounded-md border px-2 py-1 ${toneBadge(liquidityLayer.tone)}`}>Liquidity: {liquidityLayer.label}</div>
                  <div className={`rounded-md border px-2 py-1 ${toneBadge(volatilityLayer.tone)}`}>Volatility: {volatilityLayer.label}</div>
                  <div className={`rounded-md border px-2 py-1 ${toneBadge(timingLayer.tone)}`}>Timing: {timingLayer.label}</div>
                  <div className={`rounded-md border px-2 py-1 ${toneBadge(momentumLayer.tone)}`}>Momentum: {momentumLayer.label}</div>
                </div>
              }
              center={
                <div className="space-y-2 text-xs">
                  <div className="rounded-md border border-slate-700 bg-slate-900/50 px-2 py-1">Entry Zone: {formatNumber(entryLow)} - {formatNumber(entryHigh)}</div>
                  <div className="rounded-md border border-slate-700 bg-slate-900/50 px-2 py-1">Stop: {formatNumber(stop)}</div>
                  <div className="rounded-md border border-slate-700 bg-slate-900/50 px-2 py-1">Target 1: {formatNumber(targetOne)}</div>
                  <div className="rounded-md border border-slate-700 bg-slate-900/50 px-2 py-1">Target 2: {formatNumber(targetTwo)}</div>
                </div>
              }
              right={
                <div className="space-y-2 text-xs">
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1">R Multiple Plan: 1.0R risk / 2.2R reward</div>
                  <div className="rounded-md border border-slate-700 bg-slate-900/50 px-2 py-1">Trade Personality Match: {personalityMatch}%</div>
                  <div className="rounded-md border border-slate-700 bg-slate-900/50 px-2 py-1">Execution Trigger: {currentStage === 'Ready' || currentStage === 'Active' ? 'Armed' : 'Pending validation'}</div>
                  <div className="flex gap-2 pt-1">
                    {operatorMode === 'OBSERVE' && (
                      <>
                        <Link href={connectedRoutes.markets} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-cyan-300 hover:bg-cyan-500/20">
                          Market Context
                        </Link>
                        <Link href={connectedRoutes.movers} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-cyan-300 hover:bg-cyan-500/20">
                          Market Movers
                        </Link>
                      </>
                    )}
                    {operatorMode === 'EVALUATE' && (
                      <>
                        <Link href={connectedRoutes.scanner} className="rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-1 text-purple-300 hover:bg-purple-500/20">
                          Find Setup
                        </Link>
                        <Link href={connectedRoutes.backtest} className="rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-1 text-purple-300 hover:bg-purple-500/20">
                          Validate Edge
                        </Link>
                      </>
                    )}
                    {operatorMode === 'EXECUTE' && (
                      <>
                        <Link href={connectedRoutes.chart} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300 hover:bg-emerald-500/20">
                          Open Chart
                        </Link>
                        <Link href={connectedRoutes.alerts} className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-300 hover:bg-amber-500/20">
                          Arm Alerts
                        </Link>
                      </>
                    )}
                    {operatorMode === 'REVIEW' && (
                      <>
                        <Link href={connectedRoutes.journalDraft} className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-blue-300 hover:bg-blue-500/20">
                          Auto Journal Draft
                        </Link>
                        <Link href={connectedRoutes.portfolio} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300 hover:bg-emerald-500/20">
                          Review Portfolio
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              }
            />
          </main>

          <aside className="space-y-4 lg:col-span-3">
            <section className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-300">Risk Command</h2>
              <div className="space-y-2 text-xs">
                <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2">
                  <div className="text-slate-400">Total Exposure</div>
                  <div className="font-bold text-emerald-300">{formatNumber(exposurePct)}%</div>
                </div>
                <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2">
                  <div className="text-slate-400">Sector Concentration</div>
                  <div className={`font-bold ${concentrationLabel === 'HIGH' ? 'text-red-300' : concentrationLabel === 'MEDIUM' ? 'text-amber-300' : 'text-emerald-300'}`}>{concentrationLabel}</div>
                </div>
                <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2">
                  <div className="text-slate-400">Max Drawdown State</div>
                  <div className={`font-bold ${drawdownState === 'Stressed' ? 'text-red-300' : drawdownState === 'Warming' ? 'text-amber-300' : 'text-emerald-300'}`}>{drawdownState}</div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-300">Live Trade Alerts</h3>
              <div className="space-y-2 text-xs">
                {alerts.length === 0 ? (
                  <p className="text-slate-500">No fresh alerts in the last 5 minutes.</p>
                ) : (
                  alerts.map((alert) => (
                    <div key={alert.id} className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-200">
                      ⚠ {alert.symbol} {alert.condition.replaceAll('_', ' ')} at {formatNumber(alert.triggered_price)}
                    </div>
                  ))
                )}
              </div>
              <Link href={connectedRoutes.alerts} className="mt-3 inline-block text-xs text-emerald-300 hover:text-emerald-200">Open Alert Intelligence →</Link>
            </section>
          </aside>
        </div>

        <section className="mt-4 rounded-xl border border-slate-700 bg-slate-800/40 p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-300">Learning Loop · AI Operator Coach</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm text-slate-300">
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">Coach Insight</div>
              <p>{coachSuggestion}</p>
              {adaptive?.match?.reasons?.length ? (
                <ul className="mt-2 space-y-1 text-xs text-slate-400">
                  {adaptive.match.reasons.slice(0, 2).map((reason, idx) => (
                    <li key={idx}>• {reason}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <AdaptivePersonalityCard
              skill="operator"
              setupText={focusSignal ? `${focusSignal.symbol} operator execution context` : 'operator execution context'}
              direction={bias}
              timeframe="1d"
              urgency={currentStage === 'Ready' || currentStage === 'Active' ? 'immediate' : 'within_hour'}
              regime={regimeADX >= 25 ? 'trend' : 'range'}
              baseScore={edgeScore}
              compact
            />
          </div>
        </section>
      </div>
    </div>
  );
}
