/**
 * Daily Scanner Cron Job
 * 
 * @route POST /api/jobs/scan-daily
 * @description Scans top symbols for each asset class and stores results
 * @cron Runs daily at 9:30 PM UTC (4:30 PM EST after market close)
 * 
 * Protected by CRON_SECRET - only callable by Vercel Cron or admin
 */

import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max

// Top symbols to scan for each asset class
const EQUITY_UNIVERSE = [
  // Mega-cap tech
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ORCL", "CRM",
  // Finance
  "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "BLK", "SCHW", "AXP",
  // Healthcare
  "UNH", "JNJ", "LLY", "PFE", "ABBV", "MRK", "TMO", "ABT", "DHR", "BMY",
  // Consumer
  "WMT", "PG", "KO", "PEP", "COST", "MCD", "NKE", "SBUX", "TGT", "HD",
  // Industrial
  "CAT", "DE", "UPS", "FDX", "BA", "HON", "GE", "LMT", "RTX", "MMM",
  // Energy
  "XOM", "CVX", "COP", "SLB", "EOG", "OXY", "PSX", "VLO", "MPC", "KMI",
  // Semi & Tech
  "AMD", "INTC", "QCOM", "MU", "AMAT", "LRCX", "KLAC", "TXN", "ADI", "MRVL",
  // Growth
  "NFLX", "UBER", "ABNB", "SQ", "SHOP", "SNOW", "PLTR", "CRWD", "ZS", "DDOG",
  // Other notable
  "BRK.B", "DIS", "CMCSA", "VZ", "T", "PYPL", "ADBE", "NOW", "INTU", "IBM"
];

const CRYPTO_UNIVERSE = [
  "BTC", "ETH", "BNB", "XRP", "SOL", "ADA", "DOGE", "TRX", "AVAX", "LINK",
  "DOT", "MATIC", "SHIB", "LTC", "BCH", "ATOM", "UNI", "XLM", "ETC", "NEAR",
  "APT", "ARB", "OP", "INJ", "FIL", "VET", "AAVE", "GRT", "ALGO", "FTM",
  "SAND", "MANA", "AXS", "THETA", "XTZ", "EOS", "FLOW", "CHZ", "CRV", "LDO",
  "MKR", "SNX", "COMP", "SUSHI", "YFI", "BAL", "1INCH", "ENS", "LRC", "IMX"
];

const FOREX_UNIVERSE = [
  "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "CNY", "HKD", "SGD",
  "SEK", "NOK", "MXN", "ZAR", "TRY", "INR", "BRL", "PLN", "THB", "KRW"
];

// Rate limiter - Alpha Vantage allows 75/min for premium
const RATE_LIMIT_DELAY = 850; // ms between calls (~70/min to be safe)

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.Note || data.Information) {
        // Rate limited - wait and retry
        if (i < retries) {
          await sleep(60000); // Wait 1 minute
          continue;
        }
      }
      return data;
    } catch (e) {
      if (i === retries) throw e;
      await sleep(2000);
    }
  }
}

// Compute score from indicators (same logic as scanner)
function computeScore(indicators: Record<string, any>): { score: number; direction: string; signals: { bullish: number; bearish: number; neutral: number } } {
  const signals = { bullish: 0, bearish: 0, neutral: 0 };
  
  // RSI
  const rsi = indicators.rsi;
  if (rsi !== undefined) {
    if (rsi < 30) signals.bullish++;
    else if (rsi > 70) signals.bearish++;
    else if (rsi >= 40 && rsi <= 60) signals.neutral++;
    else if (rsi < 50) signals.bullish++;
    else signals.bearish++;
  }

  // MACD
  const macd = indicators.macd;
  const macdSignal = indicators.macdSignal;
  if (macd !== undefined && macdSignal !== undefined) {
    if (macd > macdSignal && macd > 0) signals.bullish++;
    else if (macd < macdSignal && macd < 0) signals.bearish++;
    else if (macd > macdSignal) signals.bullish++;
    else signals.bearish++;
  }

  // Price vs EMA200
  const price = indicators.price;
  const ema200 = indicators.ema200;
  if (price && ema200) {
    const pctAbove = ((price - ema200) / ema200) * 100;
    if (pctAbove > 5) signals.bullish++;
    else if (pctAbove < -5) signals.bearish++;
    else signals.neutral++;
  }

  // ADX trend strength
  const adx = indicators.adx;
  const plusDI = indicators.plusDI;
  const minusDI = indicators.minusDI;
  if (adx !== undefined && plusDI !== undefined && minusDI !== undefined) {
    if (adx > 25) {
      if (plusDI > minusDI) signals.bullish++;
      else signals.bearish++;
    } else {
      signals.neutral++;
    }
  }

  // Stochastic
  const stochK = indicators.stochK;
  const stochD = indicators.stochD;
  if (stochK !== undefined && stochD !== undefined) {
    if (stochK < 20 && stochK > stochD) signals.bullish++;
    else if (stochK > 80 && stochK < stochD) signals.bearish++;
    else if (stochK > stochD) signals.bullish++;
    else signals.bearish++;
  }

  // Aroon
  const aroonUp = indicators.aroonUp;
  const aroonDown = indicators.aroonDown;
  if (aroonUp !== undefined && aroonDown !== undefined) {
    if (aroonUp > 70 && aroonDown < 30) signals.bullish++;
    else if (aroonDown > 70 && aroonUp < 30) signals.bearish++;
    else signals.neutral++;
  }

  // CCI
  const cci = indicators.cci;
  if (cci !== undefined) {
    if (cci > 100) signals.bullish++;
    else if (cci < -100) signals.bearish++;
    else signals.neutral++;
  }

  // Calculate final score
  const total = signals.bullish + signals.bearish + signals.neutral;
  if (total === 0) return { score: 50, direction: 'neutral', signals };

  const bullishWeight = signals.bullish / total;
  const bearishWeight = signals.bearish / total;
  
  let score: number;
  let direction: string;
  
  if (bullishWeight > bearishWeight) {
    score = 50 + (bullishWeight * 50);
    direction = score >= 65 ? 'bullish' : 'neutral';
  } else if (bearishWeight > bullishWeight) {
    score = 50 - (bearishWeight * 50);
    direction = score <= 35 ? 'bearish' : 'neutral';
  } else {
    score = 50;
    direction = 'neutral';
  }

  return { score: Math.round(score), direction, signals };
}

async function scanEquity(symbol: string, apiKey: string): Promise<any | null> {
  try {
    const baseUrl = "https://www.alphavantage.co/query";
    
    // Fetch daily prices
    const priceUrl = `${baseUrl}?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}`;
    const priceData = await fetchWithRetry(priceUrl);
    await sleep(RATE_LIMIT_DELAY);
    
    const timeSeries = priceData["Time Series (Daily)"];
    if (!timeSeries) return null;
    
    const dates = Object.keys(timeSeries).sort().reverse();
    const latestDate = dates[0];
    const latest = timeSeries[latestDate];
    const prevDate = dates[1];
    const prev = timeSeries[prevDate];
    
    const price = parseFloat(latest["4. close"]);
    const prevClose = parseFloat(prev["4. close"]);
    const changePercent = ((price - prevClose) / prevClose) * 100;

    // Fetch key indicators
    const indicators: Record<string, any> = { price };
    
    // RSI
    const rsiUrl = `${baseUrl}?function=RSI&symbol=${symbol}&interval=daily&time_period=14&series_type=close&apikey=${apiKey}`;
    const rsiData = await fetchWithRetry(rsiUrl);
    await sleep(RATE_LIMIT_DELAY);
    const rsiSeries = rsiData["Technical Analysis: RSI"];
    if (rsiSeries) {
      const rsiDate = Object.keys(rsiSeries)[0];
      indicators.rsi = parseFloat(rsiSeries[rsiDate]["RSI"]);
    }

    // MACD
    const macdUrl = `${baseUrl}?function=MACD&symbol=${symbol}&interval=daily&series_type=close&apikey=${apiKey}`;
    const macdData = await fetchWithRetry(macdUrl);
    await sleep(RATE_LIMIT_DELAY);
    const macdSeries = macdData["Technical Analysis: MACD"];
    if (macdSeries) {
      const macdDate = Object.keys(macdSeries)[0];
      indicators.macd = parseFloat(macdSeries[macdDate]["MACD"]);
      indicators.macdSignal = parseFloat(macdSeries[macdDate]["MACD_Signal"]);
    }

    // EMA 200
    const emaUrl = `${baseUrl}?function=EMA&symbol=${symbol}&interval=daily&time_period=200&series_type=close&apikey=${apiKey}`;
    const emaData = await fetchWithRetry(emaUrl);
    await sleep(RATE_LIMIT_DELAY);
    const emaSeries = emaData["Technical Analysis: EMA"];
    if (emaSeries) {
      const emaDate = Object.keys(emaSeries)[0];
      indicators.ema200 = parseFloat(emaSeries[emaDate]["EMA"]);
    }

    // ADX
    const adxUrl = `${baseUrl}?function=ADX&symbol=${symbol}&interval=daily&time_period=14&apikey=${apiKey}`;
    const adxData = await fetchWithRetry(adxUrl);
    await sleep(RATE_LIMIT_DELAY);
    const adxSeries = adxData["Technical Analysis: ADX"];
    if (adxSeries) {
      const adxDate = Object.keys(adxSeries)[0];
      indicators.adx = parseFloat(adxSeries[adxDate]["ADX"]);
    }

    // Stochastic
    const stochUrl = `${baseUrl}?function=STOCH&symbol=${symbol}&interval=daily&apikey=${apiKey}`;
    const stochData = await fetchWithRetry(stochUrl);
    await sleep(RATE_LIMIT_DELAY);
    const stochSeries = stochData["Technical Analysis: STOCH"];
    if (stochSeries) {
      const stochDate = Object.keys(stochSeries)[0];
      indicators.stochK = parseFloat(stochSeries[stochDate]["SlowK"]);
      indicators.stochD = parseFloat(stochSeries[stochDate]["SlowD"]);
    }

    const { score, direction, signals } = computeScore(indicators);

    return {
      symbol,
      asset_class: 'equity',
      score,
      direction,
      signals_bullish: signals.bullish,
      signals_bearish: signals.bearish,
      signals_neutral: signals.neutral,
      price,
      change_percent: changePercent,
      indicators
    };
  } catch (e) {
    console.error(`Error scanning ${symbol}:`, e);
    return null;
  }
}

async function scanCrypto(symbol: string, apiKey: string): Promise<any | null> {
  try {
    const baseUrl = "https://www.alphavantage.co/query";
    const indicators: Record<string, any> = {};
    
    // Use same approach as regular scanner - fetch technical indicators directly
    // These work for crypto when using the symbol format
    
    // Fetch RSI
    const rsiUrl = `${baseUrl}?function=RSI&symbol=${symbol}&interval=daily&time_period=14&series_type=close&apikey=${apiKey}`;
    const rsiData = await fetchWithRetry(rsiUrl);
    await sleep(RATE_LIMIT_DELAY);
    const rsiSeries = rsiData["Technical Analysis: RSI"];
    if (rsiSeries) {
      const rsiDate = Object.keys(rsiSeries)[0];
      indicators.rsi = parseFloat(rsiSeries[rsiDate]["RSI"]);
    }

    // Fetch MACD
    const macdUrl = `${baseUrl}?function=MACD&symbol=${symbol}&interval=daily&series_type=close&apikey=${apiKey}`;
    const macdData = await fetchWithRetry(macdUrl);
    await sleep(RATE_LIMIT_DELAY);
    const macdSeries = macdData["Technical Analysis: MACD"];
    if (macdSeries) {
      const macdDate = Object.keys(macdSeries)[0];
      indicators.macd = parseFloat(macdSeries[macdDate]["MACD"]);
      indicators.macdSignal = parseFloat(macdSeries[macdDate]["MACD_Signal"]);
    }

    // Fetch Stochastic
    const stochUrl = `${baseUrl}?function=STOCH&symbol=${symbol}&interval=daily&apikey=${apiKey}`;
    const stochData = await fetchWithRetry(stochUrl);
    await sleep(RATE_LIMIT_DELAY);
    const stochSeries = stochData["Technical Analysis: STOCH"];
    if (stochSeries) {
      const stochDate = Object.keys(stochSeries)[0];
      indicators.stochK = parseFloat(stochSeries[stochDate]["SlowK"]);
      indicators.stochD = parseFloat(stochSeries[stochDate]["SlowD"]);
    }

    // Fetch ADX
    const adxUrl = `${baseUrl}?function=ADX&symbol=${symbol}&interval=daily&time_period=14&apikey=${apiKey}`;
    const adxData = await fetchWithRetry(adxUrl);
    await sleep(RATE_LIMIT_DELAY);
    const adxSeries = adxData["Technical Analysis: ADX"];
    if (adxSeries) {
      const adxDate = Object.keys(adxSeries)[0];
      indicators.adx = parseFloat(adxSeries[adxDate]["ADX"]);
    }

    // Fetch price from crypto endpoint for price display
    const priceUrl = `${baseUrl}?function=CURRENCY_EXCHANGE_RATE&from_currency=${symbol}&to_currency=USD&apikey=${apiKey}`;
    const priceData = await fetchWithRetry(priceUrl);
    await sleep(RATE_LIMIT_DELAY);
    const exchangeRate = priceData["Realtime Currency Exchange Rate"];
    let price = null;
    let changePercent = null;
    if (exchangeRate) {
      price = parseFloat(exchangeRate["5. Exchange Rate"]);
      indicators.price = price;
    }

    // If we got no indicators, this crypto isn't supported
    if (Object.keys(indicators).length < 2) {
      console.error(`Insufficient data for crypto ${symbol}`);
      return null;
    }

    const { score, direction, signals } = computeScore(indicators);

    return {
      symbol,
      asset_class: 'crypto',
      score,
      direction,
      signals_bullish: signals.bullish,
      signals_bearish: signals.bearish,
      signals_neutral: signals.neutral,
      price,
      change_percent: changePercent,
      indicators
    };
  } catch (e) {
    console.error(`Error scanning crypto ${symbol}:`, e);
    return null;
  }
}

async function scanForex(symbol: string, apiKey: string): Promise<any | null> {
  try {
    const baseUrl = "https://www.alphavantage.co/query";
    const pair = `${symbol}/USD`;
    
    // Fetch daily forex prices
    const priceUrl = `${baseUrl}?function=FX_DAILY&from_symbol=${symbol}&to_symbol=USD&apikey=${apiKey}`;
    const priceData = await fetchWithRetry(priceUrl);
    await sleep(RATE_LIMIT_DELAY);
    
    const timeSeries = priceData["Time Series FX (Daily)"];
    if (!timeSeries) return null;
    
    const dates = Object.keys(timeSeries).sort().reverse();
    const latestDate = dates[0];
    const latest = timeSeries[latestDate];
    const prevDate = dates[1];
    const prev = timeSeries[prevDate];
    
    const price = parseFloat(latest["4. close"]);
    const prevClose = parseFloat(prev["4. close"]);
    const changePercent = ((price - prevClose) / prevClose) * 100;

    // Calculate indicators from price history
    const closes: number[] = [];
    for (let i = 0; i < Math.min(200, dates.length); i++) {
      closes.push(parseFloat(timeSeries[dates[i]]["4. close"]));
    }

    const indicators: Record<string, any> = { price };
    
    // Calculate RSI
    if (closes.length >= 15) {
      let gains = 0, losses = 0;
      for (let i = 1; i <= 14; i++) {
        const change = closes[i - 1] - closes[i];
        if (change > 0) gains += change;
        else losses -= change;
      }
      const avgGain = gains / 14;
      const avgLoss = losses / 14;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      indicators.rsi = 100 - (100 / (1 + rs));
    }

    // Calculate EMA 50 for forex (shorter timeframe)
    if (closes.length >= 50) {
      const multiplier = 2 / (50 + 1);
      let ema = closes[closes.length - 1];
      for (let i = closes.length - 2; i >= 0; i--) {
        ema = (closes[i] - ema) * multiplier + ema;
      }
      indicators.ema50 = ema;
      indicators.ema200 = ema; // Use as proxy for scoring
    }

    const { score, direction, signals } = computeScore(indicators);

    return {
      symbol: `${symbol}/USD`,
      asset_class: 'forex',
      score,
      direction,
      signals_bullish: signals.bullish,
      signals_bearish: signals.bearish,
      signals_neutral: signals.neutral,
      price,
      change_percent: changePercent,
      indicators
    };
  } catch (e) {
    console.error(`Error scanning forex ${symbol}:`, e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret or admin
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Check if admin call
      const { searchParams } = new URL(req.url);
      const adminKey = searchParams.get("key");
      if (adminKey !== process.env.ADMIN_SECRET && adminKey !== process.env.ADMIN_API_KEY) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    const results: any[] = [];
    const errors: string[] = [];

    // Scan equities (limit to top 10 to stay within time/rate limits)
    console.log("Starting equity scan...");
    const equitiesToScan = EQUITY_UNIVERSE.slice(0, 10);
    for (const symbol of equitiesToScan) {
      const result = await scanEquity(symbol, apiKey);
      if (result) results.push(result);
      else errors.push(`equity:${symbol}`);
    }

    // Scan crypto (limit to top 5)
    console.log("Starting crypto scan...");
    const cryptoToScan = CRYPTO_UNIVERSE.slice(0, 5);
    for (const symbol of cryptoToScan) {
      const result = await scanCrypto(symbol, apiKey);
      if (result) results.push(result);
      else errors.push(`crypto:${symbol}`);
    }

    // Scan forex (limit to top 5)
    console.log("Starting forex scan...");
    const forexToScan = FOREX_UNIVERSE.slice(0, 5);
    for (const symbol of forexToScan) {
      const result = await scanForex(symbol, apiKey);
      if (result) results.push(result);
      else errors.push(`forex:${symbol}`);
    }

    // Store results in database
    const today = new Date().toISOString().split('T')[0];
    
    // Delete old entries for today (in case of re-run)
    await q(`DELETE FROM daily_picks WHERE scan_date = $1`, [today]);

    // Insert new results
    for (const r of results) {
      await q(`
        INSERT INTO daily_picks (
          asset_class, symbol, score, direction,
          signals_bullish, signals_bearish, signals_neutral,
          price, change_percent, indicators, scan_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        r.asset_class,
        r.symbol,
        r.score,
        r.direction,
        r.signals_bullish,
        r.signals_bearish,
        r.signals_neutral,
        r.price,
        r.change_percent,
        JSON.stringify(r.indicators),
        today
      ]);
    }

    // Clean up old data (keep 30 days)
    await q(`DELETE FROM daily_picks WHERE scan_date < CURRENT_DATE - INTERVAL '30 days'`);

    return NextResponse.json({
      success: true,
      scanned: results.length,
      errors: errors.length,
      errorSymbols: errors,
      topPicks: {
        equity: results.filter(r => r.asset_class === 'equity').sort((a, b) => b.score - a.score)[0],
        crypto: results.filter(r => r.asset_class === 'crypto').sort((a, b) => b.score - a.score)[0],
        forex: results.filter(r => r.asset_class === 'forex').sort((a, b) => b.score - a.score)[0]
      }
    });

  } catch (error) {
    console.error("Daily scan error:", error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Scan failed" 
    }, { status: 500 });
  }
}

// Also support GET for manual trigger with admin key
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const adminKey = searchParams.get("key");
  
  if (adminKey !== process.env.ADMIN_SECRET && adminKey !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  // Forward to POST handler
  return POST(req);
}
