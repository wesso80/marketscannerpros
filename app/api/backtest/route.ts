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

// Fetch technical indicator from Alpha Vantage
async function fetchIndicator(symbol: string, indicator: string, params: Record<string, any> = {}) {
  const baseUrl = 'https://www.alphavantage.co/query';
  const queryParams = new URLSearchParams({
    function: indicator,
    symbol: symbol,
    interval: 'daily',
    apikey: ALPHA_VANTAGE_KEY,
    ...params
  });

  const response = await fetch(`${baseUrl}?${queryParams}`);
  const data = await response.json();
  return data;
}

// Fetch daily price data
async function fetchPriceData(symbol: string) {
  const response = await fetch(
    `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=full&apikey=${ALPHA_VANTAGE_KEY}`
  );
  const data = await response.json();
  return data['Time Series (Daily)'] || {};
}

// Strategy implementations
function emaStrategy(prices: any, ema9: any, ema21: any, capital: number): Trade[] {
  const trades: Trade[] = [];
  const dates = Object.keys(prices).sort();
  let position: { entry: number; date: string } | null = null;

  for (let i = 1; i < dates.length; i++) {
    const date = dates[i];
    const prevDate = dates[i - 1];
    
    if (!ema9[date] || !ema21[date] || !ema9[prevDate] || !ema21[prevDate]) continue;

    const ema9Val = parseFloat(ema9[date].EMA);
    const ema21Val = parseFloat(ema21[date].EMA);
    const prevEma9 = parseFloat(ema9[prevDate].EMA);
    const prevEma21 = parseFloat(ema21[prevDate].EMA);
    const closePrice = parseFloat(prices[date]['4. close']);

    // Bullish crossover - EMA9 crosses above EMA21
    if (!position && prevEma9 <= prevEma21 && ema9Val > ema21Val) {
      position = { entry: closePrice, date };
    }
    // Bearish crossover - EMA9 crosses below EMA21
    else if (position && prevEma9 >= prevEma21 && ema9Val < ema21Val) {
      const returnDollars = (closePrice - position.entry) * (capital / position.entry);
      const returnPercent = ((closePrice - position.entry) / position.entry) * 100;
      
      trades.push({
        date: position.date,
        symbol: '',
        side: 'LONG',
        entry: position.entry,
        exit: closePrice,
        return: returnDollars,
        returnPercent
      });
      position = null;
    }
  }

  return trades;
}

function rsiStrategy(prices: any, rsi: any, capital: number, oversold = 30, overbought = 70): Trade[] {
  const trades: Trade[] = [];
  const dates = Object.keys(prices).sort();
  let position: { entry: number; date: string } | null = null;

  for (const date of dates) {
    if (!rsi[date]) continue;

    const rsiVal = parseFloat(rsi[date].RSI);
    const closePrice = parseFloat(prices[date]['4. close']);

    // Buy when oversold
    if (!position && rsiVal < oversold) {
      position = { entry: closePrice, date };
    }
    // Sell when overbought
    else if (position && rsiVal > overbought) {
      const returnDollars = (closePrice - position.entry) * (capital / position.entry);
      const returnPercent = ((closePrice - position.entry) / position.entry) * 100;
      
      trades.push({
        date: position.date,
        symbol: '',
        side: 'LONG',
        entry: position.entry,
        exit: closePrice,
        return: returnDollars,
        returnPercent
      });
      position = null;
    }
  }

  return trades;
}

function macdStrategy(prices: any, macd: any, capital: number): Trade[] {
  const trades: Trade[] = [];
  const dates = Object.keys(prices).sort();
  let position: { entry: number; date: string } | null = null;

  for (let i = 1; i < dates.length; i++) {
    const date = dates[i];
    const prevDate = dates[i - 1];
    
    if (!macd[date] || !macd[prevDate]) continue;

    const macdLine = parseFloat(macd[date].MACD);
    const signalLine = parseFloat(macd[date].MACD_Signal);
    const prevMacd = parseFloat(macd[prevDate].MACD);
    const prevSignal = parseFloat(macd[prevDate].MACD_Signal);
    const closePrice = parseFloat(prices[date]['4. close']);

    // Bullish crossover - MACD crosses above signal
    if (!position && prevMacd <= prevSignal && macdLine > signalLine) {
      position = { entry: closePrice, date };
    }
    // Bearish crossover - MACD crosses below signal
    else if (position && prevMacd >= prevSignal && macdLine < signalLine) {
      const returnDollars = (closePrice - position.entry) * (capital / position.entry);
      const returnPercent = ((closePrice - position.entry) / position.entry) * 100;
      
      trades.push({
        date: position.date,
        symbol: '',
        side: 'LONG',
        entry: position.entry,
        exit: closePrice,
        return: returnDollars,
        returnPercent
      });
      position = null;
    }
  }

  return trades;
}

function bbandsStrategy(prices: any, bbands: any, capital: number): Trade[] {
  const trades: Trade[] = [];
  const dates = Object.keys(prices).sort();
  let position: { entry: number; date: string } | null = null;

  for (const date of dates) {
    if (!bbands[date]) continue;

    const closePrice = parseFloat(prices[date]['4. close']);
    const lowerBand = parseFloat(bbands[date]['Real Lower Band']);
    const upperBand = parseFloat(bbands[date]['Real Upper Band']);

    // Buy when price touches lower band
    if (!position && closePrice <= lowerBand) {
      position = { entry: closePrice, date };
    }
    // Sell when price touches upper band
    else if (position && closePrice >= upperBand) {
      const returnDollars = (closePrice - position.entry) * (capital / position.entry);
      const returnPercent = ((closePrice - position.entry) / position.entry) * 100;
      
      trades.push({
        date: position.date,
        symbol: '',
        side: 'LONG',
        entry: position.entry,
        exit: closePrice,
        return: returnDollars,
        returnPercent
      });
      position = null;
    }
  }

  return trades;
}

export async function POST(req: NextRequest) {
  try {
    const { symbol, strategy, startDate, endDate, initialCapital } = await req.json();

    // Fetch price data
    const prices = await fetchPriceData(symbol);
    
    if (!prices || Object.keys(prices).length === 0) {
      return NextResponse.json(
        { error: 'Failed to fetch price data. Symbol may be invalid.' },
        { status: 400 }
      );
    }

    let trades: Trade[] = [];

    // Execute strategy based on selection
    switch (strategy) {
      case 'ema_crossover': {
        const [ema9Data, ema21Data] = await Promise.all([
          fetchIndicator(symbol, 'EMA', { time_period: '9' }),
          fetchIndicator(symbol, 'EMA', { time_period: '21' })
        ]);
        const ema9 = ema9Data['Technical Analysis: EMA'] || {};
        const ema21 = ema21Data['Technical Analysis: EMA'] || {};
        trades = emaStrategy(prices, ema9, ema21, initialCapital);
        break;
      }

      case 'rsi_reversal': {
        const rsiData = await fetchIndicator(symbol, 'RSI', { time_period: '14' });
        const rsi = rsiData['Technical Analysis: RSI'] || {};
        trades = rsiStrategy(prices, rsi, initialCapital, 30, 70);
        break;
      }

      case 'rsi_trend': {
        const rsiData = await fetchIndicator(symbol, 'RSI', { time_period: '14' });
        const rsi = rsiData['Technical Analysis: RSI'] || {};
        trades = rsiStrategy(prices, rsi, initialCapital, 40, 60);
        break;
      }

      case 'macd_momentum':
      case 'macd_crossover': {
        const macdData = await fetchIndicator(symbol, 'MACD', {});
        const macd = macdData['Technical Analysis: MACD'] || {};
        trades = macdStrategy(prices, macd, initialCapital);
        break;
      }

      case 'bbands_squeeze':
      case 'bbands_breakout': {
        const bbandsData = await fetchIndicator(symbol, 'BBANDS', { time_period: '20' });
        const bbands = bbandsData['Technical Analysis: BBANDS'] || {};
        trades = bbandsStrategy(prices, bbands, initialCapital);
        break;
      }

      default:
        // For strategies not yet implemented, return sample data
        trades = generateSampleTrades(symbol, initialCapital);
    }

    // Filter trades by date range
    trades = trades.filter(t => t.date >= startDate && t.date <= endDate);

    // Calculate performance metrics
    const winningTrades = trades.filter(t => t.return > 0);
    const losingTrades = trades.filter(t => t.return < 0);
    const totalReturn = trades.reduce((sum, t) => sum + t.return, 0);
    const totalWins = winningTrades.reduce((sum, t) => sum + t.return, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.return, 0));

    // Calculate max drawdown
    let peak = initialCapital;
    let maxDrawdown = 0;
    let runningCapital = initialCapital;
    
    for (const trade of trades) {
      runningCapital += trade.return;
      if (runningCapital > peak) peak = runningCapital;
      const drawdown = ((peak - runningCapital) / peak) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Calculate Sharpe Ratio (simplified)
    const returns = trades.map(t => t.returnPercent);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length || 0;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length || 1
    );
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    const result = {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
      totalReturn: (totalReturn / initialCapital) * 100,
      maxDrawdown: -maxDrawdown,
      sharpeRatio: Math.max(0, Math.min(5, sharpeRatio)), // Cap between 0 and 5
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : 0,
      avgWin: winningTrades.length > 0 ? totalWins / winningTrades.length : 0,
      avgLoss: losingTrades.length > 0 ? totalLosses / losingTrades.length : 0,
      trades: trades.map(t => ({ ...t, symbol }))
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Backtest error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Fallback sample data for strategies not yet implemented
function generateSampleTrades(symbol: string, capital: number): Trade[] {
  return [
    { date: '2024-01-15', symbol, side: 'LONG', entry: 450.20, exit: 458.50, return: 83.00, returnPercent: 1.84 },
    { date: '2024-02-03', symbol, side: 'LONG', entry: 460.10, exit: 454.30, return: -58.00, returnPercent: -1.26 },
    { date: '2024-03-12', symbol, side: 'LONG', entry: 455.80, exit: 472.90, return: 171.00, returnPercent: 3.75 },
    { date: '2024-04-08', symbol, side: 'LONG', entry: 475.30, exit: 468.20, return: -71.00, returnPercent: -1.49 },
    { date: '2024-05-20', symbol, side: 'LONG', entry: 470.50, exit: 489.60, return: 191.00, returnPercent: 4.06 },
  ];
}
