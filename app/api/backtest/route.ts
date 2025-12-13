import { NextRequest, NextResponse } from 'next/server';

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'UI755FUUAM6FRRI9';

interface Trade {
  date: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  return: number;
  returnPercent: number;
}

interface PriceData {
  [date: string]: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
}

// Fetch daily price data from Alpha Vantage
async function fetchPriceData(symbol: string): Promise<PriceData> {
  const response = await fetch(
    `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=full&apikey=${ALPHA_VANTAGE_KEY}`
  );
  const data = await response.json();
  const timeSeries = data['Time Series (Daily)'];
  
  if (!timeSeries) {
    throw new Error(`Failed to fetch price data for ${symbol}`);
  }

  const priceData: PriceData = {};
  for (const [date, values] of Object.entries(timeSeries)) {
    priceData[date] = {
      open: parseFloat((values as any)['1. open']),
      high: parseFloat((values as any)['2. high']),
      low: parseFloat((values as any)['3. low']),
      close: parseFloat((values as any)['4. close']),
      volume: parseFloat((values as any)['5. volume'])
    };
  }
  
  return priceData;
}

// Calculate EMA
function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  let sum = 0;
  for (let i = 0; i < period && i < prices.length; i++) {
    sum += prices[i];
  }
  ema[period - 1] = sum / period;
  
  for (let i = period; i < prices.length; i++) {
    ema[i] = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }
  
  return ema;
}

// Calculate SMA
function calculateSMA(prices: number[], period: number): number[] {
  const sma: number[] = [];
  
  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += prices[i - j];
    }
    sma[i] = sum / period;
  }
  
  return sma;
}

// Calculate RSI
function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    
    if (i <= period) {
      if (change > 0) gains += change;
      else losses += Math.abs(change);
      
      if (i === period) {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgGain / (avgLoss || 0.0001);
        rsi[i] = 100 - (100 / (1 + rs));
      }
    } else {
      const prevAvgGain = (rsi[i-1] >= 50) ? ((100 - 100/(1 + rsi[i-1]/100)) * period - (change > 0 ? change : 0)) / period : 0;
      const prevAvgLoss = (rsi[i-1] < 50) ? ((100/(1 - rsi[i-1]/100) - 100) * period - (change < 0 ? Math.abs(change) : 0)) / period : 0;
      
      const avgGain = (prevAvgGain * (period - 1) + (change > 0 ? change : 0)) / period;
      const avgLoss = (prevAvgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
      const rs = avgGain / (avgLoss || 0.0001);
      rsi[i] = 100 - (100 / (1 + rs));
    }
  }
  
  return rsi;
}

// Calculate MACD
function calculateMACD(prices: number[]): { macd: number[], signal: number[], histogram: number[] } {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd: number[] = [];
  
  for (let i = 0; i < prices.length; i++) {
    if (ema12[i] !== undefined && ema26[i] !== undefined) {
      macd[i] = ema12[i] - ema26[i];
    }
  }
  
  const macdValues = macd.filter(v => v !== undefined);
  const signal = calculateEMA(macdValues, 9);
  const histogram: number[] = [];
  
  let signalIdx = 0;
  for (let i = 0; i < macd.length; i++) {
    if (macd[i] !== undefined && signal[signalIdx] !== undefined) {
      histogram[i] = macd[i] - signal[signalIdx];
      signalIdx++;
    }
  }
  
  return { macd, signal, histogram };
}

// Calculate Bollinger Bands
function calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2) {
  const bands: { upper: number[], middle: number[], lower: number[] } = {
    upper: [],
    middle: [],
    lower: []
  };
  
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b) / period;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    bands.middle[i] = avg;
    bands.upper[i] = avg + (stdDev * std);
    bands.lower[i] = avg - (stdDev * std);
  }
  
  return bands;
}

// Run backtest based on strategy using real price data and indicators
function runStrategy(
  strategy: string,
  priceData: PriceData,
  initialCapital: number,
  startDate: string,
  endDate: string,
  symbol: string
): Trade[] {
  const dates = Object.keys(priceData)
    .filter(d => d >= startDate && d <= endDate)
    .sort();
  
  if (dates.length < 100) {
    throw new Error('Insufficient historical data for backtest');
  }
  
  const closes = dates.map(d => priceData[d].close);
  const trades: Trade[] = [];
  let position: { entry: number; entryDate: string; entryIdx: number } | null = null;
  
  // Calculate indicators based on strategy
  let ema9: number[] = [];
  let ema21: number[] = [];
  let sma50: number[] = [];
  let sma200: number[] = [];
  let rsi: number[] = [];
  let macdData: { macd: number[], signal: number[], histogram: number[] } | null = null;
  let bbands: { upper: number[], middle: number[], lower: number[] } | null = null;
  
  if (strategy.includes('ema') || strategy === 'multi_ema_rsi') {
    ema9 = calculateEMA(closes, 9);
    ema21 = calculateEMA(closes, 21);
  }
  
  if (strategy.includes('sma')) {
    sma50 = calculateSMA(closes, 50);
    sma200 = calculateSMA(closes, 200);
  }
  
  if (strategy.includes('rsi') || strategy === 'multi_ema_rsi') {
    rsi = calculateRSI(closes, 14);
  }
  
  if (strategy.includes('macd') || strategy === 'multi_macd_adx') {
    macdData = calculateMACD(closes);
  }
  
  if (strategy.includes('bbands') || strategy.includes('bb') || strategy === 'multi_bb_stoch') {
    bbands = calculateBollingerBands(closes, 20, 2);
  }
  
  // Strategy execution logic
  for (let i = 200; i < dates.length - 1; i++) {
    const date = dates[i];
    const close = closes[i];
    
    // EMA Crossover Strategy (9/21)
    if (strategy === 'ema_crossover' && ema9[i] && ema21[i] && ema9[i-1] && ema21[i-1]) {
      if (!position && ema9[i-1] <= ema21[i-1] && ema9[i] > ema21[i]) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position && ema9[i-1] >= ema21[i-1] && ema9[i] < ema21[i]) {
        const shares = (initialCapital * 0.95) / position.entry;
        const returnDollars = (close - position.entry) * shares;
        const returnPercent = ((close - position.entry) / position.entry) * 100;
        
        trades.push({
          date: position.entryDate,
          symbol,
          side: 'LONG',
          entry: position.entry,
          exit: close,
          return: returnDollars,
          returnPercent
        });
        position = null;
      }
    }
    
    // SMA Crossover (50/200 Golden Cross)
    if (strategy === 'sma_crossover' && sma50[i] && sma200[i] && sma50[i-1] && sma200[i-1]) {
      if (!position && sma50[i-1] <= sma200[i-1] && sma50[i] > sma200[i]) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position && sma50[i-1] >= sma200[i-1] && sma50[i] < sma200[i]) {
        const shares = (initialCapital * 0.95) / position.entry;
        const returnDollars = (close - position.entry) * shares;
        const returnPercent = ((close - position.entry) / position.entry) * 100;
        
        trades.push({
          date: position.entryDate,
          symbol,
          side: 'LONG',
          entry: position.entry,
          exit: close,
          return: returnDollars,
          returnPercent
        });
        position = null;
      }
    }
    
    // RSI Mean Reversion
    if (strategy === 'rsi_reversal' && rsi[i] && rsi[i-1]) {
      if (!position && rsi[i] < 30) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position && rsi[i] > 70) {
        const shares = (initialCapital * 0.95) / position.entry;
        const returnDollars = (close - position.entry) * shares;
        const returnPercent = ((close - position.entry) / position.entry) * 100;
        
        trades.push({
          date: position.entryDate,
          symbol,
          side: 'LONG',
          entry: position.entry,
          exit: close,
          return: returnDollars,
          returnPercent
        });
        position = null;
      }
    }
    
    // RSI Trend Following
    if (strategy === 'rsi_trend' && rsi[i] && rsi[i-1]) {
      if (!position && rsi[i] < 40 && rsi[i] > rsi[i-1]) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position && rsi[i] > 60) {
        const shares = (initialCapital * 0.95) / position.entry;
        const returnDollars = (close - position.entry) * shares;
        const returnPercent = ((close - position.entry) / position.entry) * 100;
        
        trades.push({
          date: position.entryDate,
          symbol,
          side: 'LONG',
          entry: position.entry,
          exit: close,
          return: returnDollars,
          returnPercent
        });
        position = null;
      }
    }
    
    // MACD Crossover
    if ((strategy === 'macd_momentum' || strategy === 'macd_crossover') && macdData) {
      const { macd, signal } = macdData;
      if (macd[i] !== undefined && signal[i] !== undefined && macd[i-1] !== undefined && signal[i-1] !== undefined) {
        if (!position && macd[i-1] <= signal[i-1] && macd[i] > signal[i]) {
          position = { entry: close, entryDate: date, entryIdx: i };
        } else if (position && macd[i-1] >= signal[i-1] && macd[i] < signal[i]) {
          const shares = (initialCapital * 0.95) / position.entry;
          const returnDollars = (close - position.entry) * shares;
          const returnPercent = ((close - position.entry) / position.entry) * 100;
          
          trades.push({
            date: position.entryDate,
            symbol,
            side: 'LONG',
            entry: position.entry,
            exit: close,
            return: returnDollars,
            returnPercent
          });
          position = null;
        }
      }
    }
    
    // Bollinger Bands Mean Reversion
    if ((strategy === 'bbands_squeeze' || strategy === 'bbands_breakout') && bbands) {
      if (bbands.lower[i] && bbands.upper[i]) {
        if (!position && close <= bbands.lower[i]) {
          position = { entry: close, entryDate: date, entryIdx: i };
        } else if (position && close >= bbands.upper[i]) {
          const shares = (initialCapital * 0.95) / position.entry;
          const returnDollars = (close - position.entry) * shares;
          const returnPercent = ((close - position.entry) / position.entry) * 100;
          
          trades.push({
            date: position.entryDate,
            symbol,
            side: 'LONG',
            entry: position.entry,
            exit: close,
            return: returnDollars,
            returnPercent
          });
          position = null;
        }
      }
    }
    
    // Multi-Indicator: EMA + RSI
    if (strategy === 'multi_ema_rsi' && ema9[i] && ema21[i] && rsi[i] && ema9[i-1] && ema21[i-1]) {
      if (!position && ema9[i-1] <= ema21[i-1] && ema9[i] > ema21[i] && rsi[i] < 70) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position && ((ema9[i-1] >= ema21[i-1] && ema9[i] < ema21[i]) || rsi[i] > 75)) {
        const shares = (initialCapital * 0.95) / position.entry;
        const returnDollars = (close - position.entry) * shares;
        const returnPercent = ((close - position.entry) / position.entry) * 100;
        
        trades.push({
          date: position.entryDate,
          symbol,
          side: 'LONG',
          entry: position.entry,
          exit: close,
          return: returnDollars,
          returnPercent
        });
        position = null;
      }
    }
    
    // Multi-Indicator: MACD + Trend
    if (strategy === 'multi_macd_adx' && macdData) {
      const { macd, signal } = macdData;
      if (macd[i] !== undefined && signal[i] !== undefined && macd[i-1] !== undefined && signal[i-1] !== undefined) {
        if (!position && macd[i-1] <= signal[i-1] && macd[i] > signal[i] && macd[i] > 0) {
          position = { entry: close, entryDate: date, entryIdx: i };
        } else if (position && ((macd[i-1] >= signal[i-1] && macd[i] < signal[i]) || macd[i] < 0)) {
          const shares = (initialCapital * 0.95) / position.entry;
          const returnDollars = (close - position.entry) * shares;
          const returnPercent = ((close - position.entry) / position.entry) * 100;
          
          trades.push({
            date: position.entryDate,
            symbol,
            side: 'LONG',
            entry: position.entry,
            exit: close,
            return: returnDollars,
            returnPercent
          });
          position = null;
        }
      }
    }
  }
  
  return trades;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, strategy, startDate, endDate, initialCapital } = body;

    console.log('Real backtest request:', { symbol, strategy, startDate, endDate });

    if (!symbol || !strategy || !startDate || !endDate || !initialCapital) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Fetch real historical price data from Alpha Vantage
    console.log(`Fetching price data for ${symbol}...`);
    const priceData = await fetchPriceData(symbol);
    console.log(`Fetched ${Object.keys(priceData).length} days of price data`);

    // Run backtest with real indicators
    const trades = runStrategy(strategy, priceData, initialCapital, startDate, endDate, symbol);
    console.log(`Backtest complete: ${trades.length} trades executed`);

    if (trades.length === 0) {
      return NextResponse.json({
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalReturn: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        profitFactor: 0,
        avgWin: 0,
        avgLoss: 0,
        trades: []
      });
    }

    // Calculate performance metrics
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => t.return > 0).length;
    const losingTrades = trades.filter(t => t.return <= 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    const totalReturn = trades.reduce((sum, t) => sum + t.return, 0);
    const totalReturnPercent = (totalReturn / initialCapital) * 100;

    // Calculate max drawdown
    let peak = initialCapital;
    let maxDrawdown = 0;
    let equity = initialCapital;

    trades.forEach(trade => {
      equity += trade.return;
      if (equity > peak) {
        peak = equity;
      }
      const drawdown = ((peak - equity) / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });

    // Calculate Sharpe ratio
    const returns = trades.map(t => t.returnPercent);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length || 1)
    );
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    // Calculate profit factor
    const grossProfit = trades.filter(t => t.return > 0).reduce((sum, t) => sum + t.return, 0);
    const grossLoss = Math.abs(trades.filter(t => t.return <= 0).reduce((sum, t) => sum + t.return, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

    // Average win/loss
    const avgWin = winningTrades > 0
      ? trades.filter(t => t.return > 0).reduce((sum, t) => sum + t.return, 0) / winningTrades
      : 0;
    const avgLoss = losingTrades > 0
      ? trades.filter(t => t.return <= 0).reduce((sum, t) => sum + t.return, 0) / losingTrades
      : 0;

    const result = {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate: parseFloat(winRate.toFixed(2)),
      totalReturn: parseFloat(totalReturnPercent.toFixed(2)),
      maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
      sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
      profitFactor: parseFloat(profitFactor.toFixed(2)),
      avgWin: parseFloat(avgWin.toFixed(2)),
      avgLoss: parseFloat(avgLoss.toFixed(2)),
      trades: trades.map(t => ({
        ...t,
        entry: parseFloat(t.entry.toFixed(2)),
        exit: parseFloat(t.exit.toFixed(2)),
        return: parseFloat(t.return.toFixed(2)),
        returnPercent: parseFloat(t.returnPercent.toFixed(2))
      }))
    };

    console.log('Real backtest result:', { totalTrades, winRate, totalReturn: totalReturnPercent.toFixed(2) });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Backtest error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to run backtest' },
      { status: 500 }
    );
  }
}
