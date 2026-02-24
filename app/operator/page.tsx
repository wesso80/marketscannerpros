'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ToolsNavBar from '@/components/ToolsNavBar';
import AdaptivePersonalityCard from '@/components/AdaptivePersonalityCard';
import { writeOperatorState } from '@/lib/operatorState';
import { createWorkflowEvent, emitWorkflowEvents } from '@/lib/workflow/client';
import { useUserTier, canAccessBrain } from '@/lib/useUserTier';
import type { CandidateEvaluation, OperatorContext, UnifiedSignal } from '@/lib/workflow/types';
import CapitalControlStrip from '@/components/risk/CapitalControlStrip';
import { RiskPermissionProvider } from '@/components/risk/RiskPermissionContext';
import { RegimeProvider } from '@/lib/useRegime';
import PermissionChip from '@/components/risk/PermissionChip';
import RiskApplicationOverlay from '@/components/risk/RiskApplicationOverlay';
import ToolPageLayout from '@/components/tools/ToolPageLayout';
import type { Permission, PermissionMatrixSnapshot } from '@/lib/risk-governor-hard';
import { amountToR, formatDollar, formatR, rToDollar } from '@/lib/riskDisplay';
import SessionPhaseStrip from '@/components/operator/SessionPhaseStrip';
import CorrelationMatrix from '@/components/operator/CorrelationMatrix';
import RiskManagerMode from '@/components/operator/RiskManagerMode';

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
  entryPrice?: number;
  currentPrice: number;
}

interface PerformanceSnapshot {
  totalValue: number;
}

interface JournalEntry {
  pl?: number;
  normalizedR?: number;
  dynamicR?: number;
  riskPerTradeAtEntry?: number;
  equityAtEntry?: number;
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
  coachTasks?: number;
  coachTasksAccepted?: number;
  coachTasksRejected?: number;
  autoAlerts: number;
  autoJournalDrafts: number;
  coachJournalEnrichments?: number;
  conversions?: {
    signalToCandidatePct: number;
    candidateToPlanPct: number;
    planToExecutionPct: number;
    executionToClosedPct: number;
    closedToCoachPct: number;
    taskAcceptPct: number;
  };
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

interface CoachTaskItem {
  taskId: string;
  suggestedEventId: string;
  workflowId: string;
  symbol: string | null;
  action: string;
  detail: string;
  priority: string;
  suggestedAt: string;
  resolved: boolean;
}

interface OperatorPresenceSummary {
  lastPresenceTs?: string;
  dataFreshness?: {
    marketDataAgeSec: number | null;
    eventsWriteAgeSec: number | null;
    operatorStateAgeSec: number | null;
    eventsWrittenLast5m: number;
    eventsByTypeLast5m: Record<string, number>;
  };
  systemHealth?: {
    status: 'OK' | 'DEGRADED' | 'STALE';
    reasons: string[];
  };
  modeChangeEvidence?: {
    lastModeChangeTs: string;
    previousMode: string;
    currentMode: string;
    rationale: string;
    drivers: Array<{
      key: string;
      before: number;
      after: number;
      eventRef: string | null;
    }>;
  };
  marketState: {
    marketBias: string;
    volatilityState: string;
    userMode: string;
    updatedAt: string | null;
  };
  riskLoad: {
    userRiskLoad: number;
    environment: string;
  };
  adaptiveInputs?: {
    marketReality: {
      mode: string;
      volatilityState: string;
      signalDensity: number;
      confluenceDensity: number;
    };
    operatorReality: {
      mode: string;
      actions8h: number;
      executions8h: number;
      closed8h: number;
      behaviorQuality: number;
    };
    operatorBrain?: {
      state: 'FLOW' | 'FOCUSED' | 'STRESSED' | 'OVERLOADED';
      executionMode: 'flow' | 'hesitant' | 'aggressive';
      fatigueScore: number;
      riskToleranceScore: number;
      riskCapacity: 'HIGH' | 'MEDIUM' | 'LOW';
      thresholdShift: number;
      aggressionBias: 'reduced' | 'balanced' | 'elevated';
      guidance: string;
    };
    learningFeedback?: {
      total7d: number;
      validatedPct: number;
      ignoredPct: number;
      wrongContextPct: number;
      timingIssuePct: number;
      penalty: number;
      bonus: number;
    };
    cognitiveLoad: {
      level: string;
      value: number;
      openAlerts: number;
      unresolvedPlans: number;
      simultaneousSetups: number;
    };
    intentDirection: string;
  };
  experienceMode?: {
    key: 'hunt' | 'focus' | 'risk_control' | 'learning' | 'passive_scan';
    label: string;
    rationale: string;
    priorityWidgets?: string[];
    hiddenWidgets?: string[];
    actionFriction?: number;
    alertIntensity?: number;
    directives: {
      showScanner: boolean;
      emphasizeRisk: boolean;
      reduceAlerts: boolean;
      highlightLearning: boolean;
      minimalSurface: boolean;
      quickActions: boolean;
      frictionLevel: 'low' | 'medium' | 'high';
    };
  };
  controlMatrix?: {
    matrixScore: number;
    axes: {
      market: { mode: string; score: number };
      operator: { mode: string; score: number };
      risk: { mode: string; score: number };
      intent: { mode: string; score: number };
    };
    output: {
      mode: string;
      label: string;
      reason: string;
      priorityWidgets: string[];
      hiddenWidgets: string[];
      actionFriction: number;
      alertIntensity: number;
    };
  };
  consciousnessLoop?: {
    interpret: {
      decisionContext: string;
      suitability: 'high' | 'moderate' | 'low';
    };
    decide: {
      confidence: number;
      suggestedActions: string[];
      decisionPacket: {
        id: string;
        symbol: string;
        signalScore: number;
        riskScore: number;
        operatorFit?: number;
        status: string;
      };
    };
    learn: {
      feedbackTag: 'validated' | 'ignored' | 'wrong_context' | 'timing_issue';
      rationale: string;
    };
    adapt: {
      adjustments: string[];
    };
  };
  behavior?: {
    lateEntryPct: number;
    earlyExitPct: number;
    ignoredSetupPct: number;
    behaviorQuality: number;
    sample?: {
      executionsWithPlan: number;
      closedWithExecution: number;
      passCandidates: number;
    };
  };
  topAttention: Array<{
    symbol: string;
    confidence: number;
    hits: number;
    personalEdge: number;
    operatorFit: number;
    sampleSize: number;
    avgPl: number;
    behaviorQuality?: number;
  }>;
  symbolExperienceModes?: Array<{
    symbol: string;
    operatorFit: number;
    confidence: number;
    personalEdge: number;
    mode: {
      key: 'hunt' | 'focus' | 'risk_control' | 'learning' | 'passive_scan';
      label: string;
      directives: {
        showScanner: boolean;
        emphasizeRisk: boolean;
        reduceAlerts: boolean;
        highlightLearning: boolean;
        minimalSurface: boolean;
        quickActions: boolean;
        frictionLevel: 'low' | 'medium' | 'high';
      };
    };
    reason: string;
  }>;
  suggestedActions: Array<{
    key: string;
    label: string;
    reason: string;
  }>;
  neuralAttention?: {
    focus: {
      primary: string | null;
      secondary: string[];
      reason: string;
      horizon: 'NOW' | 'TODAY' | 'SWING';
      lockedUntilTs?: string;
      pinned?: boolean;
    };
    scoreboard: Array<{
      symbol: string;
      score: number;
      components: {
        setupQuality: number;
        operatorFit: number;
        urgency: number;
        readiness: number;
        riskPenalty: number;
        learningBias: number;
      };
      state: 'watch' | 'candidate' | 'plan' | 'alert' | 'execute' | 'cooldown';
      nextAction: 'create_alert' | 'prepare_plan' | 'wait' | 'reduce_risk' | 'journal';
      why: string;
    }>;
    uiDirectives: {
      promoteWidgets: string[];
      demoteWidgets: string[];
      highlightSymbol: string | null;
      focusStrip: Array<{ id: string; label: string; value: string; tone: 'good' | 'warn' | 'bad' }>;
      refreshSeconds: number;
    };
    nudges: Array<{
      id: string;
      type: 'attention_shift' | 'risk_guard' | 'action_prompt';
      text: string;
      severity: 'low' | 'med' | 'high';
      ttlSeconds: number;
    }>;
  };
  pendingTaskCount: number;
}

interface DecisionPacketTraceItem {
  source: 'ai_event' | 'alert' | 'journal';
  createdAt: string;
  type: string;
  id: string;
  symbol: string | null;
  workflowId: string | null;
  payload: Record<string, unknown>;
}

interface DecisionPacketTraceSummary {
  events: number;
  alerts: number;
  journalEntries: number;
  totalItems: number;
  latestAt: string | null;
  earliestAt: string | null;
  symbols: string[];
  workflowIds: string[];
}

interface DecisionPacketTraceResponse {
  decisionPacketId: string;
  summary: DecisionPacketTraceSummary;
  timeline: DecisionPacketTraceItem[];
}

interface RiskGovernorDecision {
  allowed: boolean;
  reasonCode: string | null;
  reason: string | null;
}

interface RiskGovernorDebugResponse {
  thresholds: {
    maxAutoAlertsPerHour: number;
    maxAutoAlertsPerDay: number;
    maxPlanRiskScoreForAutoAlert: number;
    maxCognitiveLoadForAutoActions: number;
    blockWhenOverloaded: boolean;
    allowSystemExecutionAutomation: boolean;
  };
  snapshot: {
    riskEnvironment: string | null;
    cognitiveLoad: number | null;
    executionAutomationOptIn: boolean;
    autoAlertsLastHour: number;
    autoAlertsToday: number;
    stateUpdatedAt: string | null;
  };
  debugInput: {
    requestedPlanRiskScore: number | null;
    systemActor: boolean;
  };
  decisions: {
    autoAlert: RiskGovernorDecision;
    systemExecution: RiskGovernorDecision;
  };
}

type OperatorProposalActionType = 'create_alert' | 'create_journal_draft' | 'create_plan_draft';

interface OperatorProposal {
  id: string;
  rank: number;
  packetId: string;
  symbol: string | null;
  assetClass: string | null;
  status: string | null;
  score: number;
  confidence: number;
  signalScore: number;
  action: {
    type: OperatorProposalActionType;
    payload: Record<string, any>;
    mode: 'draft' | 'commit';
    requiresConfirm: boolean;
  };
  reasoning: {
    focus: string | null;
    riskEnvironment: string;
    freshness: number;
    packetFit: number;
  };
  cooldown: {
    key: string;
    expiresAt: string;
  };
  updatedAt: string;
}

interface OperatorProposalResponse {
  success: boolean;
  proposals: OperatorProposal[];
  generatedAt: string;
}

function getPresenceFromApiResponse(payload: any): OperatorPresenceSummary | null {
  if (payload?.presenceV1?.presence) return payload.presenceV1.presence as OperatorPresenceSummary;
  if (payload?.presence) return payload.presence as OperatorPresenceSummary;
  return null;
}

function heartbeatIntervalForBrainState(state?: 'FLOW' | 'FOCUSED' | 'STRESSED' | 'OVERLOADED'): number {
  if (state === 'FLOW') return 40000;
  if (state === 'FOCUSED') return 30000;
  if (state === 'STRESSED') return 24000;
  if (state === 'OVERLOADED') return 34000;
  return 30000;
}

function createHeartbeatMonologues(presence: OperatorPresenceSummary | null): string[] {
  const lines: string[] = [];
  const marketMode = presence?.adaptiveInputs?.marketReality?.mode?.replaceAll('_', ' ');
  const operatorMode = presence?.adaptiveInputs?.operatorReality?.mode?.replaceAll('_', ' ');
  const suitability = presence?.consciousnessLoop?.interpret?.suitability;
  const symbol = presence?.consciousnessLoop?.decide?.decisionPacket?.symbol;
  const confidence = presence?.consciousnessLoop?.decide?.confidence;

  lines.push('Scanning…');
  if (marketMode) lines.push(`Watching ${marketMode} regime…`);
  if (operatorMode) lines.push(`Operator state: ${operatorMode}…`);
  if (typeof confidence === 'number') lines.push(`Signal confidence ${formatNumber(confidence)}%…`);
  if (symbol) lines.push(`Top attention on ${symbol}…`);
  if (suitability) lines.push(`Suitability reading: ${suitability}…`);
  lines.push('No high-fit setup yet…');
  lines.push('Signal density updating…');

  return Array.from(new Set(lines));
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  if (Math.abs(value) >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (Math.abs(value) >= 1) return value.toFixed(2);
  if (Math.abs(value) >= 0.01) return value.toFixed(2);
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
  const { tier } = useUserTier();
  const canUseBrain = canAccessBrain(tier);
  const lastSignalEventKeyRef = useRef('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operatorMode, setOperatorMode] = useState<OperatorMode>('OBSERVE');
  const [opportunities, setOpportunities] = useState<DailyPick[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceSnapshot[]>([]);
  const [alerts, setAlerts] = useState<RecentAlert[]>([]);
  const [adaptive, setAdaptive] = useState<AdaptivePayload | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [workflowToday, setWorkflowToday] = useState<WorkflowToday | null>(null);
  const [presence, setPresence] = useState<OperatorPresenceSummary | null>(null);
  const [coachTasksQueue, setCoachTasksQueue] = useState<CoachTaskItem[]>([]);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [loopFeedbackSaving, setLoopFeedbackSaving] = useState<null | 'validated' | 'ignored' | 'wrong_context' | 'timing_issue'>(null);
  const [decisionPacketTrace, setDecisionPacketTrace] = useState<DecisionPacketTraceResponse | null>(null);
  const [decisionPacketTraceLoading, setDecisionPacketTraceLoading] = useState(false);
  const [riskGovernorDebug, setRiskGovernorDebug] = useState<RiskGovernorDebugResponse | null>(null);
  const [permissionSnapshot, setPermissionSnapshot] = useState<PermissionMatrixSnapshot | null>(null);
  const [riskGovernorRefreshing, setRiskGovernorRefreshing] = useState(false);
  const [heartbeatLastBeatAt, setHeartbeatLastBeatAt] = useState<string | null>(null);
  const [heartbeatMonologue, setHeartbeatMonologue] = useState('Scanning…');
  const [heartbeatDrift, setHeartbeatDrift] = useState('Heartbeat initializing…');
  const [focusActionSaving, setFocusActionSaving] = useState<null | 'create_alert' | 'prepare_plan' | 'snooze' | 'pin'>(null);
  const [proposals, setProposals] = useState<OperatorProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [proposalBusyId, setProposalBusyId] = useState<string | null>(null);
  const [proposalFeedback, setProposalFeedback] = useState<string | null>(null);
  const [dismissedProposalIds, setDismissedProposalIds] = useState<Record<string, true>>({});
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const results = await Promise.allSettled([
          fetch('/api/scanner/daily-picks?limit=6&type=top', { cache: 'no-store' }),
          fetch('/api/portfolio', { cache: 'no-store' }),
          fetch('/api/alerts/recent', { cache: 'no-store' }),
          fetch('/api/adaptive/profile?skill=operator&setup=operator_dashboard&baseScore=72', { cache: 'no-store' }),
          fetch('/api/journal', { cache: 'no-store' }),
          fetch('/api/workflow/today', { cache: 'no-store' }),
          fetch('/api/workflow/tasks?status=pending&limit=5', { cache: 'no-store' }),
          fetch('/api/operator/presence', { cache: 'no-store' }),
          fetch('/api/operator/risk-governor', { cache: 'no-store' }),
          fetch('/api/risk/governor/permission-snapshot', { cache: 'no-store' }),
        ]);

        const safeJson = async (r: PromiseSettledResult<Response>) =>
          r.status === 'fulfilled' && r.value.ok ? r.value.json().catch(() => null) : null;

        const [dailyPicks, portfolio, alertData, adaptiveData, journal, workflowData, workflowTasksData, presenceData, riskGovernorData, permissionSnapshotData] = await Promise.all(
          results.map(safeJson)
        );

        const failedCount = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length;
        if (failedCount > 0) {
          setLoadError(`${failedCount} of 10 data sources unavailable. Some sections may show incomplete data.`);
        }

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
        setPresence(getPresenceFromApiResponse(presenceData));
        setCoachTasksQueue(workflowTasksData?.tasks || []);
        setRiskGovernorDebug((riskGovernorData || null) as RiskGovernorDebugResponse | null);
        setPermissionSnapshot((permissionSnapshotData || null) as PermissionMatrixSnapshot | null);
      } catch (err) {
        if (mounted) setLoadError('Failed to load operator dashboard. Please refresh.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const refreshWorkflowToday = async () => {
    const workflowTodayRes = await fetch('/api/workflow/today', { cache: 'no-store' });
    if (!workflowTodayRes.ok) return;
    const workflowData = await workflowTodayRes.json();
    setWorkflowToday(workflowData?.today || null);
  };

  const refreshCoachTasks = async () => {
    const tasksRes = await fetch('/api/workflow/tasks?status=pending&limit=5', { cache: 'no-store' });
    if (!tasksRes.ok) return;
    const tasksData = await tasksRes.json();
    setCoachTasksQueue(tasksData?.tasks || []);
  };

  const refreshRiskGovernor = async (planRiskScore?: number) => {
    setRiskGovernorRefreshing(true);
    const query = typeof planRiskScore === 'number' && Number.isFinite(planRiskScore)
      ? `?planRiskScore=${encodeURIComponent(String(planRiskScore))}&systemActor=true`
      : '?systemActor=true';
    try {
      const res = await fetch(`/api/operator/risk-governor${query}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as RiskGovernorDebugResponse;
      setRiskGovernorDebug(data);

      const permissionRes = await fetch('/api/risk/governor/permission-snapshot', { cache: 'no-store' });
      if (permissionRes.ok) {
        const permissionData = (await permissionRes.json()) as PermissionMatrixSnapshot;
        setPermissionSnapshot(permissionData);
      }
    } finally {
      setRiskGovernorRefreshing(false);
    }
  };

  const refreshProposals = async () => {
    setProposalsLoading(true);
    try {
      const res = await fetch('/api/operator/proposals?limit=8', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as OperatorProposalResponse;
      const next = Array.isArray(data?.proposals) ? data.proposals : [];
      setProposals(next);
    } finally {
      setProposalsLoading(false);
    }
  };

  const refreshPresenceHeartbeat = async () => {
    const presenceRes = await fetch('/api/operator/presence', { cache: 'no-store' });
    if (!presenceRes.ok) return;

    const payload = await presenceRes.json();
    const nextPresence = getPresenceFromApiResponse(payload);
    if (!nextPresence) return;

    setPresence((prev) => {
      const prevConfidence = prev?.consciousnessLoop?.decide?.confidence;
      const nextConfidence = nextPresence?.consciousnessLoop?.decide?.confidence;
      const prevSymbol = prev?.consciousnessLoop?.decide?.decisionPacket?.symbol;
      const nextSymbol = nextPresence?.consciousnessLoop?.decide?.decisionPacket?.symbol;
      const prevRisk = prev?.riskLoad?.environment;
      const nextRisk = nextPresence?.riskLoad?.environment;

      if (typeof prevConfidence === 'number' && typeof nextConfidence === 'number' && prevConfidence !== nextConfidence) {
        const delta = Number((nextConfidence - prevConfidence).toFixed(2));
        const sign = delta > 0 ? '+' : '';
        setHeartbeatDrift(`Confidence drift ${sign}${formatNumber(delta)} → ${formatNumber(nextConfidence)}%`);
      } else if (prevSymbol && nextSymbol && prevSymbol !== nextSymbol) {
        setHeartbeatDrift(`Attention shift ${prevSymbol} → ${nextSymbol}`);
      } else if (prevRisk && nextRisk && prevRisk !== nextRisk) {
        setHeartbeatDrift(`Risk tone ${prevRisk.toLowerCase()} → ${nextRisk.toLowerCase()}`);
      } else {
        setHeartbeatDrift('State stable — monitoring for change.');
      }

      return nextPresence;
    });

    setHeartbeatLastBeatAt(new Date().toISOString());
    await refreshRiskGovernor(
      typeof nextPresence.consciousnessLoop?.decide?.decisionPacket?.riskScore === 'number'
        ? nextPresence.consciousnessLoop.decide.decisionPacket.riskScore
        : undefined
    );

    const lines = createHeartbeatMonologues(nextPresence);
    setHeartbeatMonologue(lines[Math.floor(Math.random() * lines.length)] || 'Scanning…');
  };

  const handleTaskDecision = async (taskId: string, decision: 'accepted' | 'rejected') => {
    if (!taskId) return;
    setUpdatingTaskId(taskId);
    try {
      const res = await fetch('/api/workflow/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskId, decision }),
      });

      if (!res.ok) return;

      await Promise.all([refreshWorkflowToday(), refreshCoachTasks()]);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const submitLoopFeedback = async (feedbackTag: 'validated' | 'ignored' | 'wrong_context' | 'timing_issue') => {
    if (!presence?.consciousnessLoop?.decide?.decisionPacket?.id) return;

    setLoopFeedbackSaving(feedbackTag);
    try {
      const response = await fetch('/api/workflow/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackTag,
          decisionPacketId: presence.consciousnessLoop.decide.decisionPacket.id,
          symbol: presence.consciousnessLoop.decide.decisionPacket.symbol,
          confidence: presence.consciousnessLoop.decide.confidence,
        }),
      });

      if (!response.ok) return;

      const presenceRes = await fetch('/api/operator/presence', { cache: 'no-store' });
      if (!presenceRes.ok) return;
      const presenceData = await presenceRes.json();
      setPresence(getPresenceFromApiResponse(presenceData));
    } finally {
      setLoopFeedbackSaving(null);
    }
  };

  const applyAttentionControl = async (args: {
    action: 'pin' | 'snooze' | 'take_action' | 'clear_pin';
    symbol?: string;
    ttlMinutes?: number;
    actionKey?: 'create_alert' | 'prepare_plan' | 'wait' | 'reduce_risk' | 'journal';
    reason?: string;
  }) => {
    const res = await fetch('/api/operator/attention', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...args,
        workflowId,
        decisionPacketId: loopDecisionPacketId,
      }),
    });
    return res.ok;
  };

  const executeProposal = async (proposal: OperatorProposal) => {
    if (!proposal?.id) return;

    if (proposal.action.type === 'create_alert' && riskGovernorDebug && !riskGovernorDebug.decisions.autoAlert.allowed) {
      setProposalFeedback(riskGovernorDebug.decisions.autoAlert.reason || 'Risk governor blocked this auto-alert draft.');
      return;
    }

    setProposalBusyId(proposal.id);
    setProposalFeedback(null);
    try {
      const idempotencyKey = `operator_${proposal.id}_${proposal.cooldown.key}`.slice(0, 160);
      const response = await fetch('/api/actions/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          proposalId: proposal.id,
          source: 'operator_dashboard',
          action: {
            type: proposal.action.type,
            mode: 'draft',
            payload: {
              ...proposal.action.payload,
              packetId: proposal.packetId,
              symbol: proposal.symbol,
              assetClass: proposal.assetClass,
            },
          },
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setProposalFeedback(data?.error || 'Failed to execute proposal action.');
        return;
      }

      await applyAttentionControl({
        action: 'take_action',
        symbol: proposal.symbol || undefined,
        actionKey: proposal.action.type === 'create_plan_draft' ? 'prepare_plan' : proposal.action.type === 'create_journal_draft' ? 'journal' : 'create_alert',
        reason: `Proposal executed: ${proposal.id}`,
      });

      setDismissedProposalIds((prev) => ({ ...prev, [proposal.id]: true }));
      setProposalFeedback(`Draft created for ${proposal.symbol || 'focus symbol'} (${proposal.action.type.replaceAll('_', ' ')})`);
      await Promise.all([refreshProposals(), refreshWorkflowToday(), refreshPresenceHeartbeat()]);
    } finally {
      setProposalBusyId(null);
    }
  };

  const dismissProposal = async (proposal: OperatorProposal) => {
    if (!proposal?.id) return;
    setProposalBusyId(proposal.id);
    try {
      await applyAttentionControl({
        action: 'take_action',
        symbol: proposal.symbol || undefined,
        actionKey: 'wait',
        reason: `Proposal dismissed: ${proposal.id}`,
      });
      setDismissedProposalIds((prev) => ({ ...prev, [proposal.id]: true }));
      setProposalFeedback(`Dismissed proposal for ${proposal.symbol || 'focus symbol'}`);
    } finally {
      setProposalBusyId(null);
    }
  };

  const handleFocusAction = async (action: 'create_alert' | 'prepare_plan' | 'snooze' | 'pin') => {
    const primary = presence?.neuralAttention?.focus?.primary || focusSignal?.symbol || null;
    if (!primary) return;

    setFocusActionSaving(action);
    try {
      if (action === 'create_alert') {
        await applyAttentionControl({ action: 'take_action', symbol: primary, actionKey: 'create_alert', reason: 'Focus strip action: create alert' });
        const createRes = await fetch('/api/alerts/create-from-focus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: primary, decisionPacketId: loopDecisionPacketId }),
        });
        const createData = createRes.ok ? await createRes.json() : null;
        emitWorkflowEvents([
          createWorkflowEvent({
            eventType: 'operator.context.updated',
            workflowId,
            route: '/operator',
            module: 'neural_attention',
            entity: { entity_type: 'operator_context', entity_id: `focus_action_${Date.now()}`, symbol: primary, asset_class: 'mixed' },
            payload: {
              source: 'neural_attention',
              event_name: 'attention.action.taken',
              action_key: 'create_alert',
              symbol: primary,
            },
          }),
        ]);
        setHeartbeatDrift(createData?.alertId ? `Alert created for ${primary} (${createData.alertId})` : `Alert action triggered for ${primary}`);
        window.location.href = `/tools/alerts?symbol=${encodeURIComponent(primary)}&from=operator&source=focus_strip${createData?.alertId ? `&alertId=${encodeURIComponent(createData.alertId)}` : ''}`;
        return;
      }

      if (action === 'prepare_plan') {
        await applyAttentionControl({ action: 'take_action', symbol: primary, actionKey: 'prepare_plan', reason: 'Focus strip action: draft plan' });
        const draftRes = await fetch('/api/plans/draft-from-focus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: primary, decisionPacketId: loopDecisionPacketId }),
        });
        const draftData = draftRes.ok ? await draftRes.json() : null;
        emitWorkflowEvents([
          createWorkflowEvent({
            eventType: 'operator.context.updated',
            workflowId,
            route: '/operator',
            module: 'neural_attention',
            entity: { entity_type: 'operator_context', entity_id: `focus_action_${Date.now()}`, symbol: primary, asset_class: 'mixed' },
            payload: {
              source: 'neural_attention',
              event_name: 'attention.action.taken',
              action_key: 'prepare_plan',
              symbol: primary,
            },
          }),
        ]);
        setHeartbeatDrift(draftData?.planId ? `Draft plan created for ${primary} (${draftData.planId})` : `Draft plan action triggered for ${primary}`);
        window.location.href = `/tools/backtest?symbol=${encodeURIComponent(primary)}&from=operator&source=focus_strip${draftData?.planId ? `&planId=${encodeURIComponent(draftData.planId)}` : ''}`;
        return;
      }

      if (action === 'snooze') {
        await fetch('/api/operator/focus/snooze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: primary, ttlMinutes: 20, reason: 'Focus strip action: snooze 20m' }),
        });
      }

      if (action === 'pin') {
        await fetch('/api/operator/focus/pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: primary,
            ttlMinutes: 60,
          }),
        });
      }

      await refreshPresenceHeartbeat();
    } finally {
      setFocusActionSaving(null);
    }
  };

  const loopDecisionPacketId = presence?.consciousnessLoop?.decide?.decisionPacket?.id || null;
  const loopDecisionPacketRiskScore = presence?.consciousnessLoop?.decide?.decisionPacket?.riskScore;

  useEffect(() => {
    void refreshProposals();
  }, []);

  useEffect(() => {
    if (!loopDecisionPacketId) {
      setDecisionPacketTrace(null);
      setDecisionPacketTraceLoading(false);
      return;
    }

    let mounted = true;
    const loadTrace = async () => {
      setDecisionPacketTraceLoading(true);
      try {
        const res = await fetch(`/api/workflow/decision-packet?id=${encodeURIComponent(loopDecisionPacketId)}`, { cache: 'no-store' });
        if (!res.ok) {
          if (mounted) setDecisionPacketTrace(null);
          return;
        }

        const data = (await res.json()) as DecisionPacketTraceResponse;
        if (mounted) setDecisionPacketTrace(data);
      } catch {
        if (mounted) setDecisionPacketTrace(null);
      } finally {
        if (mounted) setDecisionPacketTraceLoading(false);
      }
    };

    void loadTrace();

    return () => {
      mounted = false;
    };
  }, [loopDecisionPacketId]);

  useEffect(() => {
    void refreshRiskGovernor(
      typeof loopDecisionPacketRiskScore === 'number' ? loopDecisionPacketRiskScore : undefined
    );
  }, [loopDecisionPacketRiskScore]);

  const operatorBrainState = canUseBrain ? presence?.adaptiveInputs?.operatorBrain?.state : undefined;

  useEffect(() => {
    const cadenceMs = heartbeatIntervalForBrainState(operatorBrainState);

    const id = window.setInterval(() => {
      void refreshPresenceHeartbeat();
    }, cadenceMs);

    return () => window.clearInterval(id);
  }, [operatorBrainState]);

  const focusSignal = opportunities[0] || null;

  const totalExposure = useMemo(() => {
    return positions.reduce((sum, pos) => sum + Math.abs(Number(pos.quantity) * Number(pos.currentPrice)), 0);
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

  const activeSymbols = useMemo(() => new Set(positions.map((p) => (p.symbol || '').toUpperCase())), [positions]);
  const currentStage = focusSignal
    ? classifyPhase(focusSignal.score || 0, activeSymbols.has((focusSignal.symbol || '').toUpperCase()))
    : 'Detected';

  const edgeScore = focusSignal && Number.isFinite(focusSignal.score) && focusSignal.score > 0
    ? Math.max(1, Math.min(99, Math.round(focusSignal.score)))
    : 0;
  const bias = focusSignal?.direction || 'neutral';
  const quality = !focusSignal ? 'Awaiting' : edgeScore >= 74 ? 'High' : edgeScore >= 60 ? 'Medium' : 'Low';

  const currentPrice = Number(focusSignal?.price) || 0;
  const atr = currentPrice > 0 ? (Number(focusSignal?.indicators?.atr) || (currentPrice * 0.02)) : 0;

  const bullish = bias === 'bullish';
  const entryLow = bullish ? currentPrice - atr * 0.4 : currentPrice;
  const entryHigh = bullish ? currentPrice : currentPrice + atr * 0.4;
  const stop = bullish ? currentPrice - atr * 1.2 : currentPrice + atr * 1.2;
  const targetOne = bullish ? currentPrice + atr * 1.6 : currentPrice - atr * 1.6;
  const targetTwo = bullish ? currentPrice + atr * 2.5 : currentPrice - atr * 2.5;

  const regimeADX = focusSignal?.indicators?.adx != null && Number.isFinite(Number(focusSignal.indicators.adx)) ? Number(focusSignal.indicators.adx) : 0;
  const rsi = focusSignal?.indicators?.rsi != null && Number.isFinite(Number(focusSignal.indicators.rsi)) ? Number(focusSignal.indicators.rsi) : 0;
  const atrRatio = currentPrice > 0 && atr > 0 ? (atr / currentPrice) * 100 : 0;

  const regimeLayer = layerToneLabel(regimeADX >= 25 ? 75 : 62);
  const liquidityLayer = layerToneLabel(100 - Math.min(exposurePct, 100), 45);
  const volatilityLayer = atrRatio === 0 ? { tone: 'building' as Tone, label: 'Awaiting' } : atrRatio <= 2.5 ? { tone: 'aligned' as Tone, label: 'Aligned' } : atrRatio <= 4 ? { tone: 'building' as Tone, label: 'Building' } : { tone: 'conflict' as Tone, label: 'Conflict' };
  const timingLayer = layerToneLabel(edgeScore, 56);
  const momentumLayer = (() => {
    if (rsi === 0) return { tone: 'building' as Tone, label: 'Awaiting' };
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

  const adaptiveScore = Math.round(adaptive?.match?.adaptiveScore ?? 0);
  const personalityMatch = Math.round(adaptive?.match?.personalityMatch ?? 0);
  const riskDNA = adaptive?.profile?.riskDNA || 'awaiting';
  const timingDNA = adaptive?.profile?.decisionTiming?.replace('_', ' ') || 'awaiting';

  const pipeline: PipelineStage[] = ['Detected', 'Qualified', 'Validated', 'Ready', 'Active', 'Closed'];
  const workflowId = useMemo(() => {
    const dateKey = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `wf_operator_${dateKey}`;
  }, []);

  const operatorScore = useMemo(() => {
    // No real signal data → return 0 instead of phantom score
    if (edgeScore === 0 && adaptiveScore === 0) return 0;
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

  const presenceActionRoutes = useMemo(() => {
    return {
      create_alert: connectedRoutes.alerts,
      prepare_trade_plan: connectedRoutes.backtest,
      run_backtest: connectedRoutes.backtest,
      review_top_attention: connectedRoutes.scanner,
      scan_market: connectedRoutes.scanner,
    } as Record<string, string>;
  }, [connectedRoutes]);

  const experienceMode = presence?.experienceMode;
  const modeDirectives = experienceMode?.directives;
  const reduceAlerts = modeDirectives?.reduceAlerts ?? false;
  const showScannerDirective = modeDirectives?.showScanner ?? true;
  const highlightLearning = modeDirectives?.highlightLearning ?? false;
  const emphasizeRisk = modeDirectives?.emphasizeRisk ?? false;
  const minimalSurface = modeDirectives?.minimalSurface ?? false;
  const matrixPriorityWidgets = useMemo(
    () => {
      const base = presence?.controlMatrix?.output.priorityWidgets || presence?.experienceMode?.priorityWidgets || [];
      const promote = presence?.neuralAttention?.uiDirectives?.promoteWidgets || [];
      const seen = new Set<string>();
      const merged = [...promote, ...base].filter((item) => {
        if (seen.has(item)) return false;
        seen.add(item);
        return true;
      });
      return merged;
    },
    [presence?.controlMatrix?.output.priorityWidgets, presence?.experienceMode?.priorityWidgets, presence?.neuralAttention?.uiDirectives?.promoteWidgets]
  );
  const matrixHiddenWidgets = useMemo(
    () => {
      const base = presence?.controlMatrix?.output.hiddenWidgets || presence?.experienceMode?.hiddenWidgets || [];
      const demote = presence?.neuralAttention?.uiDirectives?.demoteWidgets || [];
      const seen = new Set<string>();
      const merged = [...base, ...demote].filter((item) => {
        if (seen.has(item)) return false;
        seen.add(item);
        return true;
      });
      return merged;
    },
    [presence?.controlMatrix?.output.hiddenWidgets, presence?.experienceMode?.hiddenWidgets, presence?.neuralAttention?.uiDirectives?.demoteWidgets]
  );
  const priorityIndexByWidget = useMemo(() => {
    const map = new Map<string, number>();
    matrixPriorityWidgets.forEach((widget, index) => {
      map.set(widget, index);
    });
    return map;
  }, [matrixPriorityWidgets]);
  const hiddenWidgets = useMemo(() => new Set(matrixHiddenWidgets), [matrixHiddenWidgets]);
  const priorityWidgets = useMemo(() => new Set(matrixPriorityWidgets), [matrixPriorityWidgets]);
  const isHidden = (key: string) => hiddenWidgets.has(key);
  const isPriority = (key: string) => priorityWidgets.has(key);
  const widgetRank = (key: string) => priorityIndexByWidget.get(key) ?? 999;

  const leftPanelOrder = useMemo(() => {
    return ['signal_flow', 'signal_pipeline'].sort((a, b) => widgetRank(a) - widgetRank(b));
  }, [priorityIndexByWidget]);

  const rightPanelOrder = useMemo(() => {
    return ['risk_command', 'live_alerts'].sort((a, b) => widgetRank(a) - widgetRank(b));
  }, [priorityIndexByWidget]);

  const showScanner = showScannerDirective && !isHidden('signal_flow') && !isHidden('broad_scanner');
  const showRiskCommand = !isHidden('risk_command');
  const showLiveAlerts = !isHidden('live_alerts');
  const showWorkflowToday = !isHidden('workflow_today');
  const showLearningLoop = canUseBrain && !minimalSurface && !isHidden('learning_loop');
  const showAggressiveActions = !isHidden('aggressive_actions') && (modeDirectives?.quickActions ?? true);
  const showLearningFirst = showLearningLoop && showWorkflowToday && widgetRank('learning_loop') < widgetRank('workflow_today');
  const showPresenceFirst = widgetRank('operator_presence') <= widgetRank('operator_kpis');

  const alertsView = reduceAlerts ? alerts.slice(0, 1) : alerts;
  const symbolModeBySymbol = useMemo(() => {
    const map = new Map<string, NonNullable<OperatorPresenceSummary['symbolExperienceModes']>[number]>();
    for (const item of presence?.symbolExperienceModes || []) {
      if (item.symbol) map.set(item.symbol.toUpperCase(), item);
    }
    return map;
  }, [presence?.symbolExperienceModes]);

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
        { category: 'volatility', name: 'atr_ratio', value: Number(Number(atrRatio).toFixed(2)), weight: 0.12, note: 'Risk expansion proxy' },
        { category: 'risk', name: 'drawdown_state', value: drawdownState, weight: 0.1, note: 'Portfolio stress state' },
      ],
      levels: {
        trigger: Number(Number(entryHigh).toFixed(2)),
        key_support: Number(Number(stop).toFixed(2)),
        key_resistance: Number(Number(targetOne).toFixed(2)),
      },
      evidence: {
        inputs: {
          stage: currentStage,
          adx: Number(Number(regimeADX).toFixed(2)),
          rsi: Number(Number(rsi).toFixed(2)),
          exposure_pct: Number(Number(exposurePct).toFixed(2)),
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
      mood: { label: bias, score: Number((Number(operatorScore) / 100).toFixed(2)) },
      regime: {
        volatility: { label: volatilityLayer.label.toLowerCase(), score: Number((Number(atrRatio) / 5).toFixed(2)) },
        trend: { label: regimeLayer.label.toLowerCase(), score: Number((Number(regimeADX) / 40).toFixed(2)) },
        liquidity: { label: liquidityLayer.label.toLowerCase(), score: Number((Math.max(1, 100 - Number(exposurePct)) / 100).toFixed(2)) },
      },
      derivatives: {
        crypto_bias: { label: bias, score: Number((Number(operatorScore) / 100).toFixed(2)) },
      },
      risk_dna: {
        profile: riskDNA,
        per_trade_risk_pct: 0.25,
      },
      adaptive_confidence: Number((Number(adaptiveScore) / 100).toFixed(2)),
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

  const workflowTodaySection = showWorkflowToday ? (
    <section className={`mb-4 rounded-xl bg-slate-800/40 p-3 ${isPriority('workflow_today') ? 'border border-cyan-500/40' : 'border border-slate-700'}`}>
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Today's Workflow</div>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
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
        <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs">
          <div className="text-slate-400 uppercase tracking-wide">Coach Tasks</div>
          <div className="font-bold text-pink-300">{workflowToday?.coachTasks ?? 0}</div>
        </div>
        <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs">
          <div className="text-slate-400 uppercase tracking-wide">Accepted</div>
          <div className="font-bold text-emerald-300">{workflowToday?.coachTasksAccepted ?? 0}</div>
        </div>
        <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs">
          <div className="text-slate-400 uppercase tracking-wide">Rejected</div>
          <div className="font-bold text-rose-300">{workflowToday?.coachTasksRejected ?? 0}</div>
        </div>
        <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs">
          <div className="text-slate-400 uppercase tracking-wide">Coach→Journal</div>
          <div className="font-bold text-fuchsia-300">{workflowToday?.coachJournalEnrichments ?? 0}</div>
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
      <div className="mt-3 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs">
        <div className="text-cyan-200 uppercase tracking-wide">Loop Conversion Rates</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded border border-cyan-500/20 bg-slate-900/50 px-2 py-1">
            Signal→Candidate: <span className="font-bold text-cyan-200">{formatNumber(workflowToday?.conversions?.signalToCandidatePct ?? 0)}%</span>
          </div>
          <div className="rounded border border-cyan-500/20 bg-slate-900/50 px-2 py-1">
            Candidate→Plan: <span className="font-bold text-cyan-200">{formatNumber(workflowToday?.conversions?.candidateToPlanPct ?? 0)}%</span>
          </div>
          <div className="rounded border border-cyan-500/20 bg-slate-900/50 px-2 py-1">
            Plan→Execution: <span className="font-bold text-cyan-200">{formatNumber(workflowToday?.conversions?.planToExecutionPct ?? 0)}%</span>
          </div>
          <div className="rounded border border-cyan-500/20 bg-slate-900/50 px-2 py-1">
            Execution→Closed: <span className="font-bold text-cyan-200">{formatNumber(workflowToday?.conversions?.executionToClosedPct ?? 0)}%</span>
          </div>
          <div className="rounded border border-cyan-500/20 bg-slate-900/50 px-2 py-1">
            Closed→Coach: <span className="font-bold text-cyan-200">{formatNumber(workflowToday?.conversions?.closedToCoachPct ?? 0)}%</span>
          </div>
          <div className="rounded border border-cyan-500/20 bg-slate-900/50 px-2 py-1">
            Task Accept: <span className="font-bold text-cyan-200">{formatNumber(workflowToday?.conversions?.taskAcceptPct ?? 0)}%</span>
          </div>
        </div>
      </div>
      <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
        <div className="flex items-center justify-between text-amber-200 uppercase tracking-wide">
          <span>Risk Governor</span>
          <button
            type="button"
            onClick={() => void refreshRiskGovernor(typeof loopDecisionPacketRiskScore === 'number' ? loopDecisionPacketRiskScore : undefined)}
            disabled={riskGovernorRefreshing}
            className="rounded border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100 disabled:opacity-60"
          >
            {riskGovernorRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="rounded border border-amber-500/20 bg-slate-900/50 px-2 py-1">
            Auto Alert: <span className={`font-bold ${riskGovernorDebug?.decisions.autoAlert.allowed ? 'text-emerald-200' : 'text-rose-200'}`}>{riskGovernorDebug?.decisions.autoAlert.allowed ? 'Allowed' : 'Blocked'}</span>
          </div>
          <div className="rounded border border-amber-500/20 bg-slate-900/50 px-2 py-1">
            System Execution: <span className={`font-bold ${riskGovernorDebug?.decisions.systemExecution.allowed ? 'text-emerald-200' : 'text-rose-200'}`}>{riskGovernorDebug?.decisions.systemExecution.allowed ? 'Allowed' : 'Blocked'}</span>
          </div>
        </div>
        <div className="mt-2 text-amber-100/90">
          Reason: {riskGovernorDebug?.decisions.autoAlert.reason || riskGovernorDebug?.decisions.systemExecution.reason || 'No active policy block.'}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-[11px]">
          <div className="rounded border border-slate-700 bg-slate-900/50 px-2 py-1">
            Risk Env: <span className="font-semibold text-amber-100">{riskGovernorDebug?.snapshot.riskEnvironment || 'n/a'}</span>
          </div>
          <div className="rounded border border-slate-700 bg-slate-900/50 px-2 py-1">
            Cognitive Load: <span className="font-semibold text-amber-100">{formatNumber(riskGovernorDebug?.snapshot.cognitiveLoad ?? 0)}</span>
          </div>
          <div className="rounded border border-slate-700 bg-slate-900/50 px-2 py-1">
            Auto Alerts 1h: <span className="font-semibold text-amber-100">{riskGovernorDebug?.snapshot.autoAlertsLastHour ?? 0}/{riskGovernorDebug?.thresholds.maxAutoAlertsPerHour ?? 0}</span>
          </div>
          <div className="rounded border border-slate-700 bg-slate-900/50 px-2 py-1">
            Execution Opt-In: <span className="font-semibold text-amber-100">{riskGovernorDebug?.snapshot.executionAutomationOptIn ? 'Enabled' : 'Disabled'}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 rounded-md border border-pink-500/30 bg-pink-500/10 px-3 py-2 text-xs">
        <div className="text-pink-200 uppercase tracking-wide">Coach Action Queue</div>
        {coachTasksQueue.length === 0 ? (
          <div className="mt-1 text-pink-200/90">No pending coach tasks.</div>
        ) : (
          <div className="mt-2 space-y-2">
            {coachTasksQueue.map((task) => (
              <div key={task.taskId} className="rounded border border-pink-500/20 bg-slate-900/50 px-2 py-2">
                <div className="font-semibold text-pink-100">{task.action.replaceAll('_', ' ')}</div>
                <div className="mt-1 text-pink-200/90">{task.detail || 'No detail provided.'}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-300">
                    {task.priority}
                  </span>
                  {task.symbol ? (
                    <span className="rounded border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-300">
                      {task.symbol}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    disabled={updatingTaskId === task.taskId}
                    onClick={() => handleTaskDecision(task.taskId, 'accepted')}
                    className="rounded border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-200 disabled:opacity-60"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={updatingTaskId === task.taskId}
                    onClick={() => handleTaskDecision(task.taskId, 'rejected')}
                    className="rounded border border-red-500/40 bg-red-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-200 disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  ) : null;

  const learningLoopSection = showLearningLoop ? (
    <section className={`mt-4 rounded-xl p-4 ${highlightLearning || isPriority('learning_loop') ? 'border border-blue-500/40 bg-blue-500/10' : 'border border-slate-700 bg-slate-800/40'}`}>
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
  ) : null;

  const operatorKpisSection = (
    <div className={`mb-4 grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 ${isPriority('operator_kpis') ? 'rounded-xl border border-cyan-500/40 p-2' : ''}`}>
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs">
        <div className="text-emerald-300 uppercase tracking-wide">Operator Mode</div>
        <div className="font-bold">{operatorMode}</div>
      </div>
      <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs">
        <div className="text-cyan-300 uppercase tracking-wide">Experience Mode</div>
        <div className="font-bold text-cyan-100">{experienceMode?.label || 'Focus Mode'}</div>
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
        <div className="text-slate-400 uppercase tracking-wide">Adaptive Match</div>
        <div className="font-bold text-emerald-300">{adaptiveScore > 0 ? (adaptiveScore >= 75 ? 'HIGH' : adaptiveScore >= 55 ? 'MODERATE' : 'LOW') : '—'}</div>
      </div>
      <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs">
        <div className="text-indigo-300 uppercase tracking-wide">Setup Score</div>
        <div className="font-bold text-indigo-200">{focusSignal || adaptiveScore > 0 ? (operatorScore >= 75 ? 'HIGH' : operatorScore >= 55 ? 'MODERATE' : 'LOW') : '—'}</div>
      </div>
    </div>
  );

  const deploymentBlocked = riskGovernorDebug?.decisions.systemExecution.allowed === false;
  const deploymentBlockReason = riskGovernorDebug?.decisions.systemExecution.reason || riskGovernorDebug?.decisions.autoAlert.reason || 'Risk governor blocked deployment.';

  const longExposureValue = useMemo(
    () => positions.filter((p) => p.side === 'LONG').reduce((sum, p) => sum + Math.abs(p.quantity * p.currentPrice), 0),
    [positions]
  );
  const shortExposureValue = useMemo(
    () => positions.filter((p) => p.side === 'SHORT').reduce((sum, p) => sum + Math.abs(p.quantity * p.currentPrice), 0),
    [positions]
  );
  const netExposurePct = portfolioValue > 0 ? ((longExposureValue - shortExposureValue) / portfolioValue) * 100 : 0;
  const clusterExposurePct = concentrationPct;
  const largestPosition = useMemo(() => {
    if (!positions.length) return null;
    return positions
      .map((p) => ({ symbol: p.symbol, notional: Math.abs(p.quantity * p.currentPrice) }))
      .sort((a, b) => b.notional - a.notional)[0];
  }, [positions]);

  const breadthLabel = useMemo(() => {
    const bullishCount = opportunities.filter((p) => p.direction === 'bullish').length;
    const bearishCount = opportunities.filter((p) => p.direction === 'bearish').length;
    if (bullishCount > bearishCount) return 'SUPPORTIVE';
    if (bearishCount > bullishCount) return 'DEFENSIVE';
    return 'BALANCED';
  }, [opportunities]);

  const volatilityLabel = atrRatio >= 4 ? 'HIGH' : atrRatio >= 2.6 ? 'ELEVATED' : 'CONTROLLED';
  const strategyModeLabel = regimeADX >= 25 ? 'BREAKOUT / TREND_PULLBACK' : 'RANGE / MEAN_REVERSION';

  const toPermissionLabel = (permission: Permission): string => {
    if (permission === 'ALLOW') return 'COMPLIANT';
    if (permission === 'ALLOW_REDUCED') return 'REDUCED';
    if (permission === 'ALLOW_TIGHTENED') return 'TIGHT';
    return 'BLOCKED';
  };

  const permissionTone = (permission: Permission) => {
    if (permission === 'ALLOW') return 'text-[var(--msp-bull)]';
    if (permission === 'ALLOW_REDUCED') return 'text-[var(--msp-warn)]';
    if (permission === 'ALLOW_TIGHTENED') return 'text-[var(--msp-tight)]';
    return 'text-[var(--msp-bear)]';
  };

  const complianceRows = permissionSnapshot
    ? [
        { strategy: 'Breakout', long: permissionSnapshot.matrix.BREAKOUT_CONTINUATION.LONG, short: permissionSnapshot.matrix.BREAKOUT_CONTINUATION.SHORT },
        { strategy: 'Pullback', long: permissionSnapshot.matrix.TREND_PULLBACK.LONG, short: permissionSnapshot.matrix.TREND_PULLBACK.SHORT },
        { strategy: 'Mean Rev', long: permissionSnapshot.matrix.MEAN_REVERSION.LONG, short: permissionSnapshot.matrix.MEAN_REVERSION.SHORT },
        { strategy: 'Range Fade', long: permissionSnapshot.matrix.RANGE_FADE.LONG, short: permissionSnapshot.matrix.RANGE_FADE.SHORT },
      ]
    : [];

  const riskEvents = [
    presence?.lastPresenceTs ? `${new Date(presence.lastPresenceTs).toLocaleTimeString()} — Presence heartbeat updated` : null,
    riskGovernorDebug?.decisions.autoAlert.reason && riskGovernorDebug?.snapshot.stateUpdatedAt
      ? `${new Date(riskGovernorDebug.snapshot.stateUpdatedAt).toLocaleTimeString()} — ${riskGovernorDebug.decisions.autoAlert.reason}`
      : riskGovernorDebug?.decisions.autoAlert.reason
      ? `${riskGovernorDebug.decisions.autoAlert.reason}`
      : null,
    riskGovernorDebug?.snapshot.riskEnvironment
      ? `Risk environment: ${riskGovernorDebug.snapshot.riskEnvironment}`
      : null,
    ...(presence?.systemHealth?.reasons?.map((reason) => reason) || []),
  ].filter(Boolean) as string[];

  const riskPerTradeFraction = permissionSnapshot?.caps.risk_per_trade ?? 0.005;
  const normalizedRiskFraction = 0.01;
  const formatRiskPairFromR = (valueR: number) => (
    <>
      <span className="metric-r">{formatR(valueR)}</span>
      <span className="metric-dollar">({formatDollar(rToDollar(valueR, portfolioValue || 100000, riskPerTradeFraction))})</span>
    </>
  );
  const formatRiskPairFromAmount = (amount: number) => (
    <>
      <span className="metric-r">{formatR(amountToR(amount, portfolioValue || 100000, riskPerTradeFraction))}</span>
      <span className="metric-dollar">({Number.isFinite(amount) ? (amount >= 0 ? '+' : '-') : ''}{formatDollar(amount)})</span>
    </>
  );

  const overlayTrades = closedTrades.map((entry, index) => {
    const amount = Number(entry.pl || 0);
    const persistedNormalized = Number(entry.normalizedR);
    const persistedDynamic = Number(entry.dynamicR);
    const entryEquity = Number(entry.equityAtEntry);
    const entryRiskPerTrade = Number(entry.riskPerTradeAtEntry);
    const normalizedR = Number.isFinite(persistedNormalized)
      ? persistedNormalized
      : amountToR(amount, Number.isFinite(entryEquity) && entryEquity > 0 ? entryEquity : (portfolioValue || 100000), normalizedRiskFraction);
    const dynamicR = Number.isFinite(persistedDynamic)
      ? persistedDynamic
      : amountToR(
          amount,
          Number.isFinite(entryEquity) && entryEquity > 0 ? entryEquity : (portfolioValue || 100000),
          Number.isFinite(entryRiskPerTrade) && entryRiskPerTrade > 0 ? entryRiskPerTrade : riskPerTradeFraction
        );
    const multiplier = Number.isFinite(normalizedR) && normalizedR !== 0 && Number.isFinite(dynamicR) ? dynamicR / normalizedR : 1;
    const throttleReason: 'regime' | 'vol' | 'event' | 'none' = multiplier < 0.95
      ? volatilityLabel === 'HIGH'
        ? 'vol'
        : (riskGovernorDebug?.snapshot.riskEnvironment || '').toLowerCase().includes('event')
        ? 'event'
        : 'regime'
      : 'none';

    return {
      id: `closed_${index}`,
      date: new Date().toISOString(),
      strategy: 'operator_flow',
      regime: regimeADX >= 25 ? 'TREND' : 'RANGE',
      normalizedR,
      dynamicR,
      multiplier,
      throttleReason,
    };
  });

  const overlayOpenTrades = positions.slice(0, 10).map((position, index) => {
    const stop = position.side === 'LONG' ? position.currentPrice * 0.98 : position.currentPrice * 1.02;
    const riskPerUnit = Math.max(0.01, Math.abs(position.currentPrice - stop));
    const entryPrice = Number.isFinite(Number(position.entryPrice)) ? Number(position.entryPrice) : position.currentPrice;
    const unrealizedPerUnit = position.side === 'LONG' ? (position.currentPrice - entryPrice) : (entryPrice - position.currentPrice);
    const currentR = unrealizedPerUnit / riskPerUnit;

    return {
      id: `open_${position.symbol}_${index}`,
      currentR,
      stopR: -1,
      targetR: 2,
    };
  });

  return (
    <RegimeProvider>
    <RiskPermissionProvider>
    <div className="min-h-screen bg-[var(--msp-bg)] text-[var(--msp-text)]">
      {loadError && (
        <div className="mx-4 mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          ⚠️ {loadError}
          <button onClick={() => setLoadError(null)} className="ml-3 text-amber-400 hover:text-white">Dismiss</button>
        </div>
      )}
      <ToolsNavBar />
      <div className="sticky top-0 z-40 border-b border-[var(--msp-border)] bg-[var(--msp-bg)] px-4 py-2 overflow-hidden">
        <div className={deploymentBlocked ? 'border-t-2 border-[var(--msp-bear)] pt-2' : ''}>
          <CapitalControlStrip />
        </div>
      </div>

      <ToolPageLayout
        identity={
          <div className="msp-elite-panel">
            <div className="mb-2 flex items-center justify-between">
              <div />
              <button
                onClick={() => setFocusMode((prev) => !prev)}
                className={`rounded-md border px-3 py-1 text-[0.66rem] font-extrabold uppercase tracking-[0.08em] transition-all ${focusMode ? 'border-[var(--msp-accent)] bg-[var(--msp-accent)]/10 text-[var(--msp-accent)]' : 'border-[var(--msp-border)] bg-[var(--msp-panel-2)] text-[var(--msp-text-muted)]'}`}
              >
                {focusMode ? '← Full View' : 'Focus Mode'}
              </button>
            </div>
            {focusMode ? (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
                <div className="rounded-lg border border-[var(--msp-border-strong)] bg-[var(--msp-panel-2)] px-3 py-2.5">
                  <div className="text-[0.64rem] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">R Budget</div>
                  <div className="mt-1 text-[1.05rem] font-black text-[var(--msp-text)]">{permissionSnapshot ? `${Number(permissionSnapshot.session.remaining_daily_R ?? 0).toFixed(1)}R` : '—'}<span className="ml-1 text-[0.7rem] font-semibold text-[var(--msp-text-faint)]">/ {permissionSnapshot ? `${Number(permissionSnapshot.session.max_daily_R ?? 0)}R` : '—'}</span></div>
                </div>
                <div className="rounded-lg border border-[var(--msp-border-strong)] bg-[var(--msp-panel-2)] px-3 py-2.5">
                  <div className="text-[0.64rem] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Regime</div>
                  <div className="mt-1 text-[1.05rem] font-black text-[var(--msp-text)]">{!focusSignal && !presence ? 'AWAITING' : regimeADX >= 25 ? 'TRENDING' : 'RANGE'}</div>
                </div>
                <div className="rounded-lg border border-[var(--msp-border-strong)] bg-[var(--msp-panel-2)] px-3 py-2.5">
                  <div className="text-[0.64rem] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Bias</div>
                  <div className={`mt-1 text-[1.05rem] font-black ${bias === 'bullish' ? 'text-[var(--msp-bull)]' : bias === 'bearish' ? 'text-[var(--msp-bear)]' : 'text-[var(--msp-text-muted)]'}`}>{bias === 'neutral' && !focusSignal ? 'AWAITING' : bias.toUpperCase()}</div>
                </div>
                <div className="rounded-lg border border-[var(--msp-border-strong)] bg-[var(--msp-panel-2)] px-3 py-2.5">
                  <div className="text-[0.64rem] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Exposure</div>
                  <div className="mt-1 text-[1.05rem] font-black text-[var(--msp-text)]">{portfolioValue > 0 ? `${((Number(totalExposure) / Number(portfolioValue)) * 100).toFixed(0)}%` : '0%'}</div>
                </div>
                <div className="rounded-lg border border-[var(--msp-border-strong)] bg-[var(--msp-panel-2)] px-3 py-2.5">
                  <div className="text-[0.64rem] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Risk State</div>
                  <div className={`mt-1 text-[1.05rem] font-black ${deploymentBlocked ? 'text-[var(--msp-bear)]' : 'text-[var(--msp-bull)]'}`}>{deploymentBlocked ? 'LOCKED' : volatilityLabel === 'HIGH' ? 'ELEVATED' : 'NORMAL'}</div>
                </div>
              </div>
            ) : (
            <div className="grid gap-4 lg:grid-cols-12">
              <div className="lg:col-span-6">
                <div className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[var(--msp-text-faint)]">Command State</div>
                <div className="mt-1 text-[1.05rem] font-bold uppercase tracking-[0.03em] text-[var(--msp-text)]">Operator Dashboard</div>
                <div className="mt-3 grid gap-2 text-[0.76rem]">
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">MARKET REGIME</span><span className="font-semibold truncate text-right">{!focusSignal && !presence ? 'AWAITING DATA' : regimeADX >= 25 ? 'TRENDING' : 'TRANSITIONAL'}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">EXECUTION BIAS</span><span className="font-semibold truncate text-right">{bias === 'neutral' && !focusSignal ? 'AWAITING SIGNAL' : `${bias.toUpperCase()} CONTINUATION`}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">STRATEGY MODE</span><span className="font-semibold truncate text-right">{!focusSignal ? 'AWAITING SCAN' : strategyModeLabel}</span></div>
                </div>
              </div>
              <div className="lg:col-span-6">
                <div className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[var(--msp-text-faint)]">Environment Diagnostics</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-[0.74rem]">
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Volatility</span><span className="font-semibold truncate">{volatilityLabel}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Breadth</span><span className="font-semibold truncate">{breadthLabel}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Liquidity</span><span className="font-semibold truncate">{liquidityLayer.label.toUpperCase()}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Gamma</span><span className="font-semibold truncate">{presence?.marketState?.volatilityState || 'NEUTRAL'}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Risk Environment</span><span className="font-semibold truncate">{riskGovernorDebug?.snapshot.riskEnvironment || presence?.riskLoad?.environment || 'MODERATE'}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Setup Quality</span><span className="font-semibold truncate">{operatorScore > 0 ? (operatorScore >= 75 ? 'HIGH' : operatorScore >= 55 ? 'MODERATE' : 'LOW') : '—'}</span></div>
                </div>
              </div>
            </div>
            )}
          </div>
        }
        primary={
          <div className="space-y-6">
            {focusMode ? (
              <div className="msp-elite-panel text-center py-8 text-[0.82rem] text-[var(--msp-text-muted)]">
                Focus Mode active — showing key metrics only.
                <button onClick={() => setFocusMode(false)} className="ml-2 underline text-[var(--msp-accent)]">Show Full Dashboard</button>
              </div>
            ) : (<>
            <section className="grid gap-4 lg:grid-cols-3">
              <div className="msp-elite-panel">
                <div className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[var(--msp-text-faint)]">Rule Compliance</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[0.72rem]">
                    <thead className="text-[var(--msp-text-faint)]">
                      <tr>
                        <th className="px-2 py-1 font-semibold">Strategy</th>
                        <th className="px-2 py-1 font-semibold">Long</th>
                        <th className="px-2 py-1 font-semibold">Short</th>
                      </tr>
                    </thead>
                    <tbody>
                      {complianceRows.map((row) => (
                        <tr key={row.strategy} className="border-t border-[var(--msp-divider)]">
                          <td className="px-2 py-1.5 text-[var(--msp-text)]">{row.strategy}</td>
                          <td className="px-2 py-1.5"><PermissionChip state={row.long} /></td>
                          <td className="px-2 py-1.5"><PermissionChip state={row.short} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 grid gap-1 text-[0.72rem] text-[var(--msp-text-muted)]">
                  <div>Loss Streak: <span className="font-semibold text-[var(--msp-text)]">{permissionSnapshot ? (permissionSnapshot.session.consecutive_losses ?? 0) : '—'}</span></div>
                  <div>Throttle Multiplier: <span className="font-semibold text-[var(--msp-text)]">{permissionSnapshot && Number.isFinite(permissionSnapshot.caps.risk_per_trade) ? formatNumber(permissionSnapshot.caps.risk_per_trade / 0.005) : '—'}</span></div>
                  <div>Effective Risk/Trade: <span className="font-semibold text-[var(--msp-text)]">{permissionSnapshot && Number.isFinite(permissionSnapshot.caps.risk_per_trade) ? `${formatNumber(permissionSnapshot.caps.risk_per_trade * 100)}%` : '—'}</span></div>
                </div>
              </div>

              <div className="msp-elite-panel">
                <div className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[var(--msp-text-faint)]">Exposure Profile</div>
                <div className="grid gap-1 text-[0.74rem] text-[var(--msp-text-muted)]">
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Total Exposure</span><span className="font-semibold text-[var(--msp-text)] truncate">{formatNumber(exposurePct)}%</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Net Long</span><span className="font-semibold text-[var(--msp-text)] truncate">{formatNumber(netExposurePct)}%</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Cluster Exposure</span><span className="font-semibold text-[var(--msp-text)] truncate">{formatNumber(clusterExposurePct)}%</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Largest Position</span><span className="font-semibold text-[var(--msp-text)] truncate">{largestPosition && portfolioValue > 0 ? `${largestPosition.symbol} ${formatNumber((largestPosition.notional / portfolioValue) * 100)}%` : '—'}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Long / Short Split</span><span className="font-semibold text-[var(--msp-text)] truncate">{totalExposure > 0 ? `${formatNumber((longExposureValue / totalExposure) * 100)} / ${formatNumber((shortExposureValue / totalExposure) * 100)}` : '— / —'}</span></div>
                </div>
              </div>

              <div className={`msp-elite-panel ${deploymentBlocked ? 'border-l-2 border-l-[var(--msp-bear)]' : ''}`}>
                <div className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[var(--msp-text-faint)]">Active Constraints</div>
                <div className="grid gap-1 text-[0.74rem] text-[var(--msp-text-muted)]">
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Max Daily Loss</span><span className="font-semibold text-[var(--msp-text)] truncate">{permissionSnapshot ? formatRiskPairFromR(permissionSnapshot.session.max_daily_R ?? 0) : '—'}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Remaining Daily Loss</span><span className="font-semibold text-[var(--msp-text)] truncate">{permissionSnapshot ? formatRiskPairFromR(permissionSnapshot.session.remaining_daily_R ?? 0) : '—'}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Max Open Risk</span><span className="font-semibold text-[var(--msp-text)] truncate">{permissionSnapshot ? formatRiskPairFromR(permissionSnapshot.session.max_open_risk_R ?? 0) : '—'}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Current Open Risk</span><span className="font-semibold text-[var(--msp-text)] truncate">{permissionSnapshot ? formatRiskPairFromR(permissionSnapshot.session.open_risk_R ?? 0) : '—'}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Vol Multiplier</span><span className="font-semibold text-[var(--msp-text)] truncate">{permissionSnapshot && Number.isFinite(permissionSnapshot.caps.risk_per_trade) ? formatNumber(permissionSnapshot.caps.risk_per_trade / 0.005) : '—'}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Event Restrictions</span><span className="font-semibold text-[var(--msp-text)] truncate">{deploymentBlocked ? 'ACTIVE' : 'NORMAL'}</span></div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-12">
              <div className="msp-elite-panel lg:col-span-8">
                <div className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[var(--msp-text-faint)]">Active Tracked Positions</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[0.72rem]">
                    <thead className="text-[var(--msp-text-faint)]">
                      <tr>
                        <th className="px-2 py-1">Symbol</th>
                        <th className="px-2 py-1">Dir</th>
                        <th className="px-2 py-1">Ref Px</th>
                        <th className="px-2 py-1">Stop Px</th>
                        <th className="px-2 py-1">Open R</th>
                        <th className="px-2 py-1">Exposure</th>
                        <th className="px-2 py-1">Compliance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.slice(0, 8).map((position) => {
                        const estimatedStop = position.side === 'LONG' ? position.currentPrice * 0.98 : position.currentPrice * 1.02;
                        const positionExposurePct = portfolioValue > 0 ? (Math.abs(position.quantity * position.currentPrice) / portfolioValue) * 100 : 0;
                        const openRiskAmount = Math.abs(position.currentPrice - estimatedStop) * Math.abs(position.quantity);
                        return (
                          <tr key={`${position.symbol}_${position.side}`} className="border-t border-[var(--msp-divider)]">
                            <td className="px-2 py-1.5 font-semibold text-[var(--msp-text)]">{position.symbol}</td>
                            <td className="px-2 py-1.5 text-[var(--msp-text-muted)]">{position.side}</td>
                            <td className="px-2 py-1.5 text-[var(--msp-text-muted)]">{formatNumber(position.currentPrice)}</td>
                            <td className="px-2 py-1.5 text-[var(--msp-text-muted)]">{formatNumber(estimatedStop)}</td>
                            <td className="px-2 py-1.5 font-semibold text-[var(--msp-text)]">{formatRiskPairFromAmount(openRiskAmount)}</td>
                            <td className="px-2 py-1.5 text-[var(--msp-text-muted)]">{formatNumber(positionExposurePct)}%</td>
                            <td className={`px-2 py-1.5 font-semibold ${deploymentBlocked ? 'text-[var(--msp-bear)]' : 'text-[var(--msp-bull)]'}`}>{deploymentBlocked ? 'RESTRICTED' : 'COMPLIANT'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="msp-elite-panel lg:col-span-4">
                <div className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[var(--msp-text-faint)]">Risk Events</div>
                <div className="space-y-2 text-[0.73rem] text-[var(--msp-text-muted)]">
                  {riskEvents.slice(0, 8).map((event, idx) => (
                    <div key={`${event}_${idx}`} className="msp-elite-row">{event}</div>
                  ))}
                  {!riskEvents.length ? <div className="msp-elite-row">No active risk events.</div> : null}
                </div>
              </div>
            </section>
          </>)}
          </div>
        }
        secondary={
          <div className="space-y-4">
            <section className="grid gap-4 lg:grid-cols-3">
              <div className="msp-elite-panel">
                <div className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[var(--msp-text-faint)]">Trade Journal Snapshot</div>
                <div className="grid gap-1 text-[0.74rem] text-[var(--msp-text-muted)]">
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Win Rate</span><span className="font-semibold text-[var(--msp-text)] truncate">{closedTrades.length ? `${formatNumber((wins / closedTrades.length) * 100)}%` : '—'}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Avg Win</span><span className="font-semibold text-[var(--msp-text)] truncate">{wins > 0 ? formatRiskPairFromAmount(avgWin) : '—'}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Avg Loss</span><span className="font-semibold text-[var(--msp-text)] truncate">{losses.length > 0 ? formatRiskPairFromAmount(-avgLoss) : '—'}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Expectancy</span><span className="font-semibold text-[var(--msp-text)] truncate">{closedTrades.length > 0 ? formatRiskPairFromAmount(avgWin - avgLoss) : '—'}</span></div>
                </div>
              </div>
              <div className="msp-elite-panel">
                <div className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[var(--msp-text-faint)]">Strategy Performance By Regime <span className="normal-case tracking-normal font-normal text-[var(--msp-warn)]">(static reference — connect to journal for live data)</span></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[0.72rem]">
                    <thead className="text-[var(--msp-text-faint)]">
                      <tr>
                        <th className="px-2 py-1">Strategy</th>
                        <th className="px-2 py-1">Trend</th>
                        <th className="px-2 py-1">Range</th>
                        <th className="px-2 py-1">Risk-Off</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['Breakout', 'Strong', 'Weak', 'Blocked'],
                        ['Pullback', 'Good', 'Neutral', 'Reduced'],
                        ['Mean Rev', 'Tight', 'Strong', 'Reduced'],
                      ].map((row) => (
                        <tr key={row[0]} className="border-t border-[var(--msp-divider)]">
                          <td className="px-2 py-1.5 text-[var(--msp-text)]">{row[0]}</td>
                          <td className="px-2 py-1.5 text-[var(--msp-text-muted)]">{row[1]}</td>
                          <td className="px-2 py-1.5 text-[var(--msp-text-muted)]">{row[2]}</td>
                          <td className="px-2 py-1.5 text-[var(--msp-text-muted)]">{row[3]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="msp-elite-panel">
                <div className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[var(--msp-text-faint)]">System Diagnostics</div>
                <div className="grid gap-1 text-[0.74rem] text-[var(--msp-text-muted)]">
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Data Freshness</span><span className="font-semibold text-[var(--msp-text)] truncate">{(() => { const age = permissionSnapshot?.data_health.age_s ?? presence?.dataFreshness?.marketDataAgeSec; return age != null ? `${age}s` : '—'; })()}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">API Status</span><span className="font-semibold text-[var(--msp-text)] truncate">{presence?.systemHealth?.status || 'OK'}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">IRG Status</span><span className="font-semibold text-[var(--msp-text)] truncate">{deploymentBlocked ? 'LOCKED' : 'ACTIVE'}</span></div>
                  <div className="msp-elite-row flex justify-between gap-2"><span className="shrink-0">Snapshot Source</span><span className="font-semibold text-[var(--msp-text)] truncate">{permissionSnapshot?.data_health.source || 'operator_presence'}</span></div>
                </div>
              </div>
            </section>

            {/* ── Session Phase & Correlation ── */}
            <section className="grid gap-4 lg:grid-cols-2">
              <SessionPhaseStrip />
              <CorrelationMatrix />
            </section>

            {/* ── Risk Manager Mode (toggle view) ── */}
            <RiskManagerMode />

            <RiskApplicationOverlay trades={overlayTrades} openTrades={overlayOpenTrades} />
          </div>
        }
        footer={
          <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-2 text-[0.68rem] text-[var(--msp-text-muted)]">
            Educational command bridge only. No broker execution or investment advice.
          </div>
        }
      />
    </div>
    </RiskPermissionProvider>
    </RegimeProvider>
  );
}
