export type RiskMode = 'NORMAL' | 'THROTTLED' | 'DEFENSIVE' | 'LOCKED';
export type Permission = 'ALLOW' | 'ALLOW_REDUCED' | 'ALLOW_TIGHTENED' | 'BLOCK';
export type Direction = 'LONG' | 'SHORT';
export type StrategyTag =
  | 'BREAKOUT_CONTINUATION'
  | 'TREND_PULLBACK'
  | 'RANGE_FADE'
  | 'MEAN_REVERSION'
  | 'MOMENTUM_REVERSAL'
  | 'EVENT_STRATEGY';
export type Regime =
  | 'TREND_UP'
  | 'TREND_DOWN'
  | 'RANGE_NEUTRAL'
  | 'VOL_EXPANSION'
  | 'VOL_CONTRACTION'
  | 'RISK_OFF_STRESS';

export type PermissionMatrixSnapshot = {
  guard_enabled: boolean;
  risk_mode: RiskMode;
  regime: Regime;
  session: {
    remaining_daily_R: number;
    max_daily_R: number;
    open_risk_R: number;
    max_open_risk_R: number;
    consecutive_losses: number;
    /** Trades executed this session */
    trades_today: number;
    /** Maximum trades allowed per day (hard limit) */
    max_trades_per_day: number;
    /** Whether the trade count hard limit has been reached */
    trade_count_blocked: boolean;
  };
  data_health: {
    status: 'OK' | 'DEGRADED' | 'DOWN';
    max_age_s: number;
    age_s: number;
    source: string;
    last_update_iso: string;
  };
  caps: {
    risk_per_trade: number;
    gross_max: number;
    net_max: number;
    cluster_max: number;
    single_max: number;
    add_ons_allowed: boolean;
  };
  matrix: Record<StrategyTag, Record<Direction, Permission>>;
  global_blocks: Array<{
    code: string;
    severity: 'WARN' | 'BLOCK';
    msg: string;
  }>;
  ts: string;
};

export type CandidateIntent = {
  symbol: string;
  asset_class: 'equities' | 'crypto';
  strategy_tag: StrategyTag;
  direction: Direction;
  confidence: number;
  entry_price: number;
  stop_price: number;
  atr: number;
  event_severity?: 'none' | 'medium' | 'high';
  /** Current open positions for correlation enforcement */
  open_positions?: Array<{
    symbol: string;
    direction: Direction;
    asset_class?: 'equities' | 'crypto';
  }>;
};

export type EvaluateResult = {
  permission: Permission;
  risk_mode: RiskMode;
  risk_per_trade: number;
  max_position_size: number;
  required_stop_min_distance: number;
  constraints: {
    max_gross_exposure: number;
    max_net_exposure: number;
    max_open_risk_R: number;
    no_add_ons: boolean;
    trigger_only: boolean;
  };
  required_actions: string[];
  reason_codes: string[];
  ts: string;
};

const BASE_RISK = 0.0075;
const MAX_DAILY_R = 2;
const MAX_OPEN_R = 3;
const LOSS_STREAK_THROTTLE = 3;
const LOSS_STREAK_LOCK = 4;
const MAX_CORRELATED_SAME_CLUSTER = 2;
/** Hard daily trade count limits — configurable per asset class */
const MAX_TRADES_PER_DAY_EQUITY = 8;
const MAX_TRADES_PER_DAY_CRYPTO = 12;

const CONFIDENCE_THRESHOLD = {
  ALLOW: 70,
  ALLOW_REDUCED: 62,
  ALLOW_TIGHTENED: 65,
};

/**
 * Infer correlation cluster from symbol.
 * Symbols in the same cluster + direction should be limited.
 */
function inferCluster(assetClass: 'equities' | 'crypto', symbol: string): string {
  const s = symbol.toUpperCase();

  if (assetClass === 'crypto') {
    if (/^(BTC|ETH|SOL|AVAX|RNDR|FET|TAO|NEAR|APT|ARB|OP|SUI)$/.test(s)) return 'CRYPTO_BETA';
    if (/^(FET|RNDR|TAO|AGIX|OCEAN|GRT)$/.test(s)) return 'CRYPTO_AI';
    if (/^(ADA|DOT|ATOM|AVAX|SOL|NEAR)$/.test(s)) return 'CRYPTO_L1';
    return 'CRYPTO_OTHER';
  }

  if (/^(NVDA|AAPL|AMD|MSFT|META|GOOGL|QQQ|SOXL|TSLA)$/.test(s)) return 'AI_TECH';
  if (/^(IWM|ARKK|SHOP|SNOW|NET|PLTR)$/.test(s)) return 'GROWTH';
  if (/^(XOM|CVX|COP|XLE)$/.test(s)) return 'ENERGY';
  if (/^(JPM|BAC|GS|MS|XLF)$/.test(s)) return 'FINANCIALS';
  return 'GENERAL';
}

function buildMatrix(regime: Regime): Record<StrategyTag, Record<Direction, Permission>> {
  const block = { LONG: 'BLOCK' as Permission, SHORT: 'BLOCK' as Permission };

  const matrix: Record<Regime, Record<StrategyTag, Record<Direction, Permission>>> = {
    TREND_UP: {
      BREAKOUT_CONTINUATION: { LONG: 'ALLOW', SHORT: 'BLOCK' },
      TREND_PULLBACK: { LONG: 'ALLOW', SHORT: 'BLOCK' },
      RANGE_FADE: block,
      MEAN_REVERSION: { LONG: 'ALLOW_REDUCED', SHORT: 'BLOCK' },
      MOMENTUM_REVERSAL: block,
      EVENT_STRATEGY: { LONG: 'ALLOW_REDUCED', SHORT: 'ALLOW_REDUCED' },
    },
    TREND_DOWN: {
      BREAKOUT_CONTINUATION: { LONG: 'BLOCK', SHORT: 'ALLOW_REDUCED' },
      TREND_PULLBACK: { LONG: 'BLOCK', SHORT: 'ALLOW_REDUCED' },
      RANGE_FADE: block,
      MEAN_REVERSION: { LONG: 'ALLOW_REDUCED', SHORT: 'ALLOW_REDUCED' },
      MOMENTUM_REVERSAL: block,
      EVENT_STRATEGY: { LONG: 'ALLOW_REDUCED', SHORT: 'ALLOW_REDUCED' },
    },
    RANGE_NEUTRAL: {
      BREAKOUT_CONTINUATION: { LONG: 'ALLOW_TIGHTENED', SHORT: 'ALLOW_TIGHTENED' },
      TREND_PULLBACK: { LONG: 'ALLOW_TIGHTENED', SHORT: 'ALLOW_TIGHTENED' },
      RANGE_FADE: { LONG: 'ALLOW', SHORT: 'ALLOW' },
      MEAN_REVERSION: { LONG: 'ALLOW', SHORT: 'ALLOW' },
      MOMENTUM_REVERSAL: { LONG: 'ALLOW_TIGHTENED', SHORT: 'ALLOW_TIGHTENED' },
      EVENT_STRATEGY: { LONG: 'ALLOW_REDUCED', SHORT: 'ALLOW_REDUCED' },
    },
    VOL_EXPANSION: {
      BREAKOUT_CONTINUATION: { LONG: 'ALLOW_REDUCED', SHORT: 'ALLOW_REDUCED' },
      TREND_PULLBACK: { LONG: 'ALLOW_REDUCED', SHORT: 'ALLOW_REDUCED' },
      RANGE_FADE: { LONG: 'ALLOW_REDUCED', SHORT: 'ALLOW_REDUCED' },
      MEAN_REVERSION: { LONG: 'ALLOW_TIGHTENED', SHORT: 'ALLOW_TIGHTENED' },
      MOMENTUM_REVERSAL: block,
      EVENT_STRATEGY: { LONG: 'ALLOW_REDUCED', SHORT: 'ALLOW_REDUCED' },
    },
    VOL_CONTRACTION: {
      BREAKOUT_CONTINUATION: { LONG: 'ALLOW_TIGHTENED', SHORT: 'ALLOW_TIGHTENED' },
      TREND_PULLBACK: { LONG: 'ALLOW_TIGHTENED', SHORT: 'ALLOW_TIGHTENED' },
      RANGE_FADE: { LONG: 'ALLOW', SHORT: 'ALLOW' },
      MEAN_REVERSION: { LONG: 'ALLOW', SHORT: 'ALLOW' },
      MOMENTUM_REVERSAL: block,
      EVENT_STRATEGY: { LONG: 'ALLOW_REDUCED', SHORT: 'ALLOW_REDUCED' },
    },
    RISK_OFF_STRESS: {
      BREAKOUT_CONTINUATION: block,
      TREND_PULLBACK: { LONG: 'BLOCK', SHORT: 'ALLOW_REDUCED' },
      RANGE_FADE: { LONG: 'ALLOW_REDUCED', SHORT: 'ALLOW_REDUCED' },
      MEAN_REVERSION: { LONG: 'ALLOW_REDUCED', SHORT: 'ALLOW_REDUCED' },
      MOMENTUM_REVERSAL: block,
      EVENT_STRATEGY: { LONG: 'ALLOW_REDUCED', SHORT: 'ALLOW_REDUCED' },
    },
  };

  return matrix[regime];
}

function buildAllowAllMatrix(): Record<StrategyTag, Record<Direction, Permission>> {
  const allowBoth = { LONG: 'ALLOW' as Permission, SHORT: 'ALLOW' as Permission };
  return {
    BREAKOUT_CONTINUATION: allowBoth,
    TREND_PULLBACK: allowBoth,
    RANGE_FADE: allowBoth,
    MEAN_REVERSION: allowBoth,
    MOMENTUM_REVERSAL: allowBoth,
    EVENT_STRATEGY: allowBoth,
  };
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function inferRiskMode(args: {
  dataStatus: 'OK' | 'DEGRADED' | 'DOWN';
  remainingDailyR: number;
  openRiskR: number;
  eventSeverity: 'none' | 'medium' | 'high';
  consecutiveLosses: number;
}): RiskMode {
  if (args.dataStatus === 'DOWN') return 'LOCKED';
  if (args.remainingDailyR <= 0) return 'LOCKED';
  if (args.openRiskR >= MAX_OPEN_R) return 'LOCKED';
  if (args.consecutiveLosses >= LOSS_STREAK_LOCK) return 'LOCKED';
  if (args.eventSeverity === 'high') return 'THROTTLED';
  if (args.consecutiveLosses >= LOSS_STREAK_THROTTLE) return 'THROTTLED';
  if (args.dataStatus === 'DEGRADED') return 'DEFENSIVE';
  return 'NORMAL';
}

export function buildPermissionSnapshot(input?: {
  enabled?: boolean;
  regime?: Regime;
  dataStatus?: 'OK' | 'DEGRADED' | 'DOWN';
  dataAgeSeconds?: number;
  eventSeverity?: 'none' | 'medium' | 'high';
  realizedDailyR?: number;
  openRiskR?: number;
  consecutiveLosses?: number;
  /** When true, daily R budget is halved (guard disabled penalty) */
  rBudgetHalved?: boolean;
  /** Number of trades executed today */
  tradesToday?: number;
  /** Primary asset class for trade count limits */
  assetClass?: 'equities' | 'crypto';
}): PermissionMatrixSnapshot {
  const enabled = input?.enabled !== false;
  const regime = input?.regime ?? 'RANGE_NEUTRAL'; // Conservative default — was TREND_UP (too permissive)
  const eventSeverity = input?.eventSeverity ?? 'none';
  const dataStatus = input?.dataStatus ?? 'OK';
  const realizedDailyR = input?.realizedDailyR ?? -1.2;
  const openRiskR = input?.openRiskR ?? 2.2;
  const consecutiveLosses = input?.consecutiveLosses ?? 1;
  const effectiveMaxDailyR = input?.rBudgetHalved ? MAX_DAILY_R * 0.5 : MAX_DAILY_R;
  const remainingDailyR = Math.max(0, round2(effectiveMaxDailyR + realizedDailyR));
  const dataAge = Math.max(0, input?.dataAgeSeconds ?? 3);

  const riskMode = inferRiskMode({
    dataStatus,
    remainingDailyR,
    openRiskR,
    eventSeverity,
    consecutiveLosses,
  });

  const riskMult = riskMode === 'LOCKED' ? 0 : riskMode === 'THROTTLED' ? 0.5 : riskMode === 'DEFENSIVE' ? 0.35 : 1;

  const matrix = enabled ? buildMatrix(regime) : buildAllowAllMatrix();
  const globalBlocks: PermissionMatrixSnapshot['global_blocks'] = [];
  if (enabled && eventSeverity === 'high') {
    globalBlocks.push({ code: 'EVENT_THROTTLE', severity: 'WARN', msg: 'High-impact event window active.' });
  }
  if (enabled && riskMode === 'LOCKED') {
    globalBlocks.push({ code: 'RISK_LOCKED', severity: 'BLOCK', msg: 'Risk governor is LOCKED. New trades disabled.' });
  }
  if (enabled && dataStatus !== 'OK') {
    globalBlocks.push({
      code: dataStatus === 'DOWN' ? 'DATA_DOWN' : 'DATA_DEGRADED',
      severity: dataStatus === 'DOWN' ? 'BLOCK' : 'WARN',
      msg: dataStatus === 'DOWN' ? 'Market data feed unavailable.' : 'Market data feed degraded.',
    });
  }

  const tradesToday = input?.tradesToday ?? 0;
  const maxTradesPerDay = input?.assetClass === 'crypto' ? MAX_TRADES_PER_DAY_CRYPTO : MAX_TRADES_PER_DAY_EQUITY;
  const tradeCountBlocked = enabled && tradesToday >= maxTradesPerDay;

  if (enabled && tradeCountBlocked) {
    globalBlocks.push({ code: 'TRADE_COUNT_LIMIT', severity: 'BLOCK', msg: `Daily trade count limit reached (${tradesToday}/${maxTradesPerDay}). No new trades allowed.` });
  }

  return {
    guard_enabled: enabled,
    risk_mode: enabled ? riskMode : 'NORMAL',
    regime,
    session: {
      remaining_daily_R: remainingDailyR,
      max_daily_R: effectiveMaxDailyR,
      open_risk_R: round2(openRiskR),
      max_open_risk_R: MAX_OPEN_R,
      consecutive_losses: consecutiveLosses,
      trades_today: tradesToday,
      max_trades_per_day: maxTradesPerDay,
      trade_count_blocked: tradeCountBlocked,
    },
    data_health: {
      status: dataStatus,
      max_age_s: 20,
      age_s: dataAge,
      source: 'msp-composite-feed',
      last_update_iso: new Date().toISOString(),
    },
    caps: {
      risk_per_trade: round2(BASE_RISK * (enabled ? riskMult : 1)),
      gross_max: enabled && riskMode === 'THROTTLED' ? 1.2 : 1.5,
      net_max: enabled && riskMode === 'THROTTLED' ? 0.7 : 0.8,
      cluster_max: 0.6,
      single_max: 0.35,
      add_ons_allowed: enabled ? riskMode === 'NORMAL' : true,
    },
    matrix,
    global_blocks: globalBlocks,
    ts: new Date().toISOString(),
  };
}

function permissionRank(permission: Permission): number {
  switch (permission) {
    case 'ALLOW':
      return 3;
    case 'ALLOW_REDUCED':
      return 2;
    case 'ALLOW_TIGHTENED':
      return 1;
    default:
      return 0;
  }
}

function minStopAtrMultiplier(strategy: StrategyTag, assetClass: 'equities' | 'crypto'): number {
  const equityMap: Record<StrategyTag, number> = {
    BREAKOUT_CONTINUATION: 0.8,
    TREND_PULLBACK: 0.6,
    RANGE_FADE: 0.5,
    MEAN_REVERSION: 0.6,
    MOMENTUM_REVERSAL: 0.8,
    EVENT_STRATEGY: 0.8,
  };

  const cryptoMap: Record<StrategyTag, number> = {
    BREAKOUT_CONTINUATION: 1,
    TREND_PULLBACK: 0.8,
    RANGE_FADE: 0.7,
    MEAN_REVERSION: 0.8,
    MOMENTUM_REVERSAL: 1,
    EVENT_STRATEGY: 0.9,
  };

  return assetClass === 'crypto' ? cryptoMap[strategy] : equityMap[strategy];
}

export function evaluateCandidate(snapshot: PermissionMatrixSnapshot, candidate: CandidateIntent): EvaluateResult {
  if (!snapshot.guard_enabled) {
    const stopDistance = Math.abs(candidate.entry_price - candidate.stop_price);
    const riskPerTrade = snapshot.caps.risk_per_trade;
    const rPerUnit = Math.max(0.0001, stopDistance);
    const maxPositionSize = Math.floor((100000 * riskPerTrade) / rPerUnit);

    return {
      permission: 'ALLOW',
      risk_mode: 'NORMAL',
      risk_per_trade: riskPerTrade,
      max_position_size: Math.max(0, maxPositionSize),
      required_stop_min_distance: 0,
      constraints: {
        max_gross_exposure: snapshot.caps.gross_max,
        max_net_exposure: snapshot.caps.net_max,
        max_open_risk_R: snapshot.session.max_open_risk_R,
        no_add_ons: false,
        trigger_only: false,
      },
      required_actions: [],
      reason_codes: ['GUARD_DISABLED'],
      ts: new Date().toISOString(),
    };
  }

  const reasonCodes: string[] = [];
  const requiredActions: string[] = [];
  let permission = snapshot.matrix[candidate.strategy_tag]?.[candidate.direction] ?? 'BLOCK';

  if (snapshot.risk_mode === 'LOCKED') {
    permission = 'BLOCK';
    reasonCodes.push('RISK_MODE_LOCKED');
    requiredActions.push('Reduce or close risk before new entries.');
  }

  // ─── Daily trade count hard limit ───
  if (snapshot.session.trade_count_blocked) {
    permission = 'BLOCK';
    reasonCodes.push('TRADE_COUNT_LIMIT');
    requiredActions.push(`Daily trade limit reached (${snapshot.session.trades_today}/${snapshot.session.max_trades_per_day}). No new trades allowed today.`);
  }

  if (snapshot.data_health.status === 'DOWN') {
    permission = 'BLOCK';
    reasonCodes.push('DATA_STALE');
    requiredActions.push('Wait for feed recovery.');
  }

  if (candidate.event_severity === 'high' && candidate.strategy_tag !== 'EVENT_STRATEGY') {
    permission = 'BLOCK';
    reasonCodes.push('EVENT_BLOCK');
    requiredActions.push('Use EVENT_STRATEGY or wait until event window passes.');
  }

  const confidenceFloor = CONFIDENCE_THRESHOLD[permission as keyof typeof CONFIDENCE_THRESHOLD] ?? 100;
  if (candidate.confidence < confidenceFloor) {
    permission = 'BLOCK';
    reasonCodes.push('CONFIDENCE_BELOW_THRESHOLD');
    requiredActions.push(`Raise setup quality to >= ${confidenceFloor}% confidence.`);
  }

  // ─── Position correlation enforcement ───
  if (candidate.open_positions && candidate.open_positions.length > 0) {
    const myCluster = inferCluster(candidate.asset_class, candidate.symbol);
    const sameClusterSameDirection = candidate.open_positions.filter(p => {
      const pCluster = inferCluster(p.asset_class ?? candidate.asset_class, p.symbol);
      return pCluster === myCluster && p.direction === candidate.direction;
    }).length;

    if (sameClusterSameDirection >= MAX_CORRELATED_SAME_CLUSTER) {
      permission = 'BLOCK';
      reasonCodes.push('CORRELATED_CLUSTER_FULL');
      requiredActions.push(
        `Max ${MAX_CORRELATED_SAME_CLUSTER} ${candidate.direction} positions in cluster ${myCluster}. Close an existing position first.`
      );
    } else if (sameClusterSameDirection === MAX_CORRELATED_SAME_CLUSTER - 1) {
      // Approaching limit — warn and reduce size
      if (permission === 'ALLOW') {
        permission = 'ALLOW_REDUCED';
        reasonCodes.push('CORRELATED_CLUSTER_WARNING');
        requiredActions.push(`Approaching cluster limit for ${myCluster}. Size reduced.`);
      }
    }
  }

  // ─── Stop direction validation ───
  // LONG: stop must be below entry. SHORT: stop must be above entry.
  if (candidate.direction === 'LONG' && candidate.stop_price >= candidate.entry_price) {
    permission = 'BLOCK';
    reasonCodes.push('STOP_WRONG_SIDE');
    requiredActions.push('LONG stop must be below entry price.');
  } else if (candidate.direction === 'SHORT' && candidate.stop_price <= candidate.entry_price) {
    permission = 'BLOCK';
    reasonCodes.push('STOP_WRONG_SIDE');
    requiredActions.push('SHORT stop must be above entry price.');
  }

  // ─── Stop === Entry explicit check ───
  if (candidate.stop_price === candidate.entry_price) {
    permission = 'BLOCK';
    reasonCodes.push('STOP_EQUALS_ENTRY');
    requiredActions.push('Stop price cannot equal entry price.');
  }

  const stopDistance = Math.abs(candidate.entry_price - candidate.stop_price);
  const stopMinDistance = minStopAtrMultiplier(candidate.strategy_tag, candidate.asset_class) * candidate.atr;
  if (stopDistance < stopMinDistance) {
    permission = 'BLOCK';
    reasonCodes.push('STOP_TOO_TIGHT');
    requiredActions.push(`Widen stop to at least ${round2(stopMinDistance)}.`);
  }

  if (!snapshot.caps.add_ons_allowed && permission !== 'BLOCK') {
    reasonCodes.push('NO_ADD_ONS');
  }

  if (reasonCodes.length === 0 && permission !== 'BLOCK') {
    reasonCodes.push(permission === 'ALLOW' ? 'POLICY_CLEAR' : permission === 'ALLOW_REDUCED' ? 'SIZE_REDUCED' : 'TRIGGER_ONLY');
  }

  const riskPerTrade = snapshot.caps.risk_per_trade;
  const rPerUnit = Math.max(0.0001, stopDistance);
  const maxPositionSize = Math.floor((100000 * riskPerTrade) / rPerUnit);

  return {
    permission,
    risk_mode: snapshot.risk_mode,
    risk_per_trade: riskPerTrade,
    max_position_size: Math.max(0, maxPositionSize),
    required_stop_min_distance: round2(stopMinDistance),
    constraints: {
      max_gross_exposure: snapshot.caps.gross_max,
      max_net_exposure: snapshot.caps.net_max,
      max_open_risk_R: snapshot.session.max_open_risk_R,
      no_add_ons: !snapshot.caps.add_ons_allowed,
      trigger_only: permission === 'ALLOW_TIGHTENED',
    },
    required_actions: requiredActions,
    reason_codes: reasonCodes,
    ts: new Date().toISOString(),
  };
}

export function minPermission(a: Permission, b: Permission): Permission {
  return permissionRank(a) <= permissionRank(b) ? a : b;
}
