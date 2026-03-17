/**
 * v3.1 Validation Script — exercises pure functions and simulates edge-profile
 * computation with realistic trade data to verify correctness before v3.2.
 *
 * Run: npx tsx test/validate_v31.ts
 */

/* ── Import pure functions ──────────────────────────────────────────────── */

// We inline the functions to avoid Next.js module resolution issues
// but these are exact copies of the production code.

// --- outcomeClassifier ---
type OutcomeLabel = 'big_win' | 'small_win' | 'breakeven' | 'small_loss' | 'big_loss';

function classifyOutcome(rMultiple: number | null | undefined, pl?: number | null): OutcomeLabel {
  if (rMultiple != null && Number.isFinite(rMultiple)) {
    if (rMultiple >= 2.0) return 'big_win';
    if (rMultiple >= 0.5) return 'small_win';
    if (rMultiple > -0.5) return 'breakeven';
    if (rMultiple >= -1.0) return 'small_loss';
    return 'big_loss';
  }
  if (pl != null && Number.isFinite(pl)) {
    if (pl > 0) return 'small_win';
    if (pl < 0) return 'small_loss';
  }
  return 'breakeven';
}

function deriveOutcome(rMultiple: number | null | undefined, pl?: number | null): 'win' | 'loss' | 'breakeven' {
  if (rMultiple != null && Number.isFinite(rMultiple)) {
    if (rMultiple >= 0.5) return 'win';
    if (rMultiple <= -0.5) return 'loss';
    return 'breakeven';
  }
  if (pl != null && Number.isFinite(pl)) {
    if (pl > 0) return 'win';
    if (pl < 0) return 'loss';
  }
  return 'breakeven';
}

// --- edgeProfile helpers ---
const MIN_SAMPLE_SIZE = 10;

type EdgeDimension = 'overall' | 'asset_class' | 'side' | 'strategy' | 'setup' |
  'regime' | 'volatility_regime' | 'day_of_week' | 'hour_of_day' |
  'outcome_label' | 'exit_reason' | 'trade_type';

const VALID_DIMENSION_COLUMNS: Record<EdgeDimension, string> = {
  overall: "'overall'",
  asset_class: 'asset_class',
  side: 'side',
  strategy: 'LOWER(TRIM(strategy))',
  setup: 'LOWER(TRIM(setup))',
  regime: 'regime',
  volatility_regime: 'volatility_regime',
  day_of_week: 'day_of_week',
  hour_of_day: 'hour_of_day',
  outcome_label: 'outcome_label',
  exit_reason: 'exit_reason',
  trade_type: 'trade_type',
};

function isValidDimension(d: string): d is EdgeDimension {
  return d in VALID_DIMENSION_COLUMNS;
}

function statConfidence(sampleSize: number, minThreshold: number): number {
  if (sampleSize < minThreshold * 0.5) return 0;
  if (sampleSize >= minThreshold * 3) return 1;
  return Math.min(1, (sampleSize - minThreshold * 0.5) / (minThreshold * 2.5));
}

function maxStreak(outcomes: string, target: string): number {
  if (!outcomes) return 0;
  let current = 0;
  let max = 0;
  for (const o of outcomes.split(',')) {
    if (o === target) { current++; if (current > max) max = current; }
    else { current = 0; }
  }
  return max;
}

interface AggRow {
  dim_value: string; sample_size: number; wins: number; losses: number; breakevens: number;
  big_wins: number; small_wins: number; small_losses: number; big_losses: number;
  avg_r: number; avg_pl_pct: number; gross_win_r: number; gross_loss_r: number;
  best_r: number; worst_r: number; avg_hold_m: number | null; outcomes_list: string;
}

interface EdgeSlice {
  dimension: EdgeDimension; value: string; sampleSize: number; meetsThreshold: boolean;
  winRate: number; avgR: number; profitFactor: number; expectancy: number;
  avgHoldMinutes: number | null; bigWins: number; smallWins: number; breakevens: number;
  smallLosses: number; bigLosses: number; maxConsecutiveWins: number;
  maxConsecutiveLosses: number; bestR: number; worstR: number; avgPlPercent: number;
  confidence: number;
}

function buildSlice(dimension: EdgeDimension, row: AggRow, minSample: number): EdgeSlice {
  const winRate = row.sample_size > 0 ? row.wins / row.sample_size : 0;
  const lossRate = row.sample_size > 0 ? row.losses / row.sample_size : 0;
  const avgWinR = row.wins > 0 ? row.gross_win_r / row.wins : 0;
  const avgLossR = row.losses > 0 ? row.gross_loss_r / row.losses : 0;
  return {
    dimension, value: row.dim_value ?? 'unknown', sampleSize: row.sample_size,
    meetsThreshold: row.sample_size >= minSample, winRate, avgR: row.avg_r,
    profitFactor: row.gross_loss_r > 0 ? row.gross_win_r / row.gross_loss_r : (row.gross_win_r > 0 ? Infinity : 0),
    expectancy: avgWinR * winRate - avgLossR * lossRate,
    avgHoldMinutes: row.avg_hold_m,
    bigWins: row.big_wins, smallWins: row.small_wins, breakevens: row.breakevens,
    smallLosses: row.small_losses, bigLosses: row.big_losses,
    maxConsecutiveWins: maxStreak(row.outcomes_list, 'win'),
    maxConsecutiveLosses: maxStreak(row.outcomes_list, 'loss'),
    bestR: row.best_r, worstR: row.worst_r, avgPlPercent: row.avg_pl_pct,
    confidence: statConfidence(row.sample_size, minSample),
  };
}

/* ── Test Data: Realistic trade portfolio ───────────────────────────────── */

interface MockTrade {
  symbol: string; asset_class: string; side: string; trade_type: string;
  strategy: string | null; setup: string | null;
  entry_price: number; exit_price: number; stop_loss: number | null;
  pl: number; pl_percent: number; r_multiple: number | null;
  outcome: string; exit_reason: string | null; close_source: string;
  regime: string | null; volatility_regime: string | null;
  followed_plan: boolean | null; day_of_week: number;
}

// 40 trades: mix of strategies, regimes, outcomes, asset classes
const MOCK_TRADES: MockTrade[] = [
  // --- Breakout strategy, equity, mostly winners in TREND_UP ---
  { symbol: 'AAPL', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Breakout', setup: 'Bull Flag', entry_price: 170, exit_price: 180, stop_loss: 165, pl: 1000, pl_percent: 5.88, r_multiple: 2.0, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'TREND_UP', volatility_regime: 'normal', followed_plan: true, day_of_week: 1 },
  { symbol: 'MSFT', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Breakout', setup: 'Bull Flag', entry_price: 380, exit_price: 395, stop_loss: 370, pl: 1500, pl_percent: 3.95, r_multiple: 1.5, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'TREND_UP', volatility_regime: 'normal', followed_plan: true, day_of_week: 2 },
  { symbol: 'NVDA', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Breakout', setup: 'Cup and Handle', entry_price: 500, exit_price: 530, stop_loss: 485, pl: 3000, pl_percent: 6.0, r_multiple: 2.0, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'TREND_UP', volatility_regime: 'expansion', followed_plan: true, day_of_week: 3 },
  { symbol: 'GOOGL', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Breakout', setup: 'Bull Flag', entry_price: 150, exit_price: 148, stop_loss: 145, pl: -200, pl_percent: -1.33, r_multiple: -0.4, outcome: 'breakeven', exit_reason: 'sl', close_source: 'manual', regime: 'TREND_UP', volatility_regime: 'normal', followed_plan: true, day_of_week: 1 },
  { symbol: 'META', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Breakout', setup: 'Ascending Triangle', entry_price: 520, exit_price: 540, stop_loss: 510, pl: 2000, pl_percent: 3.85, r_multiple: 2.0, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'TREND_UP', volatility_regime: 'normal', followed_plan: true, day_of_week: 4 },
  { symbol: 'AMZN', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Breakout', setup: 'Bull Flag', entry_price: 185, exit_price: 192, stop_loss: 180, pl: 700, pl_percent: 3.78, r_multiple: 1.4, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'TREND_UP', volatility_regime: 'normal', followed_plan: true, day_of_week: 1 },
  { symbol: 'TSLA', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'breakout', setup: 'bull flag', entry_price: 250, exit_price: 240, stop_loss: 238, pl: -1000, pl_percent: -4.0, r_multiple: -0.83, outcome: 'loss', exit_reason: 'sl', close_source: 'manual', regime: 'RANGE_NEUTRAL', volatility_regime: 'compression', followed_plan: true, day_of_week: 5 },
  { symbol: 'AAPL', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'BREAKOUT', setup: 'BULL FLAG', entry_price: 175, exit_price: 185, stop_loss: 170, pl: 1000, pl_percent: 5.71, r_multiple: 2.0, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'TREND_UP', volatility_regime: 'normal', followed_plan: true, day_of_week: 2 },

  // --- Mean Reversion strategy, mixed outcomes ---
  { symbol: 'SPY', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Mean Reversion', setup: 'Oversold Bounce', entry_price: 450, exit_price: 458, stop_loss: 445, pl: 800, pl_percent: 1.78, r_multiple: 1.6, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'RANGE_NEUTRAL', volatility_regime: 'compression', followed_plan: true, day_of_week: 3 },
  { symbol: 'QQQ', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Mean Reversion', setup: 'Oversold Bounce', entry_price: 380, exit_price: 375, stop_loss: 373, pl: -500, pl_percent: -1.32, r_multiple: -0.71, outcome: 'loss', exit_reason: 'sl', close_source: 'manual', regime: 'TREND_DOWN', volatility_regime: 'expansion', followed_plan: true, day_of_week: 4 },
  { symbol: 'IWM', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Mean Reversion', setup: 'Oversold Bounce', entry_price: 200, exit_price: 198, stop_loss: 196, pl: -200, pl_percent: -1.0, r_multiple: -0.5, outcome: 'loss', exit_reason: 'sl', close_source: 'manual', regime: 'TREND_DOWN', volatility_regime: 'expansion', followed_plan: false, day_of_week: 1 },
  { symbol: 'DIA', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Mean Reversion', setup: 'Gap Fill', entry_price: 390, exit_price: 396, stop_loss: 386, pl: 600, pl_percent: 1.54, r_multiple: 1.5, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'RANGE_NEUTRAL', volatility_regime: 'normal', followed_plan: true, day_of_week: 2 },

  // --- Crypto trades ---
  { symbol: 'BTC-USD', asset_class: 'crypto', side: 'LONG', trade_type: 'Spot', strategy: 'Breakout', setup: 'Range Break', entry_price: 60000, exit_price: 66000, stop_loss: 57000, pl: 6000, pl_percent: 10.0, r_multiple: 2.0, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'VOL_EXPANSION', volatility_regime: 'expansion', followed_plan: true, day_of_week: 0 },
  { symbol: 'ETH-USD', asset_class: 'crypto', side: 'LONG', trade_type: 'Spot', strategy: 'Breakout', setup: 'Range Break', entry_price: 3500, exit_price: 3200, stop_loss: 3200, pl: -300, pl_percent: -8.57, r_multiple: -1.0, outcome: 'loss', exit_reason: 'sl', close_source: 'manual', regime: 'VOL_EXPANSION', volatility_regime: 'expansion', followed_plan: true, day_of_week: 6 },
  { symbol: 'SOL-USD', asset_class: 'crypto', side: 'LONG', trade_type: 'Spot', strategy: 'Breakout', setup: 'Ascending Triangle', entry_price: 130, exit_price: 155, stop_loss: 120, pl: 2500, pl_percent: 19.23, r_multiple: 2.5, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'TREND_UP', volatility_regime: 'expansion', followed_plan: true, day_of_week: 1 },
  { symbol: 'BTC-USD', asset_class: 'crypto', side: 'SHORT', trade_type: 'Futures', strategy: 'Breakdown', setup: 'Bear Flag', entry_price: 65000, exit_price: 60000, stop_loss: 68000, pl: 5000, pl_percent: 7.69, r_multiple: 1.67, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'TREND_DOWN', volatility_regime: 'expansion', followed_plan: true, day_of_week: 3 },
  { symbol: 'ETH-USD', asset_class: 'crypto', side: 'SHORT', trade_type: 'Futures', strategy: 'Breakdown', setup: 'Bear Flag', entry_price: 3400, exit_price: 3500, stop_loss: 3550, pl: -100, pl_percent: -2.94, r_multiple: -0.67, outcome: 'loss', exit_reason: 'sl', close_source: 'manual', regime: 'RANGE_NEUTRAL', volatility_regime: 'normal', followed_plan: true, day_of_week: 4 },

  // --- Trades with NO r_multiple (P&L fallback test) ---
  { symbol: 'AAPL', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Scalp', setup: null, entry_price: 172, exit_price: 174, stop_loss: null, pl: 200, pl_percent: 1.16, r_multiple: null, outcome: 'open', exit_reason: 'manual', close_source: 'manual', regime: null, volatility_regime: null, followed_plan: null, day_of_week: 1 },
  { symbol: 'TSLA', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Scalp', setup: null, entry_price: 255, exit_price: 250, stop_loss: null, pl: -500, pl_percent: -1.96, r_multiple: null, outcome: 'open', exit_reason: 'manual', close_source: 'manual', regime: null, volatility_regime: null, followed_plan: null, day_of_week: 2 },
  { symbol: 'MSFT', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Scalp', setup: null, entry_price: 385, exit_price: 385, stop_loss: null, pl: 0, pl_percent: 0, r_multiple: null, outcome: 'open', exit_reason: 'manual', close_source: 'manual', regime: null, volatility_regime: null, followed_plan: null, day_of_week: 3 },

  // --- Short trades ---
  { symbol: 'SHOP', asset_class: 'equity', side: 'SHORT', trade_type: 'Spot', strategy: 'Breakdown', setup: 'Bear Flag', entry_price: 80, exit_price: 72, stop_loss: 84, pl: 800, pl_percent: 10.0, r_multiple: 2.0, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'TREND_DOWN', volatility_regime: 'expansion', followed_plan: true, day_of_week: 2 },
  { symbol: 'COIN', asset_class: 'equity', side: 'SHORT', trade_type: 'Spot', strategy: 'Breakdown', setup: 'Head and Shoulders', entry_price: 250, exit_price: 260, stop_loss: 265, pl: -1000, pl_percent: -4.0, r_multiple: -0.67, outcome: 'loss', exit_reason: 'sl', close_source: 'manual', regime: 'RANGE_NEUTRAL', volatility_regime: 'normal', followed_plan: true, day_of_week: 5 },

  // --- Auto-closed trades ---
  { symbol: 'AMD', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Breakout', setup: 'Bull Flag', entry_price: 140, exit_price: 135, stop_loss: 132, pl: -500, pl_percent: -3.57, r_multiple: -0.63, outcome: 'loss', exit_reason: 'time', close_source: 'mark', regime: 'RANGE_NEUTRAL', volatility_regime: 'compression', followed_plan: true, day_of_week: 1 },
  { symbol: 'PLTR', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Breakout', setup: 'Cup and Handle', entry_price: 25, exit_price: 22, stop_loss: 23, pl: -300, pl_percent: -12.0, r_multiple: -1.5, outcome: 'loss', exit_reason: 'drawdown', close_source: 'mark', regime: 'RISK_OFF_STRESS', volatility_regime: 'climax', followed_plan: true, day_of_week: 4 },

  // --- More Breakout trades to reach threshold ---
  { symbol: 'CRM', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Breakout', setup: 'Bull Flag', entry_price: 260, exit_price: 275, stop_loss: 252, pl: 1500, pl_percent: 5.77, r_multiple: 1.88, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'TREND_UP', volatility_regime: 'normal', followed_plan: true, day_of_week: 3 },
  { symbol: 'NOW', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Breakout', setup: 'Ascending Triangle', entry_price: 680, exit_price: 710, stop_loss: 665, pl: 3000, pl_percent: 4.41, r_multiple: 2.0, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'TREND_UP', volatility_regime: 'normal', followed_plan: true, day_of_week: 2 },

  // --- Options trades ---
  { symbol: 'AAPL', asset_class: 'equity', side: 'LONG', trade_type: 'Options', strategy: 'Breakout', setup: 'Bull Flag', entry_price: 5.5, exit_price: 9.0, stop_loss: 3.0, pl: 350, pl_percent: 63.64, r_multiple: 1.4, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'TREND_UP', volatility_regime: 'expansion', followed_plan: true, day_of_week: 1 },
  { symbol: 'TSLA', asset_class: 'equity', side: 'LONG', trade_type: 'Options', strategy: 'Breakout', setup: 'Gap Up', entry_price: 12.0, exit_price: 4.0, stop_loss: 6.0, pl: -800, pl_percent: -66.67, r_multiple: -1.33, outcome: 'loss', exit_reason: 'time', close_source: 'manual', regime: 'VOL_CONTRACTION', volatility_regime: 'compression', followed_plan: false, day_of_week: 5 },

  // --- More LONG trades to balance ---
  { symbol: 'V', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Mean Reversion', setup: 'Oversold Bounce', entry_price: 270, exit_price: 278, stop_loss: 264, pl: 800, pl_percent: 2.96, r_multiple: 1.33, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'RANGE_NEUTRAL', volatility_regime: 'normal', followed_plan: true, day_of_week: 3 },
  { symbol: 'MA', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Mean Reversion', setup: 'Gap Fill', entry_price: 460, exit_price: 470, stop_loss: 453, pl: 1000, pl_percent: 2.17, r_multiple: 1.43, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'RANGE_NEUTRAL', volatility_regime: 'compression', followed_plan: true, day_of_week: 4 },

  // --- Forex trades to test asset_class dimension ---
  { symbol: 'EURUSD', asset_class: 'forex', side: 'LONG', trade_type: 'Spot', strategy: 'Breakout', setup: 'Range Break', entry_price: 1.08, exit_price: 1.095, stop_loss: 1.07, pl: 150, pl_percent: 1.39, r_multiple: 1.5, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'TREND_UP', volatility_regime: 'normal', followed_plan: true, day_of_week: 2 },
  { symbol: 'GBPUSD', asset_class: 'forex', side: 'SHORT', trade_type: 'Spot', strategy: 'Breakdown', setup: 'Double Top', entry_price: 1.27, exit_price: 1.255, stop_loss: 1.28, pl: 150, pl_percent: 1.18, r_multiple: 1.5, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'TREND_DOWN', volatility_regime: 'normal', followed_plan: true, day_of_week: 3 },
  { symbol: 'USDJPY', asset_class: 'forex', side: 'LONG', trade_type: 'Spot', strategy: 'Breakout', setup: 'Range Break', entry_price: 148, exit_price: 146, stop_loss: 147, pl: -200, pl_percent: -1.35, r_multiple: -2.0, outcome: 'loss', exit_reason: 'sl', close_source: 'manual', regime: 'RISK_OFF_STRESS', volatility_regime: 'climax', followed_plan: true, day_of_week: 5 },

  // --- Commodity trade ---
  { symbol: 'GC', asset_class: 'commodity', side: 'LONG', trade_type: 'Futures', strategy: 'Breakout', setup: 'All Time High', entry_price: 2050, exit_price: 2120, stop_loss: 2020, pl: 7000, pl_percent: 3.41, r_multiple: 2.33, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'TREND_UP', volatility_regime: 'expansion', followed_plan: true, day_of_week: 1 },

  // --- Edge case: "scratch" outcome from UI ---
  { symbol: 'NFLX', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Breakout', setup: 'Bull Flag', entry_price: 600, exit_price: 601, stop_loss: 590, pl: 100, pl_percent: 0.17, r_multiple: 0.1, outcome: 'scratch', exit_reason: 'manual', close_source: 'manual', regime: 'RANGE_NEUTRAL', volatility_regime: 'compression', followed_plan: true, day_of_week: 4 },

  // --- More to help strategies meet threshold ---
  { symbol: 'MRVL', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'mean reversion', setup: 'oversold bounce', entry_price: 65, exit_price: 70, stop_loss: 62, pl: 500, pl_percent: 7.69, r_multiple: 1.67, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'RANGE_NEUTRAL', volatility_regime: 'normal', followed_plan: true, day_of_week: 1 },
  { symbol: 'AVGO', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Mean reversion', setup: 'Oversold bounce', entry_price: 140, exit_price: 135, stop_loss: 133, pl: -500, pl_percent: -3.57, r_multiple: -0.71, outcome: 'loss', exit_reason: 'sl', close_source: 'manual', regime: 'TREND_DOWN', volatility_regime: 'expansion', followed_plan: false, day_of_week: 4 },
  { symbol: 'INTC', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Mean Reversion', setup: 'Oversold Bounce', entry_price: 30, exit_price: 33, stop_loss: 28, pl: 300, pl_percent: 10.0, r_multiple: 1.5, outcome: 'win', exit_reason: 'tp', close_source: 'manual', regime: 'RANGE_NEUTRAL', volatility_regime: 'compression', followed_plan: true, day_of_week: 2 },
  { symbol: 'MU', asset_class: 'equity', side: 'LONG', trade_type: 'Spot', strategy: 'Mean Reversion', setup: 'Oversold Bounce', entry_price: 85, exit_price: 82, stop_loss: 81, pl: -300, pl_percent: -3.53, r_multiple: -0.75, outcome: 'loss', exit_reason: 'sl', close_source: 'manual', regime: 'TREND_DOWN', volatility_regime: 'expansion', followed_plan: true, day_of_week: 5 },
];

/* ── Simulate the ingestion pipeline ────────────────────────────────────── */

interface ProcessedTrade extends MockTrade {
  computed_outcome: string;
  computed_label: OutcomeLabel;
  normalized_strategy: string | null;
  normalized_setup: string | null;
}

function processTrades(trades: MockTrade[]): ProcessedTrade[] {
  return trades.map(t => {
    const rMul = t.r_multiple;
    const pl = t.pl;
    const outcome = t.outcome && t.outcome !== 'open'
      ? t.outcome
      : deriveOutcome(rMul, pl);
    const label = classifyOutcome(rMul, pl);
    return {
      ...t,
      computed_outcome: outcome,
      computed_label: label,
      normalized_strategy: t.strategy?.toLowerCase().trim() || null,
      normalized_setup: t.setup?.toLowerCase().trim() || null,
    };
  });
}

/* ── Simulate SQL aggregation locally ───────────────────────────────────── */

function aggregateByDimension(
  trades: ProcessedTrade[],
  dimension: EdgeDimension
): AggRow[] {
  // Only include win/loss/breakeven (matching SQL WHERE clause)
  const validTrades = trades.filter(t =>
    ['win', 'loss', 'breakeven'].includes(t.computed_outcome)
  );

  if (dimension === 'overall') {
    return [aggregateGroup('overall', validTrades)];
  }

  const groups = new Map<string, ProcessedTrade[]>();
  for (const t of validTrades) {
    let key: string | null = null;
    switch (dimension) {
      case 'asset_class': key = t.asset_class; break;
      case 'side': key = t.side; break;
      case 'strategy': key = t.normalized_strategy; break;
      case 'setup': key = t.normalized_setup; break;
      case 'regime': key = t.regime; break;
      case 'volatility_regime': key = t.volatility_regime; break;
      case 'day_of_week': key = String(t.day_of_week); break;
      case 'exit_reason': key = t.exit_reason; break;
      case 'trade_type': key = t.trade_type; break;
    }
    if (key == null) key = '(null)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  return Array.from(groups.entries())
    .map(([key, g]) => aggregateGroup(key, g))
    .sort((a, b) => b.sample_size - a.sample_size);
}

function aggregateGroup(dimValue: string, trades: ProcessedTrade[]): AggRow {
  const n = trades.length;
  const wins = trades.filter(t => t.computed_outcome === 'win').length;
  const losses = trades.filter(t => t.computed_outcome === 'loss').length;
  const breakevens = trades.filter(t => t.computed_outcome === 'breakeven').length;
  const big_wins = trades.filter(t => t.computed_label === 'big_win').length;
  const small_wins = trades.filter(t => t.computed_label === 'small_win').length;
  const small_losses = trades.filter(t => t.computed_label === 'small_loss').length;
  const big_losses = trades.filter(t => t.computed_label === 'big_loss').length;

  const rValues = trades.map(t => t.r_multiple).filter((v): v is number => v != null);
  const avg_r = rValues.length > 0 ? rValues.reduce((s, v) => s + v, 0) / rValues.length : 0;
  const avg_pl_pct = trades.reduce((s, t) => s + t.pl_percent, 0) / n;
  const gross_win_r = rValues.filter(v => v > 0).reduce((s, v) => s + v, 0);
  const gross_loss_r = Math.abs(rValues.filter(v => v < 0).reduce((s, v) => s + v, 0));
  const best_r = rValues.length > 0 ? Math.max(...rValues) : 0;
  const worst_r = rValues.length > 0 ? Math.min(...rValues) : 0;
  const outcomes_list = trades.map(t => t.computed_outcome).join(',');

  return {
    dim_value: dimValue, sample_size: n, wins, losses, breakevens,
    big_wins, small_wins, small_losses, big_losses,
    avg_r, avg_pl_pct, gross_win_r, gross_loss_r, best_r, worst_r,
    avg_hold_m: null, outcomes_list,
  };
}

/* ── Run Tests ──────────────────────────────────────────────────────────── */

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`    ✗ FAIL: ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function section(title: string) {
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`  ${title}`);
  console.log(`══════════════════════════════════════════════════════════════`);
}

// ═══════════════════════ TEST 1: Outcome Classifier ═══════════════════════
section('TEST 1: Outcome Classifier — R-multiple boundaries');

assert(classifyOutcome(2.0) === 'big_win', 'R=2.0 → big_win');
assert(classifyOutcome(2.5) === 'big_win', 'R=2.5 → big_win');
assert(classifyOutcome(0.5) === 'small_win', 'R=0.5 → small_win');
assert(classifyOutcome(1.99) === 'small_win', 'R=1.99 → small_win');
assert(classifyOutcome(0.0) === 'breakeven', 'R=0.0 → breakeven');
assert(classifyOutcome(0.49) === 'breakeven', 'R=0.49 → breakeven');
assert(classifyOutcome(-0.49) === 'breakeven', 'R=-0.49 → breakeven');
assert(classifyOutcome(-0.5) === 'small_loss', 'R=-0.5 → small_loss');
assert(classifyOutcome(-1.0) === 'small_loss', 'R=-1.0 → small_loss');
assert(classifyOutcome(-1.01) === 'big_loss', 'R=-1.01 → big_loss');
assert(classifyOutcome(-3.0) === 'big_loss', 'R=-3.0 → big_loss');

section('TEST 2: Outcome Classifier — P&L fallback');
assert(classifyOutcome(null, 500) === 'small_win', 'R=null, PL=500 → small_win');
assert(classifyOutcome(null, -200) === 'small_loss', 'R=null, PL=-200 → small_loss');
assert(classifyOutcome(null, 0) === 'breakeven', 'R=null, PL=0 → breakeven');
assert(classifyOutcome(undefined, null) === 'breakeven', 'R=undef, PL=null → breakeven');
assert(classifyOutcome(null, null) === 'breakeven', 'R=null, PL=null → breakeven');
assert(classifyOutcome(NaN, 100) === 'small_win', 'R=NaN, PL=100 → small_win (fallback)');
assert(classifyOutcome(Infinity, 100) === 'big_win', 'R=Infinity → big_win (isFinite fails, falls through)');
// Important: R=Infinity → isFinite check fails → falls to pl fallback
assert(classifyOutcome(Infinity, null) === 'breakeven', 'R=Infinity, PL=null → breakeven');

section('TEST 3: deriveOutcome — P&L fallback');
assert(deriveOutcome(null, 500) === 'win', 'R=null, PL=500 → win');
assert(deriveOutcome(null, -200) === 'loss', 'R=null, PL=-200 → loss');
assert(deriveOutcome(null, 0) === 'breakeven', 'R=null, PL=0 → breakeven');
assert(deriveOutcome(0.3, 500) === 'breakeven', 'R=0.3, PL=500 → breakeven (R takes priority)');
assert(deriveOutcome(-0.3, -500) === 'breakeven', 'R=-0.3, PL=-500 → breakeven (R zone)');

// ═══════════════════════ TEST 4: "scratch" outcome ═══════════════════════
section('TEST 4: "scratch" outcome handling');
// "scratch" is not in ('win','loss','breakeven') — it will be filtered out by SQL WHERE clause
const scratchTrade = MOCK_TRADES.find(t => t.outcome === 'scratch')!;
const processed = processTrades([scratchTrade])[0];
assert(processed.computed_outcome === 'scratch', 'scratch outcome preserved (not overridden)');
// But it won't appear in edge profile aggregation since SQL filters outcome IN ('win','loss','breakeven')
const scratchAgg = aggregateByDimension([processed], 'overall');
assert(scratchAgg[0].sample_size === 0, 'scratch excluded from aggregation');
console.log('    ⚠ FINDING: "scratch" outcome from UI is excluded from edge profile');
console.log('      → Trades with outcome="scratch" are invisible to analytics');

// ═══════════════════════ TEST 5: Strategy normalization ═══════════════════
section('TEST 5: Strategy/setup normalization');
const allProcessed = processTrades(MOCK_TRADES);
const breakoutVariants = allProcessed.filter(t =>
  t.strategy && ['breakout', 'BREAKOUT', 'Breakout'].includes(t.strategy)
);
const normalizedStrategies = new Set(breakoutVariants.map(t => t.normalized_strategy));
assert(normalizedStrategies.size === 1, `All Breakout variants normalize to 1 value`, `got ${[...normalizedStrategies]}`);
assert(normalizedStrategies.has('breakout'), 'Normalized to "breakout"');

const meanRevVariants = allProcessed.filter(t =>
  t.strategy && t.strategy.toLowerCase().includes('mean rev')
);
const normMR = new Set(meanRevVariants.map(t => t.normalized_strategy));
assert(normMR.size === 1, `All Mean Reversion variants normalize to 1`, `got ${[...normMR]}`);

// ═══════════════════════ TEST 6: Dimension validation ════════════════════
section('TEST 6: Dimension validation (SQL injection prevention)');
assert(isValidDimension('overall') === true, 'overall is valid');
assert(isValidDimension('strategy') === true, 'strategy is valid');
assert(isValidDimension('side') === true, 'side is valid');
assert(isValidDimension('anything_else') === false, 'arbitrary string rejected');
assert(isValidDimension("'; DROP TABLE--") === false, 'SQL injection rejected');
assert(isValidDimension('') === false, 'empty string rejected');
assert(isValidDimension('STRATEGY') === false, 'case-sensitive: STRATEGY rejected');

// ═══════════════════════ TEST 7: Confidence scoring ══════════════════════
section('TEST 7: Confidence scoring curve');
assert(statConfidence(0, 10) === 0, 'n=0 → confidence=0');
assert(statConfidence(4, 10) === 0, 'n=4 (< threshold/2) → confidence=0');
assert(statConfidence(5, 10) === 0, 'n=5 (= threshold/2) → confidence=0');
assert(statConfidence(6, 10) > 0, 'n=6 (> threshold/2) → confidence > 0');
assert(statConfidence(10, 10) > 0 && statConfidence(10, 10) < 1, 'n=10 → 0 < confidence < 1');
assert(statConfidence(30, 10) === 1, 'n=30 (= 3×threshold) → confidence=1');
assert(statConfidence(100, 10) === 1, 'n=100 → confidence=1');

const conf10 = statConfidence(10, 10);
const conf20 = statConfidence(20, 10);
assert(conf20 > conf10, `n=20 (${conf20.toFixed(2)}) > n=10 (${conf10.toFixed(2)})`);
console.log(`    Confidence curve: n=6→${statConfidence(6,10).toFixed(2)}, n=10→${conf10.toFixed(2)}, n=15→${statConfidence(15,10).toFixed(2)}, n=20→${conf20.toFixed(2)}, n=30→1.00`);

// ═══════════════════════ TEST 8: Full edge profile simulation ═════════════
section('TEST 8: Full edge profile simulation');

const validTrades = allProcessed.filter(t =>
  ['win', 'loss', 'breakeven'].includes(t.computed_outcome)
);
console.log(`    Total mock trades: ${MOCK_TRADES.length}`);
console.log(`    Valid for analytics: ${validTrades.length} (excl. scratch, open→derived)`);

const DIMS: EdgeDimension[] = [
  'overall', 'asset_class', 'side', 'strategy', 'setup',
  'regime', 'volatility_regime', 'day_of_week', 'exit_reason', 'trade_type',
];

const allSlices: EdgeSlice[] = [];
for (const dim of DIMS) {
  const rows = aggregateByDimension(allProcessed, dim);
  for (const row of rows) {
    allSlices.push(buildSlice(dim, row, MIN_SAMPLE_SIZE));
  }
}

// Overall stats
const overall = allSlices.find(s => s.dimension === 'overall')!;
console.log(`\n    ── Overall Stats ──`);
console.log(`    Total trades:    ${overall.sampleSize}`);
console.log(`    Win rate:        ${(overall.winRate * 100).toFixed(1)}%`);
console.log(`    Avg R:           ${overall.avgR.toFixed(3)}`);
console.log(`    Profit factor:   ${overall.profitFactor === Infinity ? '∞' : overall.profitFactor.toFixed(2)}`);
console.log(`    Expectancy:      ${overall.expectancy.toFixed(4)}`);
console.log(`    Confidence:      ${overall.confidence.toFixed(2)}`);
console.log(`    Best R:          ${overall.bestR.toFixed(2)}`);
console.log(`    Worst R:         ${overall.worstR.toFixed(2)}`);

assert(overall.winRate > 0.5, `Win rate > 50% (${(overall.winRate * 100).toFixed(1)}%)`);
assert(overall.avgR > 0, `Avg R positive (${overall.avgR.toFixed(3)})`);
assert(overall.expectancy > 0, `Expectancy positive (${overall.expectancy.toFixed(4)})`);
assert(overall.profitFactor > 1, `Profit factor > 1 (${overall.profitFactor.toFixed(2)})`);
assert(overall.confidence > 0, 'Overall confidence > 0');
assert(overall.meetsThreshold, 'Overall meets MIN_SAMPLE_SIZE');

// ═══════════════════════ TEST 9: Dimension analysis ══════════════════════
section('TEST 9: Dimension-level analysis');

for (const dim of DIMS) {
  if (dim === 'overall') continue;
  const dimSlices = allSlices.filter(s => s.dimension === dim);
  const metThreshold = dimSlices.filter(s => s.meetsThreshold);
  const totalSamples = dimSlices.reduce((s, sl) => s + sl.sampleSize, 0);

  console.log(`\n    ── ${dim} ── (${dimSlices.length} groups, ${metThreshold.length} meet threshold)`);
  for (const s of dimSlices) {
    const flag = s.meetsThreshold ? '✓' : '○';
    const wr = (s.winRate * 100).toFixed(0);
    const exp = s.expectancy.toFixed(3);
    const conf = (s.confidence * 100).toFixed(0);
    console.log(`      ${flag} ${s.value.padEnd(22)} n=${String(s.sampleSize).padStart(3)} WR=${wr.padStart(3)}% ExpR=${exp.padStart(7)} conf=${conf.padStart(3)}%`);
  }

  // Check: no dimension group should have more trades than overall
  for (const s of dimSlices) {
    assert(s.sampleSize <= overall.sampleSize,
      `${dim}:${s.value} size (${s.sampleSize}) <= overall (${overall.sampleSize})`);
  }
}

// ═══════════════════════ TEST 10: Top Edges / Weak Spots ═════════════════
section('TEST 10: Top edges & weak spots');

const qualified = allSlices.filter(s => s.meetsThreshold && s.dimension !== 'overall');
const topEdges = [...qualified].sort((a, b) => b.expectancy - a.expectancy).slice(0, 5);
const weakSpots = [...qualified].filter(s => s.expectancy < 0).sort((a, b) => a.expectancy - b.expectancy).slice(0, 5);

console.log('\n    ── Top 5 Edges (by expectancy) ──');
for (const e of topEdges) {
  console.log(`    ✦ ${e.dimension}:${e.value} → ExpR=${e.expectancy.toFixed(3)}, WR=${(e.winRate*100).toFixed(0)}%, n=${e.sampleSize}, conf=${(e.confidence*100).toFixed(0)}%`);
}

console.log('\n    ── Weak Spots (negative expectancy, meets threshold) ──');
if (weakSpots.length === 0) {
  console.log('    (none — no dimension with negative expectancy meets threshold)');
} else {
  for (const w of weakSpots) {
    console.log(`    ✗ ${w.dimension}:${w.value} → ExpR=${w.expectancy.toFixed(3)}, WR=${(w.winRate*100).toFixed(0)}%, n=${w.sampleSize}, conf=${(w.confidence*100).toFixed(0)}%`);
  }
}

// Sanity: top edge should have positive expectancy
if (topEdges.length > 0) {
  assert(topEdges[0].expectancy > 0, `Top edge has positive expectancy (${topEdges[0].expectancy.toFixed(3)})`);
}

// ═══════════════════════ TEST 11: Null regime handling ════════════════════
section('TEST 11: Null/missing regime handling');
const regimeSlices = allSlices.filter(s => s.dimension === 'regime');
const nullRegime = regimeSlices.find(s => s.value === '(null)');
if (nullRegime) {
  console.log(`    ⚠ ${nullRegime.sampleSize} trades have null regime`);
  console.log(`      → These form a "(null)" bucket in the regime dimension`);
  console.log(`      → Insight cards referencing regime will include null-bucket stats`);
}
const nonNullRegimes = regimeSlices.filter(s => s.value !== '(null)');
console.log(`    Regime values found: ${nonNullRegimes.map(s => s.value).join(', ')}`);

// ═══════════════════════ TEST 12: P&L fallback trades ════════════════════
section('TEST 12: P&L fallback classification');
const noRtrades = allProcessed.filter(t => t.r_multiple == null);
console.log(`    Trades with null R-multiple: ${noRtrades.length}`);
for (const t of noRtrades) {
  console.log(`      ${t.symbol}: PL=$${t.pl}, outcome="${t.computed_outcome}", label="${t.computed_label}"`);
  if (t.pl > 0) {
    assert(t.computed_outcome === 'win', `PL>0 → outcome=win for ${t.symbol}`);
    assert(t.computed_label === 'small_win', `PL>0, no R → label=small_win for ${t.symbol}`);
  } else if (t.pl < 0) {
    assert(t.computed_outcome === 'loss', `PL<0 → outcome=loss for ${t.symbol}`);
    assert(t.computed_label === 'small_loss', `PL<0, no R → label=small_loss for ${t.symbol}`);
  } else {
    assert(t.computed_outcome === 'breakeven', `PL=0 → outcome=breakeven for ${t.symbol}`);
  }
}

// ═══════════════════════ TEST 13: Expectancy formula correctness ═════════
section('TEST 13: Expectancy formula verification');
// Manual expectancy = avgWinR * winRate - avgLossR * lossRate
// For overall: compute manually and compare
const oWinRate = overall.winRate;
const oLossRate = overall.sampleSize > 0 ? (overall.sampleSize - overall.wins - overall.breakevens) / overall.sampleSize : 0;
const oAvgWinR = overall.wins > 0 ? overall.grossWinR / overall.wins : 0;
const oAvgLossR = overall.losses > 0 ? overall.grossLossR / overall.losses : 0;

// We need to get grossWinR and grossLossR from the raw data
const rValuesAll = validTrades.map(t => t.r_multiple).filter((v): v is number => v != null);
const grossWinR = rValuesAll.filter(v => v > 0).reduce((s, v) => s + v, 0);
const grossLossR = Math.abs(rValuesAll.filter(v => v < 0).reduce((s, v) => s + v, 0));
const winsCount = validTrades.filter(t => t.computed_outcome === 'win').length;
const lossesCount = validTrades.filter(t => t.computed_outcome === 'loss').length;
const totalCount = validTrades.length;

const manualWinRate = winsCount / totalCount;
const manualLossRate = lossesCount / totalCount;
const manualAvgWinR = winsCount > 0 ? grossWinR / winsCount : 0;
const manualAvgLossR = lossesCount > 0 ? grossLossR / lossesCount : 0;
const manualExpectancy = manualAvgWinR * manualWinRate - manualAvgLossR * manualLossRate;

console.log(`    Manual: avgWinR=${manualAvgWinR.toFixed(3)} × WR=${manualWinRate.toFixed(3)} - avgLossR=${manualAvgLossR.toFixed(3)} × LR=${manualLossRate.toFixed(3)}`);
console.log(`    Manual expectancy: ${manualExpectancy.toFixed(4)}`);
console.log(`    Engine expectancy: ${overall.expectancy.toFixed(4)}`);
assert(Math.abs(manualExpectancy - overall.expectancy) < 0.001,
  `Expectancy matches manual calc (diff=${Math.abs(manualExpectancy - overall.expectancy).toFixed(6)})`);

// ═══════════════════════ TEST 14: Avg R dilution from null R-multiples ═══
section('TEST 14: Avg R dilution analysis');
// Trades with null R are excluded from AVG(r_multiple) in Postgres (NULL skipping)
// but in our local sim with filter, they're also excluded
const withR = validTrades.filter(t => t.r_multiple != null);
const withoutR = validTrades.filter(t => t.r_multiple == null);
const avgR_withR = withR.length > 0 ? withR.reduce((s, t) => s + t.r_multiple!, 0) / withR.length : 0;

console.log(`    Trades with R-multiple:    ${withR.length}`);
console.log(`    Trades without R-multiple: ${withoutR.length}`);
console.log(`    Avg R (trades with R):     ${avgR_withR.toFixed(3)}`);
console.log(`    Avg R (engine, same):      ${overall.avgR.toFixed(3)}`);

if (withoutR.length > 0) {
  console.log(`    ⚠ Note: ${withoutR.length} trades have null R → excluded from AVG(r_multiple)`);
  console.log(`      → But their outcome (win/loss via P&L) IS counted in win rate`);
  console.log(`      → This means win rate and avg R use different denominators`);
  console.log(`      → Win rate = ${winsCount}/${totalCount}, Avg R = sum(R)/${withR.length}`);

  if (Math.abs(withR.length - totalCount) > 0) {
    console.log(`      → MISMATCH: win rate denom (${totalCount}) ≠ avg R denom (${withR.length})`);
    console.log(`      → Expectancy formula uses win rate but avg R from different pools`);
  }
}

// ═══════════════════════ TEST 15: Streak correctness ═════════════════════
section('TEST 15: Streak calculation');
assert(maxStreak('win,win,win,loss,win', 'win') === 3, 'WWW-L-W → max win streak 3');
assert(maxStreak('loss,loss,win,loss,loss,loss', 'loss') === 3, 'LL-W-LLL → max loss streak 3');
assert(maxStreak('', 'win') === 0, 'empty → 0');
assert(maxStreak('win', 'win') === 1, 'single win → 1');
assert(maxStreak('breakeven,breakeven', 'win') === 0, 'no wins → 0');

// ═══════════════════════ RESULTS ═════════════════════════════════════════
section('RESULTS');
console.log(`    Passed: ${passed}`);
console.log(`    Failed: ${failed}`);
console.log(`    Total:  ${passed + failed}`);

if (failed > 0) {
  console.log('\n    ⚠ SOME TESTS FAILED — see above for details');
  process.exit(1);
} else {
  console.log('\n    ✓ ALL TESTS PASSED');
}

// ═══════════════════════ FINDINGS SUMMARY ════════════════════════════════
section('FINDINGS SUMMARY');

console.log(`
    1. OUTCOME TAXONOMY ISSUE: "scratch" from CloseTradeModal
       - The UI offers "scratch" as an outcome option
       - SQL WHERE clause filters on outcome IN ('win','loss','breakeven')
       - Scratch trades are INVISIBLE to the edge profile
       - FIX: Map "scratch" → "breakeven" during ingestion
    
    2. AVG R vs WIN RATE DENOMINATOR MISMATCH
       - Trades with null R-multiple are excluded from AVG(r_multiple) [SQL NULL skip]
       - But they ARE included in win/loss counts via P&L fallback
       - Expectancy formula mixes: avgWinR (from R-having trades) × winRate (from all trades)
       - Risk: With many null-R trades, expectancy can be misleadingly high/low
       - Severity: Low for now (most trades have R), but grows with manual entries
    
    3. STRATEGY/SETUP: Free-form text normalization verified working
       - toLowerCase().trim() correctly collapses "Breakout"/"BREAKOUT"/"breakout"
       - But "Bull Flag" and "bull flag" already collapse (good)
       - Remaining risk: "EMA Cross" vs "EMA Crossover" are DIFFERENT buckets
       - v3.2 could add fuzzy matching or canonical strategy enum
    
    4. REGIME DATA: Mostly null for manual journal entries
       - Only trades with entry-phase snapshots get regime data
       - Scanner-originated trades MAY have it, manual entries won't
       - The "(null)" regime bucket will dominate for most users
       - Regime-based insights will only fire for users who use snapshots
    
    5. "open" OUTCOME OVERRIDE: Correctly handled
       - deriveOutcome() with P&L fallback correctly classifies "open" outcomes
       - But "scratch" bypasses this because it's not "open"
    
    6. PROFIT FACTOR: Can be Infinity (no losses in a group)
       - buildSlice returns Infinity when gross_loss_r === 0
       - EdgeInsightCards.tsx should display "∞" not "Infinity"
    
    7. CONFIDENCE LEVELS: Appropriate and clearly scaled
       - n=5: 0% (below threshold/2)
       - n=10: ${(statConfidence(10,10)*100).toFixed(0)}% (at threshold)
       - n=15: ${(statConfidence(15,10)*100).toFixed(0)}%
       - n=30+: 100%
       - Correctly prevents small-sample insights from appearing authoritative
`);
