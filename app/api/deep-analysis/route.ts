import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from '@/lib/auth';
import { estimateGreeks } from '@/lib/options-confluence-analyzer';
import { hasProTraderAccess } from '@/lib/proTraderAccess';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

// NOTE: Using HISTORICAL_OPTIONS (end-of-day data) - available with 75 req/min premium plan
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Get the Friday of the current week (or next week if past Friday)
function getThisWeekFriday(): number {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 5 = Friday
  let daysUntilFriday = 5 - dayOfWeek;
  
  // If it's Friday after market close or Saturday/Sunday, get next Friday
  if (daysUntilFriday < 0 || (daysUntilFriday === 0 && now.getUTCHours() >= 21)) {
    daysUntilFriday += 7;
  }
  
  const friday = new Date(now);
  friday.setUTCDate(friday.getUTCDate() + daysUntilFriday);
  friday.setUTCHours(0, 0, 0, 0);
  
  return Math.floor(friday.getTime() / 1000);
}

// Fetch options chain from Alpha Vantage (legally compliant, already paid for)
async function fetchOptionsData(symbol: string) {
  console.log(`🔄 fetchOptionsData() called for ${symbol}`);
  
  // HISTORICAL_OPTIONS - end-of-day data, available with 75 req/min premium plan
  if (!ALPHA_VANTAGE_API_KEY) {
    console.warn('⚠️ ALPHA_VANTAGE_API_KEY not set - options data unavailable');
    return null;
  }
  
  console.log(`✅ API key exists (length: ${ALPHA_VANTAGE_API_KEY.length})`);
  
  try {
    // Get current price first for reference
    const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&entitlement=delayed&apikey=${ALPHA_VANTAGE_API_KEY}`;
    console.log(`📊 Fetching quote for ${symbol}...`);
    const quoteRes = await fetch(quoteUrl);
    const quoteData = await quoteRes.json();
    console.log(`📊 Quote response:`, JSON.stringify(quoteData).substring(0, 200));
    
    // Handle both realtime and delayed response formats
    // Delayed API returns: "Global Quote - DATA DELAYED BY 15 MINUTES" as key
    const globalQuote = quoteData['Global Quote'] || quoteData['Global Quote - DATA DELAYED BY 15 MINUTES'];
    const currentPrice = parseFloat(globalQuote?.['05. price'] || '0');
    
    if (!currentPrice) {
      console.log(`❌ No price data for ${symbol}, skipping options. Keys found: ${Object.keys(quoteData).join(', ')}`);
      return null;
    }
    console.log(`✅ Got price for ${symbol}: $${currentPrice}`);

    // Alpha Vantage HISTORICAL_OPTIONS endpoint (end-of-day data)
    // When date is not specified, returns data from the previous trading session
    const optionsUrl = `https://www.alphavantage.co/query?function=HISTORICAL_OPTIONS&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    
    console.log(`📈 Fetching HISTORICAL_OPTIONS for ${symbol}...`);
    const optionsRes = await fetch(optionsUrl);
    console.log(`📈 Options response status: ${optionsRes.status}`);
    
    if (!optionsRes.ok) {
      console.log('❌ Alpha Vantage options fetch failed:', optionsRes.status);
      return null;
    }
    
    const optionsData = await optionsRes.json();
    console.log(`📈 Options response keys: ${Object.keys(optionsData).join(', ')}`);
    
    // Check for API errors
    if (optionsData.Note || optionsData.Error || optionsData['Error Message']) {
      console.log(`❌ Alpha Vantage options error for ${symbol}:`, optionsData.Note || optionsData.Error || optionsData['Error Message']);
      return null;
    }
    
    const rawData = optionsData.data;
    
    if (!rawData || rawData.length === 0) {
      console.log(`❌ No options data available for ${symbol}`);
      return null;
    }
    
    console.log(`✅ ${symbol} - Retrieved ${rawData.length} option contracts from Alpha Vantage`);
    
    // Separate calls and puts
    const calls = rawData.filter((opt: any) => opt.type === 'call');
    const puts = rawData.filter((opt: any) => opt.type === 'put');
    
    if (calls.length === 0 && puts.length === 0) {
      console.log(`${symbol} - No valid calls or puts found`);
      return null;
    }
    
    // Find the most common expiry date (weekly options closest to Friday)
    const expiryMap: Record<string, number> = {};
    rawData.forEach((opt: any) => {
      if (opt.expiration) {
        expiryMap[opt.expiration] = (expiryMap[opt.expiration] || 0) + 1;
      }
    });
    
    const targetFriday = getThisWeekFriday();
    const targetDate = new Date(targetFriday * 1000).toISOString().split('T')[0];
    
    // Use the date with most contracts, or closest to target Friday
    let bestExpiry = Object.keys(expiryMap)[0];
    let maxContracts = 0;
    
    for (const [expiry, count] of Object.entries(expiryMap)) {
      if (count > maxContracts || (count === maxContracts && Math.abs(new Date(expiry).getTime() - new Date(targetDate).getTime()) < Math.abs(new Date(bestExpiry).getTime() - new Date(targetDate).getTime()))) {
        bestExpiry = expiry;
        maxContracts = count;
      }
    }
    
    // Filter to use only the best expiry
    const callsFiltered = calls.filter((c: any) => c.expiration === bestExpiry);
    const putsFiltered = puts.filter((p: any) => p.expiration === bestExpiry);
    
    console.log(`${symbol} - Using expiry: ${bestExpiry}, Calls: ${callsFiltered.length}, Puts: ${putsFiltered.length}`);
    
    // Calculate DTE for Greeks fallback
    const expiryDateObj = new Date(bestExpiry);
    const today = new Date();
    const daysToExpiry = Math.max(1, Math.ceil((expiryDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    
    // Convert Alpha Vantage format to our internal format (including Greeks with Black-Scholes fallback)
    const formatOption = (opt: any, isCall: boolean) => {
      const strike = parseFloat(opt.strike);
      const iv = parseFloat(opt.implied_volatility || '0') || 0.25;  // Default 25% IV
      
      // Parse API Greeks
      const apiDelta = parseFloat(opt.delta || '0');
      const apiGamma = parseFloat(opt.gamma || '0');
      const apiTheta = parseFloat(opt.theta || '0');
      const apiVega = parseFloat(opt.vega || '0');
      
      // Use Black-Scholes fallback when API doesn't provide Greeks (returns 0)
      let delta = apiDelta, gamma = apiGamma, theta = apiTheta, vega = apiVega;
      if (apiDelta === 0 && apiGamma === 0 && apiTheta === 0) {
        const estimated = estimateGreeks(currentPrice, strike, daysToExpiry, 0.05, iv, isCall);
        delta = estimated.delta;
        gamma = estimated.gamma;
        theta = estimated.theta;
        vega = estimated.vega;
      }
      
      return {
        strike,
        openInterest: parseInt(opt.open_interest || '0', 10),
        volume: parseInt(opt.volume || '0', 10),
        impliedVolatility: iv,
        lastPrice: parseFloat(opt.last_price || opt.mark || '0'),
        delta,
        gamma,
        theta,
        vega,
        rho: parseFloat(opt.rho || '0')
      };
    };
    
    const formattedCalls = callsFiltered.map((opt: any) => formatOption(opt, true));
    const formattedPuts = putsFiltered.map((opt: any) => formatOption(opt, false));
    
    // Calculate IV statistics across all options
    const allIVs = [...formattedCalls, ...formattedPuts]
      .map(o => o.impliedVolatility)
      .filter(iv => iv > 0 && iv < 5); // Filter reasonable IVs (0-500%)
    
    const avgIV = allIVs.length > 0 ? allIVs.reduce((a: number, b: number) => a + b, 0) / allIVs.length : 0;
    const minIV = allIVs.length > 0 ? Math.min(...allIVs) : 0;
    const maxIV = allIVs.length > 0 ? Math.max(...allIVs) : 0;
    // IV Rank: where current IV sits in its range (simplified - ideally use 52-week data)
    const ivRank = maxIV > minIV ? ((avgIV - minIV) / (maxIV - minIV)) * 100 : 50;
    
    // Calculate total volume and Volume/OI ratio for unusual activity detection
    const totalCallVolume = formattedCalls.reduce((sum: number, c: { volume: number }) => sum + c.volume, 0);
    const totalPutVolume = formattedPuts.reduce((sum: number, p: { volume: number }) => sum + p.volume, 0);
    const totalVolume = totalCallVolume + totalPutVolume;
    
    // Sort by OI to find highest
    const callsByOI = [...formattedCalls].sort((a, b) => b.openInterest - a.openInterest);
    const putsByOI = [...formattedPuts].sort((a, b) => b.openInterest - a.openInterest);
    
    console.log(`${symbol} TOP 5 CALLS by OI:`, callsByOI.slice(0, 5).map(c => `$${c.strike}=${c.openInterest}`).join(', '));
    console.log(`${symbol} TOP 5 PUTS by OI:`, putsByOI.slice(0, 5).map(p => `$${p.strike}=${p.openInterest}`).join(', '));
    
    const highestOICall = callsByOI.length > 0 && callsByOI[0].openInterest > 0 ? callsByOI[0] : null;
    const highestOIPut = putsByOI.length > 0 && putsByOI[0].openInterest > 0 ? putsByOI[0] : null;
    
    // Log Greeks for debugging
    if (highestOICall) {
      console.log(`${symbol} Highest OI Call Greeks: strike=$${highestOICall.strike}, delta=${highestOICall.delta}, gamma=${highestOICall.gamma}, theta=${highestOICall.theta}, vega=${highestOICall.vega}`);
    }
    if (highestOIPut) {
      console.log(`${symbol} Highest OI Put Greeks: strike=$${highestOIPut.strike}, delta=${highestOIPut.delta}, gamma=${highestOIPut.gamma}, theta=${highestOIPut.theta}, vega=${highestOIPut.vega}`);
    }
    
    // Calculate totals
    const totalCallOI = formattedCalls.reduce((sum: number, c: { openInterest: number }) => sum + c.openInterest, 0);
    const totalPutOI = formattedPuts.reduce((sum: number, p: { openInterest: number }) => sum + p.openInterest, 0);
    const totalOI = totalCallOI + totalPutOI;
    const putCallRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;
    
    // Volume/OI ratio - values > 1 indicate unusual activity
    const volumeOIRatio = totalOI > 0 ? totalVolume / totalOI : 0;
    const callVolumeOIRatio = totalCallOI > 0 ? totalCallVolume / totalCallOI : 0;
    const putVolumeOIRatio = totalPutOI > 0 ? totalPutVolume / totalPutOI : 0;
    
    // Detect unusual activity (Volume/OI > 0.5 is notable, > 1 is very unusual)
    const unusualActivity = volumeOIRatio > 1 ? 'Very High' : volumeOIRatio > 0.5 ? 'Elevated' : 'Normal';
    
    console.log(`${symbol} total OI - Calls: ${totalCallOI}, Puts: ${totalPutOI}, P/C: ${putCallRatio.toFixed(2)}, Vol/OI: ${volumeOIRatio.toFixed(2)}`);
    
    // Calculate max pain
    const maxPain = calculateMaxPain(formattedCalls, formattedPuts, currentPrice);
    
    // Find key levels
    const keyLevels = findKeyOptionsLevels(formattedCalls, formattedPuts, currentPrice);
    
    const expiryDate = new Date(bestExpiry);
    
    return {
      expiryDate: bestExpiry,
      expiryFormatted: expiryDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      currentPrice,
      highestOICall,
      highestOIPut,
      totalCallOI,
      totalPutOI,
      totalVolume,
      putCallRatio,
      maxPain,
      keyLevels,
      // New fields
      avgIV: avgIV * 100, // Convert to percentage
      ivRank,
      volumeOIRatio,
      callVolumeOIRatio,
      putVolumeOIRatio,
      unusualActivity,
      sentiment: putCallRatio > 1.2 ? 'Bearish' as const : putCallRatio < 0.8 ? 'Bullish' as const : 'Neutral' as const
    };
  } catch (err) {
    console.error('Alpha Vantage options fetch error:', err);
    return null;
  }
}

// Calculate Max Pain (price where most options expire worthless)
function calculateMaxPain(calls: any[], puts: any[], currentPrice: number): number {
  if (!calls.length && !puts.length) return currentPrice;
  
  // Get all unique strikes
  const allStrikes = [...new Set([
    ...calls.map((c: any) => c.strike),
    ...puts.map((p: any) => p.strike)
  ])].sort((a, b) => a - b);
  
  let minPain = Infinity;
  let maxPainStrike = currentPrice;
  
  for (const testPrice of allStrikes) {
    let totalPain = 0;
    
    // Call pain: if price < strike, call is worthless, no pain
    // If price > strike, pain = (price - strike) * OI * 100
    for (const call of calls) {
      if (testPrice > call.strike) {
        totalPain += (testPrice - call.strike) * (call.openInterest || 0) * 100;
      }
    }
    
    // Put pain: if price > strike, put is worthless, no pain
    // If price < strike, pain = (strike - price) * OI * 100
    for (const put of puts) {
      if (testPrice < put.strike) {
        totalPain += (put.strike - testPrice) * (put.openInterest || 0) * 100;
      }
    }
    
    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = testPrice;
    }
  }
  
  return maxPainStrike;
}

// Find key support/resistance levels from high OI strikes
function findKeyOptionsLevels(calls: any[], puts: any[], currentPrice: number): { support: number[]; resistance: number[] } {
  // High OI puts below current price = support
  // High OI calls above current price = resistance
  
  const sortedPuts = [...puts]
    .filter((p: any) => p.strike < currentPrice && p.openInterest > 0)
    .sort((a: any, b: any) => (b.openInterest || 0) - (a.openInterest || 0));
  
  const sortedCalls = [...calls]
    .filter((c: any) => c.strike > currentPrice && c.openInterest > 0)
    .sort((a: any, b: any) => (b.openInterest || 0) - (a.openInterest || 0));
  
  return {
    support: sortedPuts.slice(0, 3).map((p: any) => p.strike),
    resistance: sortedCalls.slice(0, 3).map((c: any) => c.strike)
  };
}

// Detect asset type from symbol
function detectAssetType(symbol: string): 'crypto' | 'forex' | 'commodity' | 'stock' {
  const s = symbol.toUpperCase();
  
  // Comprehensive crypto list - top 150+ by market cap on major exchanges
  const cryptoSymbols = [
    // Top 50
    'BTC', 'ETH', 'XRP', 'SOL', 'ADA', 'DOGE', 'TRX', 'AVAX', 'LINK', 'DOT',
    'MATIC', 'SHIB', 'LTC', 'BCH', 'NEAR', 'UNI', 'ATOM', 'XLM', 'ICP', 'HBAR',
    'FIL', 'VET', 'IMX', 'APT', 'GRT', 'INJ', 'OP', 'THETA', 'FTM', 'RUNE',
    'LDO', 'ALGO', 'XMR', 'AAVE', 'MKR', 'STX', 'EGLD', 'FLOW', 'AXS', 'SAND',
    'EOS', 'XTZ', 'NEO', 'KAVA', 'CFX', 'MINA', 'SNX', 'CRV', 'DYDX', 'BLUR',
    // 51-100
    'AR', 'SUI', 'SEI', 'TIA', 'JUP', 'WIF', 'PEPE', 'BONK', 'FLOKI', 'MEME',
    'ORDI', 'SATS', '1000SATS', 'PYTH', 'STRK', 'WLD', 'FET', 'RNDR', 'AGIX', 'OCEAN',
    'TAO', 'ROSE', 'ZIL', 'IOTA', 'ZEC', 'DASH', 'BAT', 'ZRX', 'ENJ', 'MANA',
    'GALA', 'APE', 'GMT', 'ARB', 'MAGIC', 'GMX', 'COMP', 'YFI', 'SUSHI', '1INCH',
    'LRC', 'MASK', 'SKL', 'ENS', 'ANKR', 'STORJ', 'CELO', 'CHZ', 'HOT', 'ONE',
    // 101-150+
    'QTUM', 'ZEN', 'IOST', 'ICX', 'ONT', 'RVN', 'WAVES', 'AUDIO', 'BAND', 'CELR',
    'CTSI', 'DENT', 'DGB', 'FLUX', 'GLMR', 'JASMY', 'JOE', 'KDA', 'KSM', 'LINA',
    'LOOM', 'MTL', 'NKN', 'NTRN', 'OGN', 'OMG', 'PAXG', 'PEOPLE', 'PERP', 'POLS',
    'POND', 'QNT', 'REEF', 'RSR', 'RLC', 'SC', 'SFP', 'SLP', 'SNT', 'SXP',
    'T', 'TWT', 'UMA', 'UNFI', 'VGX', 'VOXEL', 'WIN', 'WOO', 'XEC', 'XEM', 'XVS', 'YGG'
  ];
  if (cryptoSymbols.includes(s) || s.endsWith('USDT') || s.endsWith('USD') && cryptoSymbols.some(c => s.startsWith(c))) {
    return 'crypto';
  }
  
  // Forex patterns
  const forexPairs = ['EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'CNY', 'HKD', 'SGD', 'SEK', 'NOK', 'MXN', 'ZAR', 'TRY', 'INR', 'BRL', 'KRW'];
  if (s.length === 6 && forexPairs.some(f => s.includes(f))) {
    return 'forex';
  }
  
  // Commodities
  const commodities = ['GOLD', 'SILVER', 'OIL', 'GAS', 'WHEAT', 'CORN', 'COPPER', 'PLATINUM', 'PALLADIUM', 'XAU', 'XAG', 'WTI', 'BRENT', 'NG'];
  if (commodities.some(c => s.includes(c))) {
    return 'commodity';
  }
  
  return 'stock';
}

// Fetch price data from appropriate source
async function fetchPriceData(symbol: string, assetType: string) {
  try {
    if (assetType === 'crypto') {
      // Use Binance for crypto
      const cleanSymbol = symbol.toUpperCase().replace(/[-\/]/g, '');
      const pair = cleanSymbol.endsWith('USDT') ? cleanSymbol : `${cleanSymbol}USDT`;
      
      const [tickerRes, klineRes] = await Promise.all([
        fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`),
        fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1d&limit=30`)
      ]);
      
      if (!tickerRes.ok) throw new Error('Binance API error');
      
      const ticker = await tickerRes.json();
      const klines = klineRes.ok ? await klineRes.json() : [];
      
      return {
        price: parseFloat(ticker.lastPrice),
        change: parseFloat(ticker.priceChange),
        changePercent: parseFloat(ticker.priceChangePercent),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
        volume: parseFloat(ticker.volume),
        quoteVolume: parseFloat(ticker.quoteVolume),
        historicalPrices: klines.map((k: any) => ({
          date: new Date(k[0]).toISOString().split('T')[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5])
        }))
      };
    } else {
      // Use Alpha Vantage for stocks/forex/commodities
      const func = assetType === 'forex' ? 'FX_DAILY' : 'TIME_SERIES_DAILY';
      const symbolParam = assetType === 'forex' 
        ? `from_symbol=${symbol.slice(0,3)}&to_symbol=${symbol.slice(3,6)}`
        : `symbol=${symbol}`;
      
      const url = `https://www.alphavantage.co/query?function=${func}&${symbolParam}&apikey=${ALPHA_VANTAGE_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      
      const timeSeriesKey = Object.keys(data).find(k => k.includes('Time Series'));
      if (!timeSeriesKey) throw new Error('No time series data');
      
      const timeSeries = data[timeSeriesKey];
      const dates = Object.keys(timeSeries).sort().reverse();
      const latest = timeSeries[dates[0]];
      const previous = timeSeries[dates[1]];
      
      const price = parseFloat(latest['4. close']);
      const prevClose = parseFloat(previous['4. close']);
      
      return {
        price,
        change: price - prevClose,
        changePercent: ((price - prevClose) / prevClose) * 100,
        high24h: parseFloat(latest['2. high']),
        low24h: parseFloat(latest['3. low']),
        volume: parseFloat(latest['5. volume'] || '0'),
        historicalPrices: dates.slice(0, 30).map(d => ({
          date: d,
          open: parseFloat(timeSeries[d]['1. open']),
          high: parseFloat(timeSeries[d]['2. high']),
          low: parseFloat(timeSeries[d]['3. low']),
          close: parseFloat(timeSeries[d]['4. close']),
          volume: parseFloat(timeSeries[d]['5. volume'] || '0')
        }))
      };
    }
  } catch (err) {
    console.error('Price fetch error:', err);
    return null;
  }
}

// Fetch technical indicators
async function fetchTechnicalIndicators(symbol: string, assetType: string) {
  try {
    if (assetType === 'crypto') {
      // Calculate from Binance klines
      const pair = symbol.toUpperCase().replace(/[-\/]/g, '');
      const binanceSymbol = pair.endsWith('USDT') ? pair : `${pair}USDT`;
      
      const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1d&limit=50`);
      if (!res.ok) return null;
      
      const klines = await res.json();
      const closes = klines.map((k: any) => parseFloat(k[4]));
      const highs = klines.map((k: any) => parseFloat(k[2]));
      const lows = klines.map((k: any) => parseFloat(k[3]));
      const volumes = klines.map((k: any) => parseFloat(k[5]));
      
      // Calculate indicators
      const sma20 = closes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
      const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((a: number, b: number) => a + b, 0) / 50 : null;
      const ema12 = calculateEMA(closes, 12);
      const ema26 = calculateEMA(closes, 26);
      const macd = ema12 - ema26;
      const rsi = calculateRSI(closes, 14);
      const { stochK, stochD } = calculateStochastic(closes, highs, lows, 14, 3);
      const atr = calculateATR(highs, lows, closes, 14);
      const avgVolume = volumes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
      const volumeRatio = volumes[volumes.length - 1] / avgVolume;
      
      return {
        sma20,
        sma50,
        ema12,
        ema26,
        macd,
        rsi,
        stochK,
        stochD,
        atr,
        volumeRatio,
        priceVsSma20: ((closes[closes.length - 1] - sma20) / sma20) * 100,
        priceVsSma50: sma50 ? ((closes[closes.length - 1] - sma50) / sma50) * 100 : null,
      };
    } else {
      // Use Alpha Vantage for stocks - fetch in batches to avoid rate limits
      // Batch 1: Core indicators
      const [rsiRes, macdRes, smaRes, sma50Res] = await Promise.all([
        fetch(`https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=daily&time_period=14&series_type=close&apikey=${ALPHA_VANTAGE_API_KEY}`),
        fetch(`https://www.alphavantage.co/query?function=MACD&symbol=${symbol}&interval=daily&series_type=close&apikey=${ALPHA_VANTAGE_API_KEY}`),
        fetch(`https://www.alphavantage.co/query?function=SMA&symbol=${symbol}&interval=daily&time_period=20&series_type=close&apikey=${ALPHA_VANTAGE_API_KEY}`),
        fetch(`https://www.alphavantage.co/query?function=SMA&symbol=${symbol}&interval=daily&time_period=50&series_type=close&apikey=${ALPHA_VANTAGE_API_KEY}`)
      ]);
      
      const rsiData = await rsiRes.json();
      const macdData = await macdRes.json();
      const smaData = await smaRes.json();
      const sma50Data = await sma50Res.json();
      
      // Wait 300ms before batch 2 to respect Alpha Vantage 5 req/sec limit
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Batch 2: Additional indicators (Bollinger Bands, ADX)
      const [bbandsRes, adxRes] = await Promise.all([
        fetch(`https://www.alphavantage.co/query?function=BBANDS&symbol=${symbol}&interval=daily&time_period=20&series_type=close&apikey=${ALPHA_VANTAGE_API_KEY}`),
        fetch(`https://www.alphavantage.co/query?function=ADX&symbol=${symbol}&interval=daily&time_period=14&apikey=${ALPHA_VANTAGE_API_KEY}`)
      ]);
      
      const bbandsData = await bbandsRes.json();
      const adxData = await adxRes.json();
      
      const rsiValues = rsiData['Technical Analysis: RSI'];
      const macdValues = macdData['Technical Analysis: MACD'];
      const smaValues = smaData['Technical Analysis: SMA'];
      const sma50Values = sma50Data['Technical Analysis: SMA'];
      const bbandsValues = bbandsData['Technical Analysis: BBANDS'];
      const adxValues = adxData['Technical Analysis: ADX'];
      
      const latestRsi = rsiValues ? parseFloat((Object.values(rsiValues)[0] as any)?.RSI) || null : null;
      const latestMacd = macdValues ? Object.values(macdValues)[0] as any : null;
      const latestSma = smaValues ? parseFloat((Object.values(smaValues)[0] as any)?.SMA) || null : null;
      const latestSma50 = sma50Values ? parseFloat((Object.values(sma50Values)[0] as any)?.SMA) || null : null;
      const latestBbands = bbandsValues ? Object.values(bbandsValues)[0] as any : null;
      const latestAdx = adxValues ? parseFloat((Object.values(adxValues)[0] as any)?.ADX) || null : null;
      
      return {
        rsi: latestRsi,
        macd: latestMacd?.MACD ? parseFloat(latestMacd.MACD) : null,
        macdSignal: latestMacd?.MACD_Signal ? parseFloat(latestMacd.MACD_Signal) : null,
        macdHist: latestMacd?.MACD_Hist ? parseFloat(latestMacd.MACD_Hist) : null,
        sma20: latestSma,
        sma50: latestSma50,
        bbUpper: latestBbands?.['Real Upper Band'] ? parseFloat(latestBbands['Real Upper Band']) : null,
        bbMiddle: latestBbands?.['Real Middle Band'] ? parseFloat(latestBbands['Real Middle Band']) : null,
        bbLower: latestBbands?.['Real Lower Band'] ? parseFloat(latestBbands['Real Lower Band']) : null,
        adx: latestAdx,
      };
    }
  } catch (err) {
    console.error('Indicators fetch error:', err);
    return null;
  }
}

// Fetch company overview (for stocks)
async function fetchCompanyOverview(symbol: string) {
  try {
    const res = await fetch(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`);
    const data = await res.json();
    
    if (!data.Symbol) return null;
    
    return {
      name: data.Name,
      description: data.Description,
      sector: data.Sector,
      industry: data.Industry,
      marketCap: data.MarketCapitalization,
      peRatio: data.PERatio !== 'None' ? parseFloat(data.PERatio) : null,
      forwardPE: data.ForwardPE !== 'None' ? parseFloat(data.ForwardPE) : null,
      eps: data.EPS !== 'None' ? parseFloat(data.EPS) : null,
      dividendYield: data.DividendYield !== 'None' ? parseFloat(data.DividendYield) * 100 : null,
      week52High: data['52WeekHigh'] !== 'None' ? parseFloat(data['52WeekHigh']) : null,
      week52Low: data['52WeekLow'] !== 'None' ? parseFloat(data['52WeekLow']) : null,
      targetPrice: data.AnalystTargetPrice !== 'None' ? parseFloat(data.AnalystTargetPrice) : null,
      strongBuy: parseInt(data.AnalystRatingStrongBuy) || 0,
      buy: parseInt(data.AnalystRatingBuy) || 0,
      hold: parseInt(data.AnalystRatingHold) || 0,
      sell: parseInt(data.AnalystRatingSell) || 0,
      strongSell: parseInt(data.AnalystRatingStrongSell) || 0,
    };
  } catch (err) {
    return null;
  }
}

// Fetch news sentiment
async function fetchNewsSentiment(symbol: string, assetType: string) {
  try {
    if (assetType === 'crypto') {
      // Use CryptoCompare for crypto news
      return await fetchCryptoNews(symbol);
    }
    
    // Use Alpha Vantage for stocks
    const res = await fetch(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol}&limit=5&apikey=${ALPHA_VANTAGE_API_KEY}`);
    const data = await res.json();
    
    if (!data.feed) return null;
    
    return data.feed.slice(0, 5).map((article: any) => ({
      title: article.title,
      summary: article.summary,
      source: article.source,
      sentiment: article.overall_sentiment_label,
      sentimentScore: parseFloat(article.overall_sentiment_score),
      url: article.url,
      publishedAt: article.time_published
    }));
  } catch (err) {
    return null;
  }
}

// Fetch crypto news from multiple sources
async function fetchCryptoNews(symbol: string) {
  const cleanSymbol = symbol.toUpperCase().replace('USDT', '').replace('USD', '');
  
  try {
    // Try CryptoCompare News API (free, no key required for basic)
    const ccRes = await fetch(`https://min-api.cryptocompare.com/data/v2/news/?categories=${cleanSymbol}&excludeCategories=Sponsored`);
    const ccData = await ccRes.json();
    
    if (ccData.Data && ccData.Data.length > 0) {
      return ccData.Data.slice(0, 5).map((article: any) => {
        // Simple sentiment analysis based on keywords
        const text = (article.title + ' ' + article.body).toLowerCase();
        let sentiment = 'Neutral';
        let sentimentScore = 0;
        
        const bullishWords = ['bullish', 'surge', 'rally', 'soar', 'gain', 'rise', 'up', 'high', 'record', 'breakout', 'buy', 'positive', 'growth'];
        const bearishWords = ['bearish', 'crash', 'drop', 'fall', 'plunge', 'decline', 'down', 'low', 'sell', 'negative', 'fear', 'dump', 'loss'];
        
        let bullCount = bullishWords.filter(w => text.includes(w)).length;
        let bearCount = bearishWords.filter(w => text.includes(w)).length;
        
        if (bullCount > bearCount + 1) {
          sentiment = 'Bullish';
          sentimentScore = Math.min(0.5, bullCount * 0.1);
        } else if (bearCount > bullCount + 1) {
          sentiment = 'Bearish';
          sentimentScore = Math.max(-0.5, -bearCount * 0.1);
        }
        
        return {
          title: article.title,
          summary: article.body?.slice(0, 200) || '',
          source: article.source_info?.name || article.source || 'CryptoCompare',
          sentiment,
          sentimentScore,
          url: article.url || article.guid,
          publishedAt: new Date(article.published_on * 1000).toISOString()
        };
      });
    }
    
    // Fallback: Try Alpha Vantage with crypto topic
    const avRes = await fetch(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=blockchain,cryptocurrency&limit=5&apikey=${ALPHA_VANTAGE_API_KEY}`);
    const avData = await avRes.json();
    
    if (avData.feed) {
      return avData.feed.slice(0, 5).map((article: any) => ({
        title: article.title,
        summary: article.summary,
        source: article.source,
        sentiment: article.overall_sentiment_label,
        sentimentScore: parseFloat(article.overall_sentiment_score),
        url: article.url,
        publishedAt: article.time_published
      }));
    }
    
    return null;
  } catch (err) {
    console.error('Crypto news fetch error:', err);
    return null;
  }
}

// Fetch crypto-specific data
async function fetchCryptoData(symbol: string) {
  try {
    // Fear & Greed Index
    const fgRes = await fetch('https://api.alternative.me/fng/?limit=1');
    const fgData = await fgRes.json();
    
    // Try to get market data from CoinGecko
    const cgSymbol = symbol.toLowerCase().replace('usdt', '').replace('usd', '');
    const cgMapping: Record<string, string> = {
      'btc': 'bitcoin', 'eth': 'ethereum', 'xrp': 'ripple', 'sol': 'solana',
      'ada': 'cardano', 'doge': 'dogecoin', 'dot': 'polkadot', 'matic': 'polygon',
      'link': 'chainlink', 'avax': 'avalanche-2', 'shib': 'shiba-inu', 'ltc': 'litecoin'
    };
    
    let marketData = null;
    const cgId = cgMapping[cgSymbol];
    if (cgId) {
      try {
        const cgRes = await fetch(`https://api.coingecko.com/api/v3/coins/${cgId}?localization=false&tickers=false&community_data=false&developer_data=false`);
        if (cgRes.ok) {
          const cgData = await cgRes.json();
          marketData = {
            marketCapRank: cgData.market_cap_rank,
            marketCap: cgData.market_data?.market_cap?.usd,
            totalVolume: cgData.market_data?.total_volume?.usd,
            circulatingSupply: cgData.market_data?.circulating_supply,
            maxSupply: cgData.market_data?.max_supply,
            ath: cgData.market_data?.ath?.usd,
            athChangePercent: cgData.market_data?.ath_change_percentage?.usd,
            atl: cgData.market_data?.atl?.usd,
          };
        }
      } catch {}
    }
    
    return {
      fearGreed: {
        value: parseInt(fgData.data[0].value),
        classification: fgData.data[0].value_classification
      },
      marketData
    };
  } catch (err) {
    return null;
  }
}

// Fetch earnings data for stocks
async function fetchEarningsData(symbol: string) {
  try {
    const url = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (!data.annualEarnings && !data.quarterlyEarnings) {
      return null;
    }
    
    // Get upcoming and recent earnings
    const quarterly = data.quarterlyEarnings || [];
    const annual = data.annualEarnings || [];
    
    // Find the next upcoming report (estimated dates)
    const now = new Date();
    const upcoming = quarterly.find((e: any) => {
      const reportDate = new Date(e.reportedDate || e.fiscalDateEnding);
      return reportDate > now;
    });
    
    // Get most recent 4 quarters for history
    const recentQuarters = quarterly.slice(0, 4).map((q: any) => ({
      fiscalDateEnding: q.fiscalDateEnding,
      reportedDate: q.reportedDate,
      reportedEPS: parseFloat(q.reportedEPS) || null,
      estimatedEPS: parseFloat(q.estimatedEPS) || null,
      surprise: q.reportedEPS && q.estimatedEPS 
        ? parseFloat(q.reportedEPS) - parseFloat(q.estimatedEPS) 
        : null,
      surprisePercent: q.surprisePercentage ? parseFloat(q.surprisePercentage) : null,
      beat: q.reportedEPS && q.estimatedEPS 
        ? parseFloat(q.reportedEPS) > parseFloat(q.estimatedEPS) 
        : null
    }));
    
    // Calculate beat rate
    const beatsCount = recentQuarters.filter((q: any) => q.beat === true).length;
    const beatRate = recentQuarters.length > 0 ? (beatsCount / recentQuarters.length) * 100 : null;
    
    // Get last reported
    const lastReported = recentQuarters[0];
    
    return {
      nextEarningsDate: upcoming?.fiscalDateEnding || null,
      lastReportedDate: lastReported?.reportedDate || null,
      lastReportedEPS: lastReported?.reportedEPS || null,
      lastEstimatedEPS: lastReported?.estimatedEPS || null,
      lastSurprise: lastReported?.surprise || null,
      lastSurprisePercent: lastReported?.surprisePercent || null,
      lastBeat: lastReported?.beat || null,
      beatRate,
      recentQuarters,
      annualEPS: annual.slice(0, 3).map((a: any) => ({
        fiscalYear: a.fiscalDateEnding?.split('-')[0],
        eps: parseFloat(a.reportedEPS) || null
      }))
    };
  } catch (err) {
    console.error('Earnings fetch error:', err);
    return null;
  }
}

// Generate AI analysis
async function generateAIAnalysis(data: any) {
  if (!OPENAI_API_KEY) return null;
  
  try {
    const prompt = buildAnalysisPrompt(data);
    
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',  // Premium model for Golden Egg deep analysis
        messages: [
          {
            role: 'system',
            content: `You are the Golden Egg Analyst - an elite financial analyst providing comprehensive, actionable analysis by synthesizing ALL available data including price action, technicals, fundamentals, news sentiment, and market conditions.

Your analysis MUST consider and integrate:
- Price action and momentum (current price, 24h change, volume)
- Technical indicators (RSI, MACD, moving averages, stochastics)
- Company fundamentals (if stock: P/E, EPS, analyst targets, sector)
- News sentiment (summarize the overall sentiment from recent news)
- Market conditions (Fear & Greed for crypto, analyst consensus for stocks)
- Upcoming catalysts (earnings dates, significant events from news)

Format your analysis with these sections:
📊 MARKET CONTEXT - Big picture: what's driving this asset right now?
📈 TECHNICAL OUTLOOK - Indicator confluence and what the charts are saying
📰 SENTIMENT ANALYSIS - What the news flow and market sentiment suggest
🎯 KEY LEVELS - Critical support/resistance and price targets
⚠️ RISK FACTORS - What could invalidate this thesis?
💡 GOLDEN EGG VERDICT - Clear BUY/HOLD/SELL with confidence level (High/Medium/Low) and 1-2 sentence reasoning

Be bold with your verdict. Traders want clear direction, not wishy-washy analysis.
Max 500 words. Be concise but comprehensive.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 800,
        temperature: 0.7
      })
    });
    
    const result = await res.json();
    return result.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('AI analysis error:', err);
    return null;
  }
}

function buildAnalysisPrompt(data: any): string {
  let prompt = `Analyze ${data.symbol} (${data.assetType.toUpperCase()}):\n\n`;
  
  if (data.price) {
    prompt += `PRICE DATA:\n`;
    prompt += `- Current: $${data.price.price?.toFixed(data.assetType === 'crypto' ? 4 : 2)}\n`;
    prompt += `- 24h Change: ${data.price.changePercent?.toFixed(2)}%\n`;
    prompt += `- 24h High: $${data.price.high24h?.toFixed(2)}\n`;
    prompt += `- 24h Low: $${data.price.low24h?.toFixed(2)}\n\n`;
  }
  
  if (data.indicators) {
    prompt += `TECHNICAL INDICATORS:\n`;
    if (data.indicators.rsi) prompt += `- RSI(14): ${data.indicators.rsi.toFixed(1)}\n`;
    if (data.indicators.macd) prompt += `- MACD: ${data.indicators.macd.toFixed(4)}\n`;
    if (data.indicators.sma20) prompt += `- SMA20: $${data.indicators.sma20.toFixed(2)}\n`;
    if (data.indicators.priceVsSma20) prompt += `- Price vs SMA20: ${data.indicators.priceVsSma20.toFixed(2)}%\n`;
    if (data.indicators.stochK) prompt += `- Stochastic: K=${data.indicators.stochK.toFixed(1)}, D=${data.indicators.stochD?.toFixed(1)}\n`;
    if (data.indicators.volumeRatio) prompt += `- Volume Ratio (vs 20d avg): ${data.indicators.volumeRatio.toFixed(2)}x\n`;
    prompt += '\n';
  }
  
  if (data.company) {
    prompt += `COMPANY DATA:\n`;
    prompt += `- Name: ${data.company.name}\n`;
    prompt += `- Sector: ${data.company.sector}\n`;
    if (data.company.peRatio) prompt += `- P/E: ${data.company.peRatio}\n`;
    if (data.company.eps) prompt += `- EPS: $${data.company.eps}\n`;
    if (data.company.targetPrice) prompt += `- Analyst Target: $${data.company.targetPrice}\n`;
    if (data.company.week52High) prompt += `- 52W Range: $${data.company.week52Low} - $${data.company.week52High}\n`;
    prompt += '\n';
  }
  
  if (data.cryptoData?.fearGreed) {
    prompt += `CRYPTO MARKET:\n`;
    prompt += `- Fear & Greed: ${data.cryptoData.fearGreed.value} (${data.cryptoData.fearGreed.classification})\n`;
    if (data.cryptoData.marketData?.marketCapRank) {
      prompt += `- Market Cap Rank: #${data.cryptoData.marketData.marketCapRank}\n`;
    }
    prompt += '\n';
  }
  
  if (data.earnings) {
    prompt += `EARNINGS DATA:\n`;
    if (data.earnings.nextEarningsDate) {
      prompt += `- Next Earnings: ${data.earnings.nextEarningsDate}\n`;
    }
    if (data.earnings.lastReportedEPS !== null) {
      prompt += `- Last EPS: $${data.earnings.lastReportedEPS?.toFixed(2)} (Est: $${data.earnings.lastEstimatedEPS?.toFixed(2)})\n`;
      prompt += `- Last Surprise: ${data.earnings.lastBeat ? '✅ BEAT' : '❌ MISS'} by ${data.earnings.lastSurprisePercent?.toFixed(1)}%\n`;
    }
    if (data.earnings.beatRate !== null) {
      prompt += `- Beat Rate (last 4Q): ${data.earnings.beatRate.toFixed(0)}%\n`;
    }
    prompt += '\n';
  }
  
  if (data.news?.length > 0) {
    prompt += `RECENT NEWS & SENTIMENT:\n`;
    // Calculate overall sentiment
    const sentiments = data.news.map((n: any) => n.sentiment?.toLowerCase() || 'neutral');
    const bullishCount = sentiments.filter((s: string) => s.includes('bullish')).length;
    const bearishCount = sentiments.filter((s: string) => s.includes('bearish')).length;
    const neutralCount = sentiments.filter((s: string) => !s.includes('bullish') && !s.includes('bearish')).length;
    
    prompt += `- Overall Sentiment: ${bullishCount} Bullish, ${bearishCount} Bearish, ${neutralCount} Neutral\n`;
    prompt += `- Headlines:\n`;
    data.news.slice(0, 5).forEach((n: any, i: number) => {
      prompt += `  ${i+1}. [${n.sentiment || 'Neutral'}] "${n.title}" (${n.source})\n`;
      if (n.summary) {
        prompt += `     Summary: ${n.summary.slice(0, 100)}...\n`;
      }
    });
    prompt += '\n';
  }
  
  prompt += `Based on ALL the data above, provide a comprehensive Golden Egg analysis with a clear, actionable verdict.`;
  
  return prompt;
}

// Helper functions for technical indicators
function calculateEMA(data: number[], period: number): number {
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a: number, b: number) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateRSI(closes: number[], period: number): number {
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const rs = gains / (losses || 1);
  return 100 - (100 / (1 + rs));
}

function calculateStochastic(closes: number[], highs: number[], lows: number[], kPeriod: number, dPeriod: number) {
  const recentCloses = closes.slice(-kPeriod);
  const recentHighs = highs.slice(-kPeriod);
  const recentLows = lows.slice(-kPeriod);
  
  const highestHigh = Math.max(...recentHighs);
  const lowestLow = Math.min(...recentLows);
  const currentClose = closes[closes.length - 1];
  
  const stochK = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
  const stochD = stochK; // Simplified
  
  return { stochK, stochD };
}

function calculateATR(highs: number[], lows: number[], closes: number[], period: number): number {
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  return trs.slice(-period).reduce((a: number, b: number) => a + b, 0) / period;
}

// Generate trading signals
function generateSignals(data: any): { signal: string; score: number; reasons: string[]; bullishCount: number; bearishCount: number } {
  const reasons: string[] = [];
  let bullish = 0;
  let bearish = 0;
  
  if (data.indicators) {
    const ind = data.indicators;
    
    // RSI signals - always show RSI status
    if (ind.rsi !== null && ind.rsi !== undefined) {
      if (ind.rsi < 30) { bullish += 2; reasons.push(`RSI ${ind.rsi.toFixed(1)} - Oversold (bullish reversal potential)`); }
      else if (ind.rsi < 40) { bullish += 1; reasons.push(`RSI ${ind.rsi.toFixed(1)} - Approaching oversold`); }
      else if (ind.rsi > 70) { bearish += 2; reasons.push(`RSI ${ind.rsi.toFixed(1)} - Overbought (bearish reversal potential)`); }
      else if (ind.rsi > 60) { bearish += 1; reasons.push(`RSI ${ind.rsi.toFixed(1)} - Elevated`); }
      else if (ind.rsi >= 45 && ind.rsi <= 55) { reasons.push(`RSI ${ind.rsi.toFixed(1)} - Neutral zone (consolidating)`); }
      else if (ind.rsi > 55) { reasons.push(`RSI ${ind.rsi.toFixed(1)} - Slightly bullish momentum`); }
      else { reasons.push(`RSI ${ind.rsi.toFixed(1)} - Slightly bearish momentum`); }
    }
    
    // MACD signals
    if (ind.macd !== null && ind.macd !== undefined) {
      const macdHist = ind.macdHist;
      if (ind.macd > 0 && macdHist && macdHist > 0) { bullish += 2; reasons.push('MACD bullish crossover confirmed'); }
      else if (ind.macd > 0) { bullish += 1; reasons.push('MACD positive (bullish momentum)'); }
      else if (ind.macd < 0 && macdHist && macdHist < 0) { bearish += 2; reasons.push('MACD bearish crossover confirmed'); }
      else { bearish += 1; reasons.push('MACD negative (bearish momentum)'); }
    }
    
    // Price vs SMA - always show relative position
    if (ind.priceVsSma20 !== null && ind.priceVsSma20 !== undefined) {
      const pct = ind.priceVsSma20;
      if (pct > 10) { bullish += 2; reasons.push(`Price ${pct.toFixed(1)}% above SMA20 - Strong uptrend`); }
      else if (pct > 5) { bullish += 1; reasons.push(`Price ${pct.toFixed(1)}% above SMA20 - Uptrend`); }
      else if (pct > 0) { reasons.push(`Price ${pct.toFixed(1)}% above SMA20 - Mild uptrend`); }
      else if (pct < -10) { bearish += 2; reasons.push(`Price ${Math.abs(pct).toFixed(1)}% below SMA20 - Strong downtrend`); }
      else if (pct < -5) { bearish += 1; reasons.push(`Price ${Math.abs(pct).toFixed(1)}% below SMA20 - Downtrend`); }
      else { reasons.push(`Price ${Math.abs(pct).toFixed(1)}% below SMA20 - Mild downtrend`); }
    }
    
    // Bollinger Bands signals
    if (ind.bbUpper && ind.bbLower && ind.bbMiddle && data.price?.price) {
      const price = data.price.price;
      const bandWidth = ((ind.bbUpper - ind.bbLower) / ind.bbMiddle) * 100;
      
      if (price >= ind.bbUpper) { bearish += 1; reasons.push(`Price at upper Bollinger Band - Overbought`); }
      else if (price <= ind.bbLower) { bullish += 1; reasons.push(`Price at lower Bollinger Band - Oversold`); }
      else if (price > ind.bbMiddle) { reasons.push(`Price above BB middle - Bullish bias`); }
      else { reasons.push(`Price below BB middle - Bearish bias`); }
      
      if (bandWidth < 10) { reasons.push(`Tight Bollinger Bands (${bandWidth.toFixed(1)}%) - Breakout imminent`); }
      else if (bandWidth > 30) { reasons.push(`Wide Bollinger Bands (${bandWidth.toFixed(1)}%) - High volatility`); }
    }
    
    // ADX trend strength
    if (ind.adx !== null && ind.adx !== undefined) {
      if (ind.adx > 50) { reasons.push(`ADX ${ind.adx.toFixed(0)} - Very strong trend`); }
      else if (ind.adx > 25) { reasons.push(`ADX ${ind.adx.toFixed(0)} - Trending market`); }
      else { reasons.push(`ADX ${ind.adx.toFixed(0)} - Weak/no trend (ranging)`); }
    }
    
    // Volume
    if (ind.volumeRatio !== null && ind.volumeRatio !== undefined) {
      if (ind.volumeRatio > 2) { reasons.push(`Volume ${ind.volumeRatio.toFixed(1)}x average - Very high activity`); }
      else if (ind.volumeRatio > 1.5) { reasons.push(`Volume ${ind.volumeRatio.toFixed(1)}x average - High activity`); }
      else if (ind.volumeRatio < 0.5) { reasons.push(`Volume ${ind.volumeRatio.toFixed(1)}x average - Low activity`); }
    }
    
    // Stochastic
    if (ind.stochK !== null && ind.stochK !== undefined) {
      if (ind.stochK < 20) { bullish += 1; reasons.push(`Stochastic ${ind.stochK.toFixed(0)} - Oversold zone`); }
      else if (ind.stochK > 80) { bearish += 1; reasons.push(`Stochastic ${ind.stochK.toFixed(0)} - Overbought zone`); }
      else if (ind.stochK > ind.stochD) { reasons.push(`Stochastic ${ind.stochK.toFixed(0)} - Bullish crossover`); }
      else if (ind.stochK < ind.stochD) { reasons.push(`Stochastic ${ind.stochK.toFixed(0)} - Bearish crossover`); }
    }
    
    // ATR volatility context
    if (ind.atr !== null && ind.atr !== undefined && data.price?.price) {
      const atrPercent = (ind.atr / data.price.price) * 100;
      if (atrPercent > 5) { reasons.push(`High volatility (${atrPercent.toFixed(1)}% ATR)`); }
      else if (atrPercent < 1) { reasons.push(`Low volatility (${atrPercent.toFixed(1)}% ATR)`); }
    }
  }
  
  // Price momentum
  if (data.price?.changePercent !== null && data.price?.changePercent !== undefined) {
    const pct = data.price.changePercent;
    if (pct > 5) { bullish += 1; reasons.push(`Strong upward momentum (+${pct.toFixed(1)}% today)`); }
    else if (pct > 2) { reasons.push(`Positive momentum (+${pct.toFixed(1)}% today)`); }
    else if (pct < -5) { bearish += 1; reasons.push(`Strong downward momentum (${pct.toFixed(1)}% today)`); }
    else if (pct < -2) { reasons.push(`Negative momentum (${pct.toFixed(1)}% today)`); }
  }
  
  // Crypto fear/greed
  if (data.cryptoData?.fearGreed) {
    const fg = data.cryptoData.fearGreed.value;
    if (fg < 25) { bullish += 1; reasons.push(`Extreme Fear index (${fg}) - Contrarian bullish`); }
    else if (fg < 40) { reasons.push(`Fear index (${fg}) - Market cautious`); }
    else if (fg > 75) { bearish += 1; reasons.push(`Extreme Greed index (${fg}) - Contrarian bearish`); }
    else if (fg > 60) { reasons.push(`Greed index (${fg}) - Market optimistic`); }
  }
  
  // 52-week position (stocks)
  if (data.company && data.price?.price) {
    const price = data.price.price;
    const low52 = data.company.week52Low;
    const high52 = data.company.week52High;
    
    if (low52 && high52 && high52 > low52) {
      const range = high52 - low52;
      const position = ((price - low52) / range) * 100;
      
      if (position > 95) { bearish += 1; reasons.push(`Near 52W high (${position.toFixed(0)}% of range) - Resistance ahead`); }
      else if (position > 80) { reasons.push(`Strong 52W position (${position.toFixed(0)}% of range)`); }
      else if (position < 10) { bullish += 1; reasons.push(`Near 52W low (${position.toFixed(0)}% of range) - Potential support`); }
      else if (position < 25) { reasons.push(`Weak 52W position (${position.toFixed(0)}% of range)`); }
    }
    
    // Price vs analyst target
    if (data.company.targetPrice && price) {
      const upside = ((data.company.targetPrice - price) / price) * 100;
      if (upside > 30) { bullish += 1; reasons.push(`${upside.toFixed(0)}% upside to analyst target ($${data.company.targetPrice.toFixed(0)})`); }
      else if (upside > 15) { reasons.push(`${upside.toFixed(0)}% upside to analyst target ($${data.company.targetPrice.toFixed(0)})`); }
      else if (upside < -10) { bearish += 1; reasons.push(`${Math.abs(upside).toFixed(0)}% above analyst target ($${data.company.targetPrice.toFixed(0)})`); }
      else if (upside < 0) { reasons.push(`${Math.abs(upside).toFixed(0)}% above analyst target - Fairly valued`); }
    }
  }
  
  // Analyst consensus (stocks)
  if (data.company) {
    const totalAnalysts = (data.company.strongBuy || 0) + (data.company.buy || 0) + 
                          (data.company.hold || 0) + (data.company.sell || 0) + (data.company.strongSell || 0);
    if (totalAnalysts > 0) {
      const buyPercent = ((data.company.strongBuy || 0) + (data.company.buy || 0)) / totalAnalysts;
      if (buyPercent > 0.7) { bullish += 1; reasons.push(`${(buyPercent*100).toFixed(0)}% analyst buy consensus (${totalAnalysts} analysts)`); }
      else if (buyPercent > 0.5) { reasons.push(`${(buyPercent*100).toFixed(0)}% analyst buy ratings (${totalAnalysts} analysts)`); }
      else if (buyPercent < 0.3) { bearish += 1; reasons.push(`Only ${(buyPercent*100).toFixed(0)}% buy ratings - Analyst caution`); }
    }
  }
  
  // Options flow signals
  if (data.optionsData) {
    const opts = data.optionsData;
    
    // Put/Call ratio sentiment
    if (opts.putCallRatio < 0.7) { 
      bullish += 1; 
      reasons.push(`Options P/C ratio ${opts.putCallRatio.toFixed(2)} - Call heavy (bullish)`); 
    } else if (opts.putCallRatio > 1.3) { 
      bearish += 1; 
      reasons.push(`Options P/C ratio ${opts.putCallRatio.toFixed(2)} - Put heavy (bearish)`); 
    } else {
      reasons.push(`Options P/C ratio ${opts.putCallRatio.toFixed(2)} - Neutral positioning`);
    }
    
    // Max pain vs current price
    if (opts.maxPain && opts.currentPrice) {
      const distFromMaxPain = ((opts.maxPain - opts.currentPrice) / opts.currentPrice) * 100;
      if (Math.abs(distFromMaxPain) > 5) {
        if (distFromMaxPain > 0) {
          reasons.push(`Max pain $${opts.maxPain.toFixed(0)} is ${distFromMaxPain.toFixed(1)}% above - Potential magnet`);
        } else {
          reasons.push(`Max pain $${opts.maxPain.toFixed(0)} is ${Math.abs(distFromMaxPain).toFixed(1)}% below - Potential drag`);
        }
      }
    }
  }
  
  const score = bullish - bearish;
  let signal = 'NEUTRAL';
  if (score >= 4) signal = 'STRONG BUY';
  else if (score >= 2) signal = 'BUY';
  else if (score >= 1) signal = 'LEAN BULLISH';
  else if (score <= -4) signal = 'STRONG SELL';
  else if (score <= -2) signal = 'SELL';
  else if (score <= -1) signal = 'LEAN BEARISH';
  
  return { signal, score, reasons, bullishCount: bullish, bearishCount: bearish };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Pro Trader tier required
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ success: false, error: 'Please log in to use Golden Egg Deep Analysis' }, { status: 401 });
    }
    if (!hasProTraderAccess(session.tier)) {
      return NextResponse.json({ success: false, error: 'Pro Trader subscription required for Golden Egg Deep Analysis' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.toUpperCase().trim();
    
    if (!symbol) {
      return NextResponse.json({ success: false, error: "Symbol is required" });
    }
    
    const assetType = detectAssetType(symbol);
    
    // Fetch core data in parallel (but NOT options - to avoid rate limit)
    // Alpha Vantage enforces max 5 requests/second burst limit
    const [price, indicators, company, news, cryptoData, earnings] = await Promise.all([
      fetchPriceData(symbol, assetType),
      fetchTechnicalIndicators(symbol, assetType),
      assetType === 'stock' ? fetchCompanyOverview(symbol) : null,
      fetchNewsSentiment(symbol, assetType),
      assetType === 'crypto' ? fetchCryptoData(symbol) : null,
      assetType === 'stock' ? fetchEarningsData(symbol) : null,
    ]);
    
    // Fetch options data AFTER other fetches to avoid burst rate limit
    // Wait 1500ms before fetching options to ensure rate limit window fully resets
    // (Alpha Vantage enforces 5 requests/second and we made ~10 calls above)
    let optionsData = null;
    if (assetType === 'stock') {
      await new Promise(resolve => setTimeout(resolve, 1500));
      optionsData = await fetchOptionsData(symbol);
      console.log(`📊 Options data fetch complete, result: ${optionsData ? 'SUCCESS' : 'NULL'}`);
    }
    
    if (!price) {
      return NextResponse.json({ 
        success: false, 
        error: `Unable to fetch data for ${symbol}. Please check the symbol and try again.` 
      });
    }
    
    const analysisData = {
      symbol,
      assetType,
      price,
      indicators,
      company,
      news,
      cryptoData,
      earnings,
      optionsData
    };
    
    // Generate signals
    const signals = generateSignals(analysisData);
    
    // Generate AI analysis
    const aiAnalysis = await generateAIAnalysis(analysisData);
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      symbol,
      assetType,
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      price,
      indicators,
      company,
      news,
      cryptoData,
      earnings,
      optionsData,
      signals,
      aiAnalysis
    });
  } catch (error) {
    console.error("Deep analysis error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Analysis failed"
    }, { status: 500 });
  }
}
