import type { BacktestTrade } from './engine';

export interface BacktestPosition {
  entry: number;
  entryDate: string;
  entryIdx: number;
}

interface StrategySignalIndicators {
  highs: number[];
  lows: number[];
  ema9: number[];
  ema21: number[];
  sma50: number[];
  sma200: number[];
  rsi: number[];
  closes: number[];
  cci: number[];
  obv: number[];
  macdData: { macd: number[]; signal: number[]; histogram: number[] } | null;
  bbands: { upper: number[]; middle: number[]; lower: number[] } | null;
  adxData: { adx: number[]; diPlus: number[]; diMinus: number[] } | null;
  stochData: { k: number[]; d: number[] } | null;
}

export interface CoreStrategyStepContext {
  strategy: string;
  i: number;
  date: string;
  close: number;
  initialCapital: number;
  symbol: string;
  position: BacktestPosition | null;
  trades: BacktestTrade[];
  indicators: StrategySignalIndicators;
}

export interface CoreStrategyStepResult {
  handled: boolean;
  position: BacktestPosition | null;
}

function closeLongPosition(
  position: BacktestPosition,
  close: number,
  date: string,
  i: number,
  symbol: string,
  initialCapital: number,
  trades: BacktestTrade[],
  highs: number[],
  lows: number[],
  exitReason: BacktestTrade['exitReason'] = 'signal_flip',
): null {
  const shares = (initialCapital * 0.95) / position.entry;
  const returnDollars = (close - position.entry) * shares;
  const returnPercent = ((close - position.entry) / position.entry) * 100;
  const tradeHigh = Math.max(...highs.slice(position.entryIdx, i + 1));
  const tradeLow = Math.min(...lows.slice(position.entryIdx, i + 1));
  const mfe = ((tradeHigh - position.entry) / position.entry) * 100;
  const mae = ((tradeLow - position.entry) / position.entry) * 100;

  trades.push({
    entryDate: position.entryDate,
    exitDate: date,
    symbol,
    side: 'LONG',
    direction: 'long',
    entryTs: position.entryDate,
    exitTs: date,
    entry: position.entry,
    exit: close,
    return: returnDollars,
    returnPercent,
    mfe,
    mae,
    exitReason,
    holdingPeriodDays: i - position.entryIdx + 1,
  });

  return null;
}

export function runCoreStrategyStep(ctx: CoreStrategyStepContext): CoreStrategyStepResult {
  const {
    strategy,
    i,
    date,
    close,
    initialCapital,
    symbol,
    trades,
    indicators,
  } = ctx;

  let position = ctx.position;

  const { highs, lows, ema9, ema21, sma50, sma200, rsi, closes, cci, obv, macdData, bbands, adxData, stochData } = indicators;

  if (strategy === 'ema_crossover' && ema9[i] && ema21[i] && ema9[i - 1] && ema21[i - 1]) {
    if (!position && ema9[i - 1] <= ema21[i - 1] && ema9[i] > ema21[i]) {
      position = { entry: close, entryDate: date, entryIdx: i };
    } else if (position && ema9[i - 1] >= ema21[i - 1] && ema9[i] < ema21[i]) {
      position = closeLongPosition(position, close, date, i, symbol, initialCapital, trades, highs, lows, 'signal_flip');
    }
    return { handled: true, position };
  }

  if (strategy === 'sma_crossover' && sma50[i] && sma200[i] && sma50[i - 1] && sma200[i - 1]) {
    if (!position && sma50[i - 1] <= sma200[i - 1] && sma50[i] > sma200[i]) {
      position = { entry: close, entryDate: date, entryIdx: i };
    } else if (position && sma50[i - 1] >= sma200[i - 1] && sma50[i] < sma200[i]) {
      position = closeLongPosition(position, close, date, i, symbol, initialCapital, trades, highs, lows, 'signal_flip');
    }
    return { handled: true, position };
  }

  if (strategy === 'rsi_reversal' && rsi[i] && rsi[i - 1]) {
    if (!position && rsi[i] < 30) {
      position = { entry: close, entryDate: date, entryIdx: i };
    } else if (position && rsi[i] > 70) {
      position = closeLongPosition(position, close, date, i, symbol, initialCapital, trades, highs, lows, 'signal_flip');
    }
    return { handled: true, position };
  }

  if (strategy === 'rsi_trend' && rsi[i] && rsi[i - 1]) {
    if (!position && rsi[i] < 40 && rsi[i] > rsi[i - 1]) {
      position = { entry: close, entryDate: date, entryIdx: i };
    } else if (position && rsi[i] > 60) {
      position = closeLongPosition(position, close, date, i, symbol, initialCapital, trades, highs, lows, 'signal_flip');
    }
    return { handled: true, position };
  }

  if ((strategy === 'macd_momentum' || strategy === 'macd_crossover') && macdData) {
    const { macd, signal } = macdData;
    if (macd[i] !== undefined && signal[i] !== undefined && macd[i - 1] !== undefined && signal[i - 1] !== undefined) {
      if (!position && macd[i - 1] <= signal[i - 1] && macd[i] > signal[i]) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position && macd[i - 1] >= signal[i - 1] && macd[i] < signal[i]) {
        position = closeLongPosition(position, close, date, i, symbol, initialCapital, trades, highs, lows, 'signal_flip');
      }
    }
    return { handled: true, position };
  }

  if ((strategy === 'bbands_squeeze' || strategy === 'bbands_breakout') && bbands) {
    if (bbands.lower[i] && bbands.upper[i]) {
      if (!position && close <= bbands.lower[i]) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position && close >= bbands.upper[i]) {
        position = closeLongPosition(position, close, date, i, symbol, initialCapital, trades, highs, lows, 'target');
      }
    }
    return { handled: true, position };
  }

  if (strategy === 'multi_ema_rsi' && ema9[i] && ema21[i] && rsi[i] && ema9[i - 1] && ema21[i - 1]) {
    if (!position && ema9[i - 1] <= ema21[i - 1] && ema9[i] > ema21[i] && rsi[i] < 70) {
      position = { entry: close, entryDate: date, entryIdx: i };
    } else if (position && ((ema9[i - 1] >= ema21[i - 1] && ema9[i] < ema21[i]) || rsi[i] > 75)) {
      position = closeLongPosition(position, close, date, i, symbol, initialCapital, trades, highs, lows, 'signal_flip');
    }
    return { handled: true, position };
  }

  if (strategy === 'multi_macd_adx' && macdData) {
    const { macd, signal } = macdData;
    if (macd[i] !== undefined && signal[i] !== undefined && macd[i - 1] !== undefined && signal[i - 1] !== undefined) {
      if (!position && macd[i - 1] <= signal[i - 1] && macd[i] > signal[i] && macd[i] > 0) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position && ((macd[i - 1] >= signal[i - 1] && macd[i] < signal[i]) || macd[i] < 0)) {
        position = closeLongPosition(position, close, date, i, symbol, initialCapital, trades, highs, lows, 'signal_flip');
      }
    }
    return { handled: true, position };
  }

  if (strategy === 'stoch_oversold' && stochData) {
    const { k, d } = stochData;
    if (k[i] !== undefined && d[i] !== undefined && k[i - 1] !== undefined) {
      if (!position && k[i - 1] < d[i - 1] && k[i] > d[i] && k[i] < 25) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position && k[i] > 80) {
        position = closeLongPosition(position, close, date, i, symbol, initialCapital, trades, highs, lows, 'target');
      }
    }
    return { handled: true, position };
  }

  if (strategy === 'adx_trend' && adxData) {
    const { adx, diPlus, diMinus } = adxData;
    if (adx[i] !== undefined && diPlus[i] !== undefined && diMinus[i] !== undefined) {
      if (!position && adx[i] > 25 && diPlus[i] > diMinus[i] && diPlus[i - 1] <= diMinus[i - 1]) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position && (adx[i] < 20 || (diMinus[i] > diPlus[i] && diMinus[i - 1] <= diPlus[i - 1]))) {
        position = closeLongPosition(position, close, date, i, symbol, initialCapital, trades, highs, lows, 'signal_flip');
      }
    }
    return { handled: true, position };
  }

  if (strategy === 'cci_reversal' && cci[i] !== undefined && cci[i - 1] !== undefined) {
    if (!position && cci[i - 1] <= -100 && cci[i] > -100) {
      position = { entry: close, entryDate: date, entryIdx: i };
    } else if (position && (cci[i] > 100 || cci[i] < -100)) {
      position = closeLongPosition(position, close, date, i, symbol, initialCapital, trades, highs, lows, 'signal_flip');
    }
    return { handled: true, position };
  }

  if (strategy === 'obv_volume' && obv[i] !== undefined && i >= 21) {
    const obvSlice = obv.slice(i - 20, i + 1);
    const obvSMA = obvSlice.reduce((a, b) => a + b, 0) / 21;

    const obvAboveSMA = obv[i] > obvSMA;
    const obvBelowSMAPrev = obv[i - 1] <= (obv.slice(i - 21, i).reduce((a, b) => a + b, 0) / 21);

    if (!position && obvAboveSMA && obvBelowSMAPrev && close > closes[i - 1]) {
      position = { entry: close, entryDate: date, entryIdx: i };
    } else if (position && obv[i] < obvSMA) {
      position = closeLongPosition(position, close, date, i, symbol, initialCapital, trades, highs, lows, 'signal_flip');
    }
    return { handled: true, position };
  }

  if (strategy === 'multi_bb_stoch' && bbands && stochData) {
    const { k } = stochData;
    if (bbands.lower[i] && bbands.upper[i] && k[i] !== undefined) {
      if (!position && close <= bbands.lower[i] && k[i] < 25) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position && (close >= bbands.upper[i] || k[i] > 80)) {
        position = closeLongPosition(position, close, date, i, symbol, initialCapital, trades, highs, lows, 'target');
      }
    }
    return { handled: true, position };
  }

  return { handled: false, position };
}
