export type ExperienceMode = 'hunt' | 'focus' | 'risk_control' | 'learning' | 'passive_scan';
export type AttentionState = 'watch' | 'candidate' | 'plan' | 'alert' | 'execute' | 'cooldown';

export interface NeuralAttention {
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
    state: AttentionState;
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
}

export interface PresenceLike {
  experienceMode: { mode: ExperienceMode; label?: string; reason?: string };
  controlMatrix?: { output?: { mode?: ExperienceMode; actionFriction?: number; alertIntensity?: number } };
  adaptiveInputs: {
    marketReality: { volatilityState: string; signalDensity: number; confluenceDensity: number; mode: string };
    operatorBrain: { state: 'FLOW' | 'FOCUSED' | 'STRESSED' | 'OVERLOADED'; fatigueScore: number; riskCapacity: 'HIGH' | 'MEDIUM' | 'LOW' };
    learningFeedback: { validatedPct: number; ignoredPct: number; wrongContextPct: number; timingIssuePct: number; penalty: number; bonus: number; total7d: number };
    cognitiveLoad: { level: 'LOW' | 'MEDIUM' | 'HIGH'; value: number; openAlerts: number; unresolvedPlans: number; simultaneousSetups: number };
  };
  riskLoad: { level?: 'LOW' | 'MEDIUM' | 'HIGH'; score?: number; exposurePct?: number };
  topAttention?: { symbol?: string | null };
  symbolExperienceModes?:
    | Record<string, { mode: ExperienceMode; confidence?: number }>
    | Array<{
        symbol: string;
        mode: ExperienceMode | { key: ExperienceMode };
        confidence?: number;
      }>;
  candidates?: Array<{
    symbol: string;
    signalScore: number;
    operatorFit?: number;
    confidence?: number;
    status?: 'candidate' | 'planned' | 'alerted' | 'executed' | 'closed';
    hasAlert?: boolean;
    hasPlan?: boolean;
    lastTouchedTs?: string;
  }>;
  attentionMemory?: {
    currentPrimary?: string | null;
    lockedUntilTs?: string | null;
    pinnedSymbol?: string | null;
    pinnedUntilTs?: string | null;
    cooldownUntil?: Record<string, number>;
    ignoredCounts7d?: Record<string, number>;
    snoozeUntilTs?: string | null;
  };
}

export interface BuildNeuralAttentionResult {
  neuralAttention: NeuralAttention;
  memory: {
    currentPrimary: string | null;
    lockedUntilTs: string | null;
    pinnedSymbol: string | null;
    pinnedUntilTs: string | null;
    cooldownUntil: Record<string, number>;
    ignoredCounts7d: Record<string, number>;
    snoozeUntilTs: string | null;
  };
  focusShift: {
    changed: boolean;
    previous: string | null;
    next: string | null;
    reason: string;
    top: Array<{ symbol: string; score: number; nextAction: string }>;
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function isoFromUnix(sec: number) {
  return new Date(sec * 1000).toISOString();
}

function nextActionFromState(args: { state: AttentionState; overloaded: boolean; hasAlert?: boolean; hasPlan?: boolean }) {
  if (args.state === 'cooldown') return 'wait' as const;
  if (args.overloaded) return 'reduce_risk' as const;
  if (!args.hasAlert) return 'create_alert' as const;
  if (!args.hasPlan) return 'prepare_plan' as const;
  if (args.state === 'execute') return 'journal' as const;
  return 'wait' as const;
}

export function buildNeuralAttention(presence: PresenceLike): BuildNeuralAttentionResult {
  const market = presence.adaptiveInputs.marketReality;
  const brain = presence.adaptiveInputs.operatorBrain;
  const learn = presence.adaptiveInputs.learningFeedback;
  const load = presence.adaptiveInputs.cognitiveLoad;

  const experienceMode = presence.controlMatrix?.output?.mode ?? presence.experienceMode.mode;

  const refreshSeconds =
    brain.state === 'OVERLOADED' ? 45
    : brain.state === 'STRESSED' ? 30
    : market.volatilityState.toLowerCase().includes('high') ? 20
    : 25;

  const learningBiasBase = clamp((learn.bonus - learn.penalty) * 20, -20, 20);
  const riskPenaltyBase = load.level === 'HIGH' ? 70 : load.level === 'MEDIUM' ? 40 : 15;
  const operatorPenalty = brain.state === 'OVERLOADED' ? 25 : brain.state === 'STRESSED' ? 12 : 0;

  const memory = presence.attentionMemory ?? {};
  const currentPrimary = memory.currentPrimary ?? null;
  const lockedUntilTs = memory.lockedUntilTs ? Date.parse(memory.lockedUntilTs) : 0;
  const lockActive = lockedUntilTs > Date.now();
  const pinnedActive = Boolean(memory.pinnedSymbol && memory.pinnedUntilTs && Date.parse(memory.pinnedUntilTs) > Date.now());
  const snoozeActive = Boolean(memory.snoozeUntilTs && Date.parse(memory.snoozeUntilTs) > Date.now());

  const cooldownUntil = { ...(memory.cooldownUntil ?? {}) };
  const ignoredCounts = { ...(memory.ignoredCounts7d ?? {}) };

  const scoreboard = (presence.candidates ?? []).map((c) => {
    const setupQuality = clamp(c.signalScore, 0, 100);
    const operatorFit = clamp(c.operatorFit ?? 50, 0, 100);
    const density = clamp((market.signalDensity + market.confluenceDensity) / 2, 0, 100);
    const volatilityBoost =
      market.volatilityState.toLowerCase().includes('high') ? 75
      : market.volatilityState.toLowerCase().includes('elevated') ? 55
      : 35;
    const urgency = clamp((0.6 * volatilityBoost) + (0.4 * density), 0, 100);

    let readiness = 40;
    if (c.hasPlan) readiness += 25;
    if (c.hasAlert) readiness += 20;
    if (c.hasAlert && !c.hasPlan) readiness -= 10;
    readiness = clamp(readiness, 0, 100);

    const symbolIgnored = ignoredCounts[c.symbol] ?? 0;
    const ignoredPenalty = clamp(symbolIgnored * 6, 0, 30);
    const riskPenalty = clamp(riskPenaltyBase + operatorPenalty + ignoredPenalty, 0, 100);
    const learningBias = clamp(learningBiasBase, -20, 20);

    const raw =
      (0.35 * setupQuality) +
      (0.2 * operatorFit) +
      (0.2 * urgency) +
      (0.15 * readiness) -
      (0.1 * riskPenalty);

    let score = clamp(raw + (learningBias * 0.35), 0, 100);

    const inCooldown = Boolean(cooldownUntil[c.symbol] && cooldownUntil[c.symbol] > nowUnix());
    if (inCooldown) score = clamp(score - 25, 0, 100);
    if (snoozeActive && currentPrimary && c.symbol !== currentPrimary) score = clamp(score - 8, 0, 100);

    const state: AttentionState = inCooldown
      ? 'cooldown'
      : c.status === 'planned'
      ? 'plan'
      : c.status === 'alerted'
      ? 'alert'
      : c.status === 'executed'
      ? 'execute'
      : c.status === 'closed'
      ? 'cooldown'
      : 'candidate';

    const nextAction = nextActionFromState({
      state,
      overloaded: brain.state === 'OVERLOADED',
      hasAlert: c.hasAlert,
      hasPlan: c.hasPlan,
    });

    return {
      symbol: c.symbol,
      score,
      components: {
        setupQuality,
        operatorFit,
        urgency,
        readiness,
        riskPenalty,
        learningBias,
      },
      state,
      nextAction,
      why: `${Math.round(setupQuality)}Q · ${Math.round(operatorFit)}Fit · ${Math.round(urgency)}Urg · ${Math.round(readiness)}Ready`,
    };
  }).sort((a, b) => b.score - a.score);

  const top = scoreboard[0];
  const hysteresisDelta = 12;
  let primary = currentPrimary;
  let nextLockIso: string | null = memory.lockedUntilTs ?? null;
  let pinned = false;

  if (pinnedActive && memory.pinnedSymbol) {
    const row = scoreboard.find((s) => s.symbol === memory.pinnedSymbol && s.state !== 'cooldown');
    if (row) {
      primary = row.symbol;
      pinned = true;
      nextLockIso = isoFromUnix(nowUnix() + 10 * 60);
    }
  } else if (!primary) {
    primary = top?.symbol ?? null;
    if (primary) nextLockIso = isoFromUnix(nowUnix() + 6 * 60);
  } else if (!lockActive) {
    const currentScore = scoreboard.find((s) => s.symbol === primary)?.score ?? 0;
    if (top && top.symbol !== primary && top.score >= currentScore + hysteresisDelta) {
      primary = top.symbol;
      nextLockIso = isoFromUnix(nowUnix() + 6 * 60);
    } else {
      nextLockIso = isoFromUnix(nowUnix() + 4 * 60);
    }
  }

  const secondary = scoreboard.filter((s) => s.symbol !== primary).slice(0, 4).map((s) => s.symbol);
  const primaryRow = primary ? scoreboard.find((s) => s.symbol === primary) : undefined;
  const reason = pinned
    ? `Pinned focus on ${primary}`
    : primaryRow
    ? `Top score: ${primaryRow.why}`
    : 'No candidates available';

  const horizon: NeuralAttention['focus']['horizon'] =
    experienceMode === 'hunt' ? 'NOW'
    : experienceMode === 'focus' ? 'TODAY'
    : 'SWING';

  const focusChanged = (currentPrimary ?? null) !== (primary ?? null);

  const focusStrip = [
    { id: 'mode', label: 'MODE', value: experienceMode.toUpperCase(), tone: experienceMode === 'risk_control' ? 'warn' : 'good' as const },
    { id: 'brain', label: 'BRAIN', value: brain.state, tone: brain.state === 'OVERLOADED' ? 'bad' : brain.state === 'STRESSED' ? 'warn' : 'good' as const },
    { id: 'load', label: 'LOAD', value: `${load.level} (${Math.round(load.value)})`, tone: load.level === 'HIGH' ? 'bad' : load.level === 'MEDIUM' ? 'warn' : 'good' as const },
    { id: 'focus', label: 'FOCUS', value: primary ?? '—', tone: primary ? 'good' : 'warn' as const },
  ];

  const neuralAttention: NeuralAttention = {
    focus: {
      primary,
      secondary,
      reason,
      horizon,
      lockedUntilTs: nextLockIso ?? undefined,
      pinned,
    },
    scoreboard: scoreboard.slice(0, 12).map((row) => ({
      ...row,
      score: Number(row.score.toFixed(1)),
      components: {
        setupQuality: Number(row.components.setupQuality.toFixed(1)),
        operatorFit: Number(row.components.operatorFit.toFixed(1)),
        urgency: Number(row.components.urgency.toFixed(1)),
        readiness: Number(row.components.readiness.toFixed(1)),
        riskPenalty: Number(row.components.riskPenalty.toFixed(1)),
        learningBias: Number(row.components.learningBias.toFixed(1)),
      },
    })),
    uiDirectives: {
      promoteWidgets: ['decision_cockpit', 'risk_command', 'live_alerts', 'signal_pipeline'],
      demoteWidgets: brain.state === 'OVERLOADED' ? ['aggressive_actions', 'news_feed'] : ['news_feed'],
      highlightSymbol: primary,
      focusStrip,
      refreshSeconds,
    },
    nudges: [
      ...(focusChanged && primary
        ? [{ id: 'attention-shift', type: 'attention_shift' as const, text: `Focus shifted to ${primary}.`, severity: 'med' as const, ttlSeconds: 90 }]
        : []),
      ...(brain.state === 'OVERLOADED'
        ? [{ id: 'risk-guard', type: 'risk_guard' as const, text: 'Operator overload detected — reduce exposure and suppress new triggers.', severity: 'high' as const, ttlSeconds: 120 }]
        : []),
      ...(primaryRow && primaryRow.state !== 'cooldown'
        ? [{ id: `action-${primaryRow.symbol}`, type: 'action_prompt' as const, text: `${primaryRow.symbol} is actionable now — ${primaryRow.nextAction.replace('_', ' ')}.`, severity: 'med' as const, ttlSeconds: 90 }]
        : []),
    ].slice(0, 3),
  };

  return {
    neuralAttention,
    memory: {
      currentPrimary: primary ?? null,
      lockedUntilTs: nextLockIso,
      pinnedSymbol: pinnedActive ? memory.pinnedSymbol ?? null : null,
      pinnedUntilTs: pinnedActive ? memory.pinnedUntilTs ?? null : null,
      cooldownUntil,
      ignoredCounts7d: ignoredCounts,
      snoozeUntilTs: memory.snoozeUntilTs ?? null,
    },
    focusShift: {
      changed: focusChanged,
      previous: currentPrimary ?? null,
      next: primary ?? null,
      reason,
      top: scoreboard.slice(0, 3).map((s) => ({ symbol: s.symbol, score: Number(s.score.toFixed(1)), nextAction: s.nextAction })),
    },
  };
}