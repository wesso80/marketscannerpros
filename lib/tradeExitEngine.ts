export type ExitReason = 'NONE' | 'INVALIDATION' | 'EDGE_DECAY' | 'TIME_OBJECTIVE';
export type ExitAction = 'HOLD' | 'SCALE_OUT' | 'TRAIL_STOP' | 'CLOSE';

export type Regime = 'TREND' | 'RANGE' | 'TRANSITION';
export type Permission = 'ALLOW' | 'CAUTION' | 'BLOCKED';

export interface TradeState {
  trade_id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  timeframe: string;

  entry_price: number;
  stop_price: number;
  thesis_invalidation_price: number;
  targets: number[];
  risk_R: number;

  mark_price: number;
  unrealized_R: number;
  max_favorable_R: number;
  time_open_ms: number;
  expected_window_ms?: number;

  edge_score: number;
  confidence: number;
  confidence_peak?: number;
  edge_peak?: number;
  regime: Regime;
  permission: Permission;
  flow_bias: 'BULL' | 'BEAR' | 'MIXED';
  momentum_state: 'EXPANDING' | 'FLAT' | 'FAILING';
  structure_state: 'IMPROVING' | 'NEUTRAL' | 'BREAKING';

  atr_percent?: number;
  expected_move_percent?: number;
  event_risk?: 'NONE' | 'EARNINGS' | 'MACRO' | 'NEWS';

  exit_reason: ExitReason;
  exit_action: ExitAction;
  exit_detail: string;
  next_stop?: number;

  exit_score?: number;
  time_elapsed_pct?: number | null;
}

function toFinite(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getRegimeEdgeFloor(regime: Regime): number {
  if (regime === 'TREND') return 50;
  if (regime === 'TRANSITION') return 45;
  return 40;
}

function flowAgainstPosition(side: 'LONG' | 'SHORT', flowBias: 'BULL' | 'BEAR' | 'MIXED'): boolean {
  return (side === 'LONG' && flowBias === 'BEAR') || (side === 'SHORT' && flowBias === 'BULL');
}

export function evaluateExit(input: TradeState): TradeState {
  const ts: TradeState = {
    ...input,
    edge_score: toFinite(input.edge_score, 50),
    confidence: toFinite(input.confidence, 50),
    mark_price: toFinite(input.mark_price, input.entry_price),
    time_open_ms: Math.max(0, toFinite(input.time_open_ms, 0)),
    risk_R: Math.max(0.000001, Math.abs(toFinite(input.risk_R, 0.000001))),
    max_favorable_R: toFinite(input.max_favorable_R, input.unrealized_R),
  };

  const timeElapsedPct = ts.expected_window_ms && ts.expected_window_ms > 0
    ? ts.time_open_ms / ts.expected_window_ms
    : null;

  const confidencePeak = toFinite(ts.confidence_peak, ts.confidence);
  const confidenceDrop = Math.max(0, confidencePeak - ts.confidence);
  const edgePeak = toFinite(ts.edge_peak, ts.edge_score);
  const edgeDropFromPeak = Math.max(0, edgePeak - ts.edge_score);

  let structuralFailureScore = 0;
  let edgeDecayScore = 0;
  let timeObjectiveScore = 0;

  // -------------------------
  // LAYER 1: HARD RISK
  // -------------------------
  const invalidationHit = ts.side === 'LONG'
    ? ts.mark_price <= ts.thesis_invalidation_price
    : ts.mark_price >= ts.thesis_invalidation_price;

  const regimeFlipAgainstTrade = ts.structure_state === 'BREAKING' && ts.regime !== 'TREND';
  const volBreach = Boolean(ts.atr_percent && ts.atr_percent >= 8);
  const eventNoHold = ts.event_risk === 'EARNINGS';

  if (invalidationHit || ts.permission === 'BLOCKED' || regimeFlipAgainstTrade || volBreach || eventNoHold) {
    structuralFailureScore = 40;

    let reason = 'Hard risk invalidation fired.';
    if (invalidationHit) reason = 'Thesis invalidation breached.';
    else if (ts.permission === 'BLOCKED') reason = 'Permission matrix flipped to BLOCKED.';
    else if (regimeFlipAgainstTrade) reason = 'Regime/structure flipped against trade.';
    else if (volBreach) reason = 'Volatility breach invalidated the setup.';
    else if (eventNoHold) reason = 'Event risk no-hold rule triggered.';

    return {
      ...ts,
      exit_reason: 'INVALIDATION',
      exit_action: 'CLOSE',
      exit_detail: reason,
      exit_score: structuralFailureScore,
      time_elapsed_pct: timeElapsedPct == null ? null : round(timeElapsedPct, 4),
    };
  }

  // -------------------------
  // LAYER 2: EDGE DECAY
  // -------------------------
  const regimeExitFloor = getRegimeEdgeFloor(ts.regime);
  const edgeTooLow = ts.edge_score < regimeExitFloor;
  const confidenceCollapse = confidenceDrop >= 20 && ts.momentum_state !== 'EXPANDING';
  const flowFlip = flowAgainstPosition(ts.side, ts.flow_bias);
  const momentumFailure = ts.momentum_state === 'FAILING';

  const edgeDropThreshold = ts.regime === 'TREND' ? 20 : ts.regime === 'TRANSITION' ? 18 : 15;
  const edgeDroppedFromPeak = edgeDropFromPeak >= edgeDropThreshold;

  if (edgeTooLow || confidenceCollapse || flowFlip || momentumFailure || edgeDroppedFromPeak) {
    edgeDecayScore = 30;

    let detail = 'Edge persistence failed (score/flow/momentum).';
    if (edgeTooLow) detail = `Edge score ${round(ts.edge_score, 2)} below regime floor ${regimeExitFloor}.`;
    else if (confidenceCollapse) detail = `Confidence collapsed by ${round(confidenceDrop, 2)} with no expansion.`;
    else if (flowFlip) detail = 'Flow bias flipped against position.';
    else if (momentumFailure) detail = 'Momentum failed after entry.';
    else if (edgeDroppedFromPeak) detail = `Edge dropped ${round(edgeDropFromPeak, 2)} pts from peak.`;

    return {
      ...ts,
      exit_reason: 'EDGE_DECAY',
      exit_action: 'CLOSE',
      exit_detail: detail,
      exit_score: edgeDecayScore,
      time_elapsed_pct: timeElapsedPct == null ? null : round(timeElapsedPct, 4),
    };
  }

  // -------------------------
  // LAYER 3: TIME / OBJECTIVES
  // -------------------------
  const targetHit = ts.targets.some((target) => ts.side === 'LONG' ? ts.mark_price >= target : ts.mark_price <= target);

  if (ts.unrealized_R >= 3 && ts.momentum_state !== 'EXPANDING') {
    timeObjectiveScore = 10;
    return {
      ...ts,
      exit_reason: 'TIME_OBJECTIVE',
      exit_action: 'CLOSE',
      exit_detail: '3R achieved and momentum is fading.',
      exit_score: timeObjectiveScore,
      time_elapsed_pct: timeElapsedPct == null ? null : round(timeElapsedPct, 4),
    };
  }

  if (ts.unrealized_R >= 2 || targetHit) {
    timeObjectiveScore = 10;
    return {
      ...ts,
      exit_reason: 'TIME_OBJECTIVE',
      exit_action: 'SCALE_OUT',
      exit_detail: targetHit ? 'Target hit — scale out by rule.' : '2R achieved — scale out by rule.',
      exit_score: timeObjectiveScore,
      time_elapsed_pct: timeElapsedPct == null ? null : round(timeElapsedPct, 4),
    };
  }

  if (ts.unrealized_R >= 1 && ts.permission !== 'ALLOW') {
    timeObjectiveScore = 10;
    return {
      ...ts,
      exit_reason: 'TIME_OBJECTIVE',
      exit_action: 'TRAIL_STOP',
      next_stop: ts.entry_price,
      exit_detail: '1R achieved under CAUTION/BLOCK risk posture — trail to breakeven.',
      exit_score: timeObjectiveScore,
      time_elapsed_pct: timeElapsedPct == null ? null : round(timeElapsedPct, 4),
    };
  }

  if (timeElapsedPct != null) {
    if (timeElapsedPct > 0.6 && ts.unrealized_R < 0.5) {
      timeObjectiveScore = 10;
      return {
        ...ts,
        exit_reason: 'TIME_OBJECTIVE',
        exit_action: 'CLOSE',
        exit_detail: 'Time stop: no progress by 60% of expected window.',
        exit_score: timeObjectiveScore,
        time_elapsed_pct: round(timeElapsedPct, 4),
      };
    }

    const noBreakout = ts.structure_state !== 'IMPROVING';
    if (timeElapsedPct > 1.0 && (ts.unrealized_R < 1.0 || noBreakout)) {
      timeObjectiveScore = 10;
      return {
        ...ts,
        exit_reason: 'TIME_OBJECTIVE',
        exit_action: 'CLOSE',
        exit_detail: 'Window expired without sufficient expansion/breakout.',
        exit_score: timeObjectiveScore,
        time_elapsed_pct: round(timeElapsedPct, 4),
      };
    }
  }

  return {
    ...ts,
    exit_reason: 'NONE',
    exit_action: 'HOLD',
    exit_detail: 'Hold: no exit conditions met.',
    exit_score: 0,
    time_elapsed_pct: timeElapsedPct == null ? null : round(timeElapsedPct, 4),
  };
}
