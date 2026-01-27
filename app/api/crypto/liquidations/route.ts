import { NextRequest, NextResponse } from 'next/server';

const CACHE_DURATION = 60; // 1 minute cache (liquidations are time-sensitive)
let cache: { data: any; timestamp: number } | null = null;

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];

interface LiquidationData {
  symbol: string;
  recentLiquids: number;      // Count of recent liquidations
  longLiquidValue: number;    // USD value of long liquidations
  shortLiquidValue: number;   // USD value of short liquidations
  dominantSide: 'longs' | 'shorts' | 'balanced';
  intensity: 'low' | 'medium' | 'high' | 'extreme';
}

export async function GET(req: NextRequest) {
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION * 1000) {
    return NextResponse.json(cache.data);
  }

  try {
    // Note: Binance doesn't have a direct liquidation API
    // We'll use the forceOrders endpoint for recent liquidation data
    const liqPromises = SYMBOLS.map(async (symbol): Promise<LiquidationData | null> => {
      try {
        // Get recent force orders (liquidations) - last 1 hour
        const res = await fetch(
          `https://fapi.binance.com/fapi/v1/forceOrders?symbol=${symbol}&limit=100`,
          { headers: { 'Accept': 'application/json' } }
        );

        if (!res.ok) return null;

        const orders = await res.json();
        
        let longLiquidValue = 0;
        let shortLiquidValue = 0;
        let recentLiquids = 0;
        
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        
        for (const order of orders) {
          if (order.time >= oneHourAgo) {
            recentLiquids++;
            const value = parseFloat(order.price) * parseFloat(order.origQty);
            
            if (order.side === 'BUY') {
              // Forced buy = short liquidation
              shortLiquidValue += value;
            } else {
              // Forced sell = long liquidation
              longLiquidValue += value;
            }
          }
        }

        const totalValue = longLiquidValue + shortLiquidValue;
        
        // Determine dominant side
        let dominantSide: LiquidationData['dominantSide'];
        if (longLiquidValue > shortLiquidValue * 1.5) {
          dominantSide = 'longs';
        } else if (shortLiquidValue > longLiquidValue * 1.5) {
          dominantSide = 'shorts';
        } else {
          dominantSide = 'balanced';
        }

        // Determine intensity based on USD value (rough thresholds)
        let intensity: LiquidationData['intensity'];
        if (totalValue > 10_000_000) intensity = 'extreme';
        else if (totalValue > 1_000_000) intensity = 'high';
        else if (totalValue > 100_000) intensity = 'medium';
        else intensity = 'low';

        return {
          symbol: symbol.replace('USDT', ''),
          recentLiquids,
          longLiquidValue,
          shortLiquidValue,
          dominantSide,
          intensity,
        };
      } catch {
        return null;
      }
    });

    const results = await Promise.all(liqPromises);
    const liqData = results.filter((r): r is LiquidationData => r !== null);

    // Calculate totals
    const totalLongLiquids = liqData.reduce((sum, r) => sum + r.longLiquidValue, 0);
    const totalShortLiquids = liqData.reduce((sum, r) => sum + r.shortLiquidValue, 0);
    const totalLiquids = totalLongLiquids + totalShortLiquids;

    // Market liquidation bias
    let marketBias: 'longs_getting_rekt' | 'shorts_getting_rekt' | 'balanced';
    if (totalLongLiquids > totalShortLiquids * 1.5) {
      marketBias = 'longs_getting_rekt';
    } else if (totalShortLiquids > totalLongLiquids * 1.5) {
      marketBias = 'shorts_getting_rekt';
    } else {
      marketBias = 'balanced';
    }

    const result = {
      summary: {
        totalLiquidations: formatLargeNumber(totalLiquids),
        longLiquidations: formatLargeNumber(totalLongLiquids),
        shortLiquidations: formatLargeNumber(totalShortLiquids),
        marketBias,
        interpretation: marketBias === 'longs_getting_rekt'
          ? '🔴 Longs getting liquidated - bearish pressure'
          : marketBias === 'shorts_getting_rekt'
          ? '🟢 Shorts getting liquidated - bullish pressure'
          : '⚪ Balanced liquidations',
        tradingInsight: marketBias === 'longs_getting_rekt'
          ? 'Wait for liquidation cascade to end before buying'
          : marketBias === 'shorts_getting_rekt'
          ? 'Short squeeze in progress - momentum likely continues'
          : 'No clear liquidation pressure',
      },
      coins: liqData,
      timeframe: '1 hour',
      source: 'binance',
      timestamp: new Date().toISOString(),
    };

    cache = { data: result, timestamp: Date.now() };
    return NextResponse.json(result);

  } catch (error) {
    console.error('Liquidations API error:', error);
    
    if (cache) {
      return NextResponse.json({ ...cache.data, stale: true });
    }
    
    // Return mock data if API fails
    return NextResponse.json({
      summary: {
        totalLiquidations: '$0',
        longLiquidations: '$0',
        shortLiquidations: '$0',
        marketBias: 'balanced',
        interpretation: '⚪ No liquidation data available',
        tradingInsight: 'Unable to fetch liquidation data',
      },
      coins: [],
      timeframe: '1 hour',
      source: 'binance',
      timestamp: new Date().toISOString(),
      error: 'Data temporarily unavailable',
    });
  }
}

function formatLargeNumber(num: number): string {
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}
