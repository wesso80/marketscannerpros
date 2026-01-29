import { NextRequest, NextResponse } from 'next/server';
import { getDerivativesTickers, getMarketData } from '@/lib/coingecko';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_DURATION = 1800; // 30 min cache
let cache: { data: any; timestamp: number } | null = null;

// =============================================================================
// DATA SOURCES FOR CUSTOM F&G INDEX
// =============================================================================

interface MarketData {
  // Crypto metrics
  cryptoFG?: number;           // Alternative.me F&G
  btcOI?: number;              // BTC OI
  btcOIChange?: number;        // 24h OI change %
  btcFundingRate?: number;     // Funding rate
  btcLongShortRatio?: number;  // L/S ratio
  btcPriceChange24h?: number;  // Price change %
  
  // Stock metrics  
  vix?: number;                // VIX fear index
  spyChange?: number;          // S&P 500 change %
  putCallRatio?: number;       // Put/Call ratio (if available)
}

// Fetch Alternative.me Crypto Fear & Greed
async function fetchCryptoFG(): Promise<number | null> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return parseInt(data?.data?.[0]?.value || '50');
  } catch {
    return null;
  }
}

// Fetch BTC derivatives data from CoinGecko + Binance (L/S ratio only)
async function fetchBTCDerivatives(): Promise<Partial<MarketData>> {
  const result: Partial<MarketData> = {};
  
  try {
    // Fetch from CoinGecko (funding rate, OI) and Binance (L/S ratio, price change)
    const [derivativesTickers, marketData, lsRes] = await Promise.all([
      getDerivativesTickers(),
      getMarketData({ ids: ['bitcoin'], per_page: 1 }),
      // L/S ratio only available from Binance
      fetch('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }).catch(() => null)
    ]);
    
    // Extract BTC data from CoinGecko derivatives
    if (derivativesTickers) {
      const btcDerivatives = derivativesTickers.filter(t => 
        t.symbol?.toUpperCase().includes('BTC') && t.index_id?.toUpperCase() === 'BTC'
      );
      
      if (btcDerivatives.length > 0) {
        // Get average funding rate across exchanges
        const fundingRates = btcDerivatives
          .map(t => t.funding_rate)
          .filter((r): r is number => r !== undefined && r !== null);
        if (fundingRates.length > 0) {
          result.btcFundingRate = (fundingRates.reduce((a, b) => a + b, 0) / fundingRates.length) * 100;
        }
        
        // Get total OI across exchanges
        const oiValues = btcDerivatives
          .map(t => t.open_interest)
          .filter((oi): oi is number => oi !== undefined && oi !== null);
        if (oiValues.length > 0) {
          result.btcOI = oiValues.reduce((a, b) => a + b, 0);
        }
      }
    }
    
    // Get price change from market data
    if (marketData && marketData.length > 0) {
      result.btcPriceChange24h = marketData[0].price_change_percentage_24h;
    }
    
    // L/S ratio from Binance (CoinGecko doesn't have this)
    if (lsRes?.ok) {
      const ls = await lsRes.json();
      if (ls?.[0]?.longShortRatio) {
        result.btcLongShortRatio = parseFloat(ls[0].longShortRatio);
      }
    }
  } catch (e) {
    console.error('BTC derivatives fetch error:', e);
  }
  
  return result;
}

// Fetch VIX (fear index) from Yahoo Finance
async function fetchVIX(): Promise<number | null> {
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const close = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    return close?.[close.length - 1] || null;
  } catch {
    return null;
  }
}

// Fetch S&P 500 change from Yahoo Finance
async function fetchSPYChange(): Promise<number | null> {
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=5d', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((c: number) => c);
    if (!closes || closes.length < 2) return null;
    const latest = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    return ((latest - prev) / prev) * 100;
  } catch {
    return null;
  }
}

// =============================================================================
// CUSTOM F&G INDEX CALCULATION
// =============================================================================

interface FGResult {
  value: number;                 // 0-100
  classification: string;        // Extreme Fear, Fear, Neutral, Greed, Extreme Greed
  components: {
    name: string;
    value: number;
    weight: number;
    contribution: number;
    interpretation: string;
  }[];
}

function calculateCustomCryptoFG(data: MarketData): FGResult {
  const components: FGResult['components'] = [];
  let totalWeight = 0;
  let weightedSum = 0;
  
  // 1. Alternative.me F&G (35% weight) - core sentiment
  if (data.cryptoFG !== undefined) {
    const weight = 35;
    components.push({
      name: 'Market Sentiment',
      value: data.cryptoFG,
      weight,
      contribution: data.cryptoFG * (weight / 100),
      interpretation: data.cryptoFG < 25 ? 'Extreme Fear' : data.cryptoFG < 45 ? 'Fear' : data.cryptoFG < 55 ? 'Neutral' : data.cryptoFG < 75 ? 'Greed' : 'Extreme Greed'
    });
    weightedSum += data.cryptoFG * weight;
    totalWeight += weight;
  }
  
  // 2. Funding Rate (20% weight) - leverage sentiment
  // Positive funding = longs pay shorts = overleveraged longs = greedy
  // Negative funding = shorts pay longs = overleveraged shorts = fearful
  if (data.btcFundingRate !== undefined) {
    const weight = 20;
    // Map funding rate: -0.1% = 0 (extreme fear), 0 = 50, +0.1% = 100 (extreme greed)
    let fgValue = 50 + (data.btcFundingRate / 0.1) * 50;
    fgValue = Math.max(0, Math.min(100, fgValue));
    
    components.push({
      name: 'Funding Rate',
      value: fgValue,
      weight,
      contribution: fgValue * (weight / 100),
      interpretation: data.btcFundingRate > 0.05 ? 'Longs overleveraged' : data.btcFundingRate < -0.05 ? 'Shorts overleveraged' : 'Balanced'
    });
    weightedSum += fgValue * weight;
    totalWeight += weight;
  }
  
  // 3. Long/Short Ratio (20% weight) - positioning sentiment
  // High L/S = more longs = greedy, Low L/S = more shorts = fearful
  if (data.btcLongShortRatio !== undefined) {
    const weight = 20;
    // Map L/S ratio: 0.5 = 0, 1.0 = 50, 2.0 = 100
    let fgValue = ((data.btcLongShortRatio - 0.5) / 1.5) * 100;
    fgValue = Math.max(0, Math.min(100, fgValue));
    
    components.push({
      name: 'Long/Short Ratio',
      value: fgValue,
      weight,
      contribution: fgValue * (weight / 100),
      interpretation: data.btcLongShortRatio > 1.5 ? 'Heavily long' : data.btcLongShortRatio < 0.8 ? 'Heavily short' : 'Balanced'
    });
    weightedSum += fgValue * weight;
    totalWeight += weight;
  }
  
  // 4. Price Momentum (25% weight) - recent performance
  if (data.btcPriceChange24h !== undefined) {
    const weight = 25;
    // Map 24h change: -10% = 0, 0% = 50, +10% = 100
    let fgValue = 50 + (data.btcPriceChange24h / 10) * 50;
    fgValue = Math.max(0, Math.min(100, fgValue));
    
    components.push({
      name: 'Price Momentum',
      value: fgValue,
      weight,
      contribution: fgValue * (weight / 100),
      interpretation: data.btcPriceChange24h > 5 ? 'Strong rally' : data.btcPriceChange24h < -5 ? 'Sharp decline' : 'Stable'
    });
    weightedSum += fgValue * weight;
    totalWeight += weight;
  }
  
  const finalValue = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;
  const classification = finalValue < 20 ? 'Extreme Fear' 
    : finalValue < 40 ? 'Fear'
    : finalValue < 60 ? 'Neutral'
    : finalValue < 80 ? 'Greed'
    : 'Extreme Greed';
  
  return { value: finalValue, classification, components };
}

function calculateCustomStockFG(data: MarketData): FGResult {
  const components: FGResult['components'] = [];
  let totalWeight = 0;
  let weightedSum = 0;
  
  // 1. VIX (60% weight) - volatility/fear index
  // VIX: 10 = extreme greed (100), 20 = neutral (50), 40+ = extreme fear (0)
  if (data.vix !== undefined) {
    const weight = 60;
    let fgValue = 100 - ((data.vix - 10) / 30) * 100;
    fgValue = Math.max(0, Math.min(100, fgValue));
    
    components.push({
      name: 'VIX (Volatility)',
      value: fgValue,
      weight,
      contribution: fgValue * (weight / 100),
      interpretation: data.vix > 30 ? 'High fear' : data.vix < 15 ? 'Complacent' : 'Normal'
    });
    weightedSum += fgValue * weight;
    totalWeight += weight;
  }
  
  // 2. S&P 500 Momentum (40% weight)
  if (data.spyChange !== undefined) {
    const weight = 40;
    // Map: -3% = 0, 0% = 50, +3% = 100
    let fgValue = 50 + (data.spyChange / 3) * 50;
    fgValue = Math.max(0, Math.min(100, fgValue));
    
    components.push({
      name: 'S&P 500 Momentum',
      value: fgValue,
      weight,
      contribution: fgValue * (weight / 100),
      interpretation: data.spyChange > 1.5 ? 'Strong rally' : data.spyChange < -1.5 ? 'Selling pressure' : 'Stable'
    });
    weightedSum += fgValue * weight;
    totalWeight += weight;
  }
  
  const finalValue = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;
  const classification = finalValue < 20 ? 'Extreme Fear' 
    : finalValue < 40 ? 'Fear'
    : finalValue < 60 ? 'Neutral'
    : finalValue < 80 ? 'Greed'
    : 'Extreme Greed';
  
  return { value: finalValue, classification, components };
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const market = searchParams.get('market') || 'crypto'; // 'crypto' or 'stock'
  
  // Check cache
  const cacheKey = `fg_${market}`;
  if (cache && cache.data[cacheKey] && Date.now() - cache.timestamp < CACHE_DURATION * 1000) {
    return NextResponse.json(cache.data[cacheKey]);
  }

  try {
    const marketData: MarketData = {};
    
    if (market === 'crypto') {
      // Fetch all crypto data in parallel
      const [cryptoFG, btcData] = await Promise.all([
        fetchCryptoFG(),
        fetchBTCDerivatives()
      ]);
      
      if (cryptoFG !== null) marketData.cryptoFG = cryptoFG;
      Object.assign(marketData, btcData);
      
      const result = calculateCustomCryptoFG(marketData);
      
      const response = {
        market: 'crypto',
        ...result,
        raw: {
          cryptoFG: marketData.cryptoFG,
          btcFundingRate: marketData.btcFundingRate,
          btcLongShortRatio: marketData.btcLongShortRatio,
          btcPriceChange24h: marketData.btcPriceChange24h
        },
        source: 'MSP Proprietary Index',
        methodology: 'Composite of market sentiment (35%), funding rates (20%), positioning (20%), and momentum (25%)',
        cachedAt: new Date().toISOString()
      };
      
      // Update cache
      if (!cache) cache = { data: {}, timestamp: Date.now() };
      cache.data[cacheKey] = response;
      cache.timestamp = Date.now();
      
      return NextResponse.json(response);
      
    } else {
      // Stock market F&G
      const [vix, spyChange] = await Promise.all([
        fetchVIX(),
        fetchSPYChange()
      ]);
      
      if (vix !== null) marketData.vix = vix;
      if (spyChange !== null) marketData.spyChange = spyChange;
      
      const result = calculateCustomStockFG(marketData);
      
      const response = {
        market: 'stock',
        ...result,
        raw: {
          vix: marketData.vix,
          spyChange: marketData.spyChange
        },
        source: 'MSP Proprietary Index',
        methodology: 'Composite of VIX (60%) and S&P 500 momentum (40%)',
        cachedAt: new Date().toISOString()
      };
      
      // Update cache
      if (!cache) cache = { data: {}, timestamp: Date.now() };
      cache.data[cacheKey] = response;
      cache.timestamp = Date.now();
      
      return NextResponse.json(response);
    }
    
  } catch (error) {
    console.error('Custom F&G API error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate Fear & Greed Index' },
      { status: 500 }
    );
  }
}
