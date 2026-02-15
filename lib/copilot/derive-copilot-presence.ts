import type { OptionsSetup } from '../options-confluence-analyzer';
import type { CopilotPresence, TerminalMode, AttentionState, CopilotEvent, FocusTarget } from './copilot-types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function deriveCopilotPresence(setup: OptionsSetup): CopilotPresence {
  const now = Date.now();

  const cs = setup.compositeScore;
  const ms = setup.aiMarketState;
  const intent = setup.institutionalIntent;
  const stack = setup.professionalTradeStack;
  const snap = setup.tradeSnapshot;

  let terminalMode: TerminalMode = 'WAIT';

  if (ms?.regime?.regime) {
    if (ms.tradeQualityGate === 'WAIT') terminalMode = 'WAIT';
    else if (ms.regime.regime === 'TREND') terminalMode = 'TREND';
    else if (ms.regime.regime === 'RANGE') terminalMode = 'RANGE';
    else if (ms.regime.regime === 'EXPANSION') terminalMode = 'EXPANSION';
    else if (ms.regime.regime === 'REVERSAL') terminalMode = 'REVERSAL';
  } else {
    if (cs.confidence < 45 || cs.finalDirection === 'neutral') terminalMode = 'WAIT';
    else terminalMode = 'TREND';
  }

  const hasConflicts = (cs.conflicts?.length || 0) >= 2;
  const rawIntentConf = intent?.intent_confidence ?? 0;
  const intentConf = rawIntentConf <= 1 ? rawIntentConf * 100 : rawIntentConf;
  const permission = intent?.permission_bias ?? 'NONE';

  if (hasConflicts && cs.confidence >= 45) terminalMode = 'TRANSITION';
  if (permission === 'NONE' && cs.confidence < 55) terminalMode = 'WAIT';

  const execReady = stack?.executionPlan?.status === 'ready';
  const edgeScore = stack?.overallEdgeScore ?? clamp(Math.abs(cs.directionScore), 0, 100);

  let attentionState: AttentionState = 'CALM';
  if (terminalMode === 'WAIT') attentionState = 'CALM';
  else if (cs.confidence >= 70 && execReady && edgeScore >= 70) attentionState = 'ACTIVE';
  else if (cs.confidence >= 55 && edgeScore >= 55) attentionState = 'BUILDING';
  else attentionState = 'RISK';

  let primary: FocusTarget = 'CHART';
  let secondary: FocusTarget | undefined = 'STRUCTURE';

  if (terminalMode === 'EXPANSION') {
    primary = 'VOLATILITY'; secondary = 'FLOW';
  } else if (terminalMode === 'RANGE') {
    primary = 'LEVELS'; secondary = 'TIMING';
  } else if (terminalMode === 'REVERSAL' || terminalMode === 'TRANSITION') {
    primary = 'STRUCTURE'; secondary = 'FLOW';
  } else if (terminalMode === 'TREND') {
    primary = 'CHART'; secondary = 'EXECUTION';
  }

  const flowHot =
    setup.unusualActivity?.hasUnusualActivity &&
    ['high', 'moderate'].includes(setup.unusualActivity.alertLevel);

  if (flowHot || (intentConf >= 65 && permission !== 'NONE')) {
    primary = 'FLOW';
    secondary = terminalMode === 'TREND' ? 'CHART' : 'EXECUTION';
  }

  const intensity = clamp(
    Math.round((cs.confidence * 0.6) + (edgeScore * 0.4)),
    0,
    100
  );

  const notes: string[] = [];

  notes.push(`${snap.verdict.replace('_', ' ')} | Grade ${snap.setupGrade}`);
  if (ms?.thesis?.primaryEdge) notes.push(`Edge: ${ms.thesis.primaryEdge}`);
  if (intent?.primary_intent && intent.primary_intent !== 'UNKNOWN') {
    notes.push(`Intent: ${intent.primary_intent} (${intentConf.toFixed(0)}%)`);
  }
  if (cs.conflicts?.length) notes.push(`Conflicts: ${cs.conflicts.slice(0, 2).join(' • ')}`);

  const events: CopilotEvent[] = [];

  if (terminalMode === 'TRANSITION') {
    events.push({
      type: 'REGIME_SHIFT',
      title: 'Regime transition',
      message: 'Signals diverging — wait for confirmation or reduce size.',
      ts: now,
      focus: ['STRUCTURE', 'FLOW', 'TIMING'],
      confidence: cs.confidence,
    });
  }

  if (flowHot) {
    events.push({
      type: 'FLOW_SHIFT',
      title: 'Flow heating up',
      message: `Unusual activity: ${setup.unusualActivity?.alertLevel.toUpperCase()} — confirm with structure.`,
      ts: now,
      focus: ['FLOW', 'STRUCTURE'],
      confidence: cs.confidence,
    });
  }

  if (attentionState === 'RISK') {
    events.push({
      type: 'WARNING',
      title: 'Risk elevated',
      message: 'Edge not clean — prioritize confirmation and defined-risk structures.',
      ts: now,
      focus: ['VOLATILITY', 'STRUCTURE'],
      confidence: cs.confidence,
    });
  }

  if (attentionState === 'ACTIVE') {
    events.push({
      type: 'OPPORTUNITY',
      title: 'High-quality setup',
      message: 'Execution window open — follow plan + respect invalidation.',
      ts: now,
      focus: ['EXECUTION', 'CHART'],
      confidence: cs.confidence,
    });
  }

  const watch = [primary, secondary].filter(Boolean).join(' + ');
  const statusLine = `MODE: ${terminalMode} | ATTENTION: ${attentionState} | WATCHING: ${watch}`;

  return {
    terminalMode,
    attentionState,
    statusLine,
    focus: { primary, secondary, intensity },
    notes: notes.slice(0, 4),
    events,
  };
}
