import { NextRequest, NextResponse } from 'next/server';

/**
 * Stock Market Fear & Greed Index
 * 
 * Proprietary calculation based on multiple market indicators:
 * 1. VIX (Fear Index) - 25% weight
 * 2. S&P 500 vs 125-day MA - 25% weight  
 * 3. Market Momentum (% above 200 MA proxy) - 20% weight
 * 4. Put/Call Ratio proxy - 15% weight
 * 5. Safe Haven Demand (Gold vs S&P relative strength) - 15% weight
 */

const CACHE_DURATION = 1800; // 30 min cache (stock data updates slower)
let cache: { data: any; timestamp: number } | null = null;

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY;

interface IndicatorScore {
  name: string;
  value: number;
  score: number; // 0-100
  signal: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  weight: number;
}

export async function GET(req: NextRequest) {
  // Check cache
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION * 1000) {
    return NextResponse.json(cache.data);
  }

  if (!ALPHA_VANTAGE_KEY) {
    return NextResponse.json(
      { error: 'Alpha Vantage API key not configured' },
      { status: 500 }
    );
  }

  try {
    // Fetch multiple indicators in parallel
    const [vixData, spyData, gldData] = await Promise.all([
      fetchQuote('VIX'),   // Volatility Index (via ^VIX proxy)
      fetchQuote('SPY'),   // S&P 500 ETF
      fetchQuote('GLD'),   // Gold ETF (safe haven)
    ]);

    // Also get some technical data
    const [spyTech] = await Promise.all([
      fetchTechnical('SPY'),
    ]);

    const indicators: IndicatorScore[] = [];
    let totalScore = 0;
    let totalWeight = 0;

    // 1. VIX Score (inverted - high VIX = fear)
    if (vixData?.price) {
      const vixScore = calculateVixScore(vixData.price);
      indicators.push({
        name: 'Market Volatility (VIX)',
        value: vixData.price,
        score: vixScore,
        signal: getSignal(vixScore),
        weight: 0.25,
      });
      totalScore += vixScore * 0.25;
      totalWeight += 0.25;
    }

    // 2. S&P 500 vs Moving Average
    if (spyData?.price && spyTech?.sma) {
      const maScore = calculateMaScore(spyData.price, spyTech.sma);
      indicators.push({
        name: 'S&P 500 vs 125-day MA',
        value: ((spyData.price / spyTech.sma - 1) * 100),
        score: maScore,
        signal: getSignal(maScore),
        weight: 0.25,
      });
      totalScore += maScore * 0.25;
      totalWeight += 0.25;
    }

    // 3. Market Momentum (price change)
    if (spyData?.changePercent) {
      const momentumScore = calculateMomentumScore(spyData.changePercent);
      indicators.push({
        name: 'Market Momentum',
        value: spyData.changePercent,
        score: momentumScore,
        signal: getSignal(momentumScore),
        weight: 0.20,
      });
      totalScore += momentumScore * 0.20;
      totalWeight += 0.20;
    }

    // 4. Safe Haven Demand (Gold relative strength)
    if (gldData?.changePercent && spyData?.changePercent) {
      const safeHavenScore = calculateSafeHavenScore(
        gldData.changePercent, 
        spyData.changePercent
      );
      indicators.push({
        name: 'Safe Haven Demand',
        value: gldData.changePercent - spyData.changePercent,
        score: safeHavenScore,
        signal: getSignal(safeHavenScore),
        weight: 0.15,
      });
      totalScore += safeHavenScore * 0.15;
      totalWeight += 0.15;
    }

    // 5. RSI-based momentum
    if (spyTech?.rsi) {
      const rsiScore = calculateRsiScore(spyTech.rsi);
      indicators.push({
        name: 'Stock Price Strength (RSI)',
        value: spyTech.rsi,
        score: rsiScore,
        signal: getSignal(rsiScore),
        weight: 0.15,
      });
      totalScore += rsiScore * 0.15;
      totalWeight += 0.15;
    }

    // Normalize if we didn't get all indicators
    const finalScore = totalWeight > 0 
      ? Math.round(totalScore / totalWeight) 
      : 50;

    const result = {
      current: {
        value: finalScore,
        classification: getClassification(finalScore),
        timestamp: new Date().toISOString(),
      },
      indicators,
      market: 'stocks',
      methodology: 'MSP Proprietary Stock F&G Index',
      description: 'Combines VIX, S&P 500 trend, momentum, safe haven demand, and RSI',
      source: 'MarketScanner Pros',
      cachedAt: new Date().toISOString(),
    };

    // Update cache
    cache = { data: result, timestamp: Date.now() };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Stock Fear & Greed API error:', error);
    
    if (cache) {
      return NextResponse.json({
        ...cache.data,
        stale: true,
        error: 'Using cached data due to API error',
      });
    }
    
    return NextResponse.json(
      { error: 'Failed to calculate Stock Fear & Greed Index' },
      { status: 500 }
    );
  }
}

// Fetch quote from Alpha Vantage
async function fetchQuote(symbol: string): Promise<{ price: number; changePercent: number } | null> {
  try {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`
    );
    const data = await res.json();
    const quote = data['Global Quote'];
    
    if (quote && quote['05. price']) {
      return {
        price: parseFloat(quote['05. price']),
        changePercent: parseFloat(quote['10. change percent']?.replace('%', '') || '0'),
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Fetch technical indicators
async function fetchTechnical(symbol: string): Promise<{ sma: number; rsi: number } | null> {
  try {
    const [smaRes, rsiRes] = await Promise.all([
      fetch(`https://www.alphavantage.co/query?function=SMA&symbol=${symbol}&interval=daily&time_period=125&series_type=close&apikey=${ALPHA_VANTAGE_KEY}`),
      fetch(`https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=daily&time_period=14&series_type=close&apikey=${ALPHA_VANTAGE_KEY}`),
    ]);

    const [smaData, rsiData] = await Promise.all([smaRes.json(), rsiRes.json()]);

    const smaValues = smaData['Technical Analysis: SMA'];
    const rsiValues = rsiData['Technical Analysis: RSI'];

    const latestSma = smaValues ? Object.values(smaValues)[0] as any : null;
    const latestRsi = rsiValues ? Object.values(rsiValues)[0] as any : null;

    return {
      sma: latestSma ? parseFloat(latestSma['SMA']) : 0,
      rsi: latestRsi ? parseFloat(latestRsi['RSI']) : 50,
    };
  } catch {
    return null;
  }
}

// VIX Score: Low VIX = Greed, High VIX = Fear
function calculateVixScore(vix: number): number {
  // VIX ranges: <12 = extreme greed, 12-20 = greed/neutral, 20-30 = fear, >30 = extreme fear
  if (vix <= 12) return 90;
  if (vix <= 15) return 75;
  if (vix <= 20) return 55;
  if (vix <= 25) return 40;
  if (vix <= 30) return 25;
  if (vix <= 40) return 15;
  return 5;
}

// MA Score: Price above MA = Greed, below = Fear
function calculateMaScore(price: number, ma: number): number {
  const deviation = ((price / ma) - 1) * 100;
  // +10% above = extreme greed, -10% below = extreme fear
  if (deviation >= 10) return 95;
  if (deviation >= 5) return 75;
  if (deviation >= 2) return 60;
  if (deviation >= -2) return 50;
  if (deviation >= -5) return 40;
  if (deviation >= -10) return 25;
  return 10;
}

// Momentum Score: Strong positive = Greed
function calculateMomentumScore(changePercent: number): number {
  if (changePercent >= 2) return 90;
  if (changePercent >= 1) return 75;
  if (changePercent >= 0.5) return 60;
  if (changePercent >= -0.5) return 50;
  if (changePercent >= -1) return 40;
  if (changePercent >= -2) return 25;
  return 10;
}

// Safe Haven: Gold outperforming = Fear
function calculateSafeHavenScore(goldChange: number, spyChange: number): number {
  const diff = goldChange - spyChange;
  // If gold is rising faster than stocks = fear (inverted)
  if (diff >= 2) return 15; // Gold way up vs stocks = extreme fear
  if (diff >= 1) return 30;
  if (diff >= 0) return 45;
  if (diff >= -1) return 55;
  if (diff >= -2) return 70;
  return 85; // Stocks way outperforming gold = extreme greed
}

// RSI Score: High RSI = Greed
function calculateRsiScore(rsi: number): number {
  if (rsi >= 70) return 90;
  if (rsi >= 60) return 70;
  if (rsi >= 50) return 55;
  if (rsi >= 40) return 45;
  if (rsi >= 30) return 25;
  return 10;
}

function getSignal(score: number): 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed' {
  if (score <= 24) return 'extreme_fear';
  if (score <= 44) return 'fear';
  if (score <= 55) return 'neutral';
  if (score <= 75) return 'greed';
  return 'extreme_greed';
}

function getClassification(score: number): string {
  if (score <= 24) return 'Extreme Fear';
  if (score <= 44) return 'Fear';
  if (score <= 55) return 'Neutral';
  if (score <= 75) return 'Greed';
  return 'Extreme Greed';
}
