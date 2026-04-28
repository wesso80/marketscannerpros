export const BACKTEST_SLIPPAGE_BPS = 5;

export type BacktestSampleQuality = 'thin' | 'developing' | 'adequate';

export interface BacktestAssumptionsMetadata {
  version: 'backtest_assumptions_v1';
  strategyId: string;
  timeframe: string;
  assetType: 'stock' | 'crypto';
  fillModel: {
    label: 'historical_bar_simulation';
    entryTiming: string;
    exitTiming: string;
    intrabarPriority: string;
    intrabarAmbiguity: string;
    endOfDataExit: string;
  };
  costs: {
    slippageBps: number;
    slippageApplied: true;
    spreadModel: 'not_modeled';
    commissionModel: 'not_modeled';
    feeModel: 'not_modeled';
    borrowCostsModel: 'not_modeled';
    marketImpactModel: 'not_modeled';
  };
  liquidity: {
    volumeData: 'available' | 'unavailable';
    sizeModel: string;
    partialFills: 'not_modeled';
    depthModel: 'not_modeled';
  };
  bias: {
    survivorshipBias: string;
    lookaheadBias: string;
    selectionBias: string;
    regimeBias: string;
  };
  sampleQuality: {
    label: BacktestSampleQuality;
    totalTrades: number;
    bars: number;
    warning: string;
  };
  warnings: string[];
}

function sampleQuality(totalTrades: number): BacktestSampleQuality {
  if (totalTrades >= 50) return 'adequate';
  if (totalTrades >= 20) return 'developing';
  return 'thin';
}

function sampleWarning(label: BacktestSampleQuality, totalTrades: number): string {
  if (label === 'adequate') return `Sample has ${totalTrades} trades; still historical and regime-dependent.`;
  if (label === 'developing') return `Sample has ${totalTrades} trades; treat metrics as developing, not stable.`;
  return `Sample has only ${totalTrades} trades; do not treat metrics as calibrated.`;
}

export function buildBacktestAssumptionsMetadata(args: {
  strategyId: string;
  timeframe: string;
  assetType: 'stock' | 'crypto';
  totalTrades: number;
  bars: number;
  volumeUnavailable: boolean;
}): BacktestAssumptionsMetadata {
  const quality = sampleQuality(args.totalTrades);
  const warnings = [
    sampleWarning(quality, args.totalTrades),
    `Adverse slippage of ${BACKTEST_SLIPPAGE_BPS} bps is applied to every simulated entry and exit.`,
    'Bid/ask spread, commissions, exchange fees, borrow costs, taxes, latency, queue priority, depth, and market impact are not modeled.',
    'Intrabar stop/target checks use historical high/low bars; when stop and target are both touched, the engine currently resolves stop before target.',
    'Results use the fetched provider universe and do not correct survivorship, symbol-selection, or regime-sampling bias.',
  ];

  if (args.volumeUnavailable) {
    warnings.push('Provider volume was unavailable for this run, so liquidity realism is weaker.');
  }
  if (args.bars < 120) {
    warnings.push(`Only ${args.bars} bars were available in the applied range.`);
  }

  return {
    version: 'backtest_assumptions_v1',
    strategyId: args.strategyId,
    timeframe: args.timeframe,
    assetType: args.assetType,
    fillModel: {
      label: 'historical_bar_simulation',
      entryTiming: 'Signals are evaluated from historical bars; fills are simulated, not venue-confirmed.',
      exitTiming: 'Stops, targets, signal flips, timeouts, and end-of-data exits are simulated from historical OHLC data.',
      intrabarPriority: 'If a bar touches both stop and target, stop is resolved before target.',
      intrabarAmbiguity: 'Intrabar path is unknown; high/low ordering inside each candle is not observed.',
      endOfDataExit: 'Open positions are closed at the final available close for reporting.',
    },
    costs: {
      slippageBps: BACKTEST_SLIPPAGE_BPS,
      slippageApplied: true,
      spreadModel: 'not_modeled',
      commissionModel: 'not_modeled',
      feeModel: 'not_modeled',
      borrowCostsModel: 'not_modeled',
      marketImpactModel: 'not_modeled',
    },
    liquidity: {
      volumeData: args.volumeUnavailable ? 'unavailable' : 'available',
      sizeModel: 'Position sizing uses 95% of initial capital per simulated trade; order book depth and stressed exits are not modeled.',
      partialFills: 'not_modeled',
      depthModel: 'not_modeled',
    },
    bias: {
      survivorshipBias: 'not_adjusted; fetched symbols may not represent delisted or unavailable instruments.',
      lookaheadBias: 'strategy code uses historical bars and indicators available in the run; intrabar sequencing remains approximate.',
      selectionBias: 'single-symbol and user-selected strategy runs can overstate edge if only favorable symbols are tested.',
      regimeBias: 'applied date range may not include enough bear, bull, volatility, and liquidity regimes.',
    },
    sampleQuality: {
      label: quality,
      totalTrades: args.totalTrades,
      bars: args.bars,
      warning: sampleWarning(quality, args.totalTrades),
    },
    warnings,
  };
}