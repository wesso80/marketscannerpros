import { NextRequest, NextResponse } from 'next/server';

const CACHE_DURATION = 60; // 1 minute cache for real-time data
let cache: { data: any; timestamp: number } | null = null;

// OKX uses different symbol format: BTC-USDT instead of BTCUSDT
const OKX_SYMBOLS = [
  { okx: 'BTC-USDT', display: 'BTC' },
  { okx: 'ETH-USDT', display: 'ETH' },
  { okx: 'SOL-USDT', display: 'SOL' },
  { okx: 'XRP-USDT', display: 'XRP' },
  { okx: 'DOGE-USDT', display: 'DOGE' },
];

interface OKXLiquidation {
  bkPx: string;      // Bankruptcy price
  posSide: string;   // long or short
  side: string;      // buy or sell
  sz: string;        // Size in contracts
  ts: string;        // Timestamp
}

interface CoinLiquidation {
  symbol: string;
  longLiquidations: number;
  shortLiquidations: number;
  totalLiquidations: number;
  longValue: number;
  shortValue: number;
  totalValue: number;
  dominantSide: 'longs' | 'shorts' | 'balanced';
  recentLiqs: Array<{
    side: string;
    size: number;
    price: number;
    time: string;
  }>;
}

export async function GET(req: NextRequest) {
  console.log('[Liquidations API] Request received - using OKX real data');
  
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION * 1000) {
    console.log('[Liquidations API] Returning cached data');
    return NextResponse.json(cache.data);
  }

  try {
    console.log('[Liquidations API] Fetching real liquidation data from OKX');
    
    const coinResults = await Promise.all(OKX_SYMBOLS.map(async ({ okx, display }): Promise<CoinLiquidation | null> => {
      try {
        // OKX public liquidation endpoint - no API key required
        const response = await fetch(
          `https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&uly=${okx}&state=filled`,
          { headers: { 'Accept': 'application/json' } }
        );

        if (!response.ok) {
          console.log(`[Liquidations API] OKX error for ${okx}: ${response.status}`);
          return null;
        }

        const data = await response.json();
        
        if (data.code !== '0' || !data.data?.[0]?.details) {
          console.log(`[Liquidations API] No data for ${okx}`);
          return null;
        }

        const liquidations: OKXLiquidation[] = data.data[0].details || [];
        
        // Aggregate liquidations
        let longLiqs = 0, shortLiqs = 0;
        let longValue = 0, shortValue = 0;
        const recentLiqs: CoinLiquidation['recentLiqs'] = [];

        liquidations.forEach((liq: OKXLiquidation) => {
          const size = parseFloat(liq.sz);
          const price = parseFloat(liq.bkPx);
          const value = size * price;
          
          if (liq.posSide === 'long') {
            longLiqs++;
            longValue += value;
          } else {
            shortLiqs++;
            shortValue += value;
          }

          // Keep recent 5 liquidations for display
          if (recentLiqs.length < 5) {
            recentLiqs.push({
              side: liq.posSide,
              size,
              price,
              time: new Date(parseInt(liq.ts)).toISOString(),
            });
          }
        });

        const totalLiqs = longLiqs + shortLiqs;
        const totalVal = longValue + shortValue;
        
        let dominantSide: CoinLiquidation['dominantSide'] = 'balanced';
        if (longValue > shortValue * 1.5) dominantSide = 'longs';
        else if (shortValue > longValue * 1.5) dominantSide = 'shorts';

        return {
          symbol: display,
          longLiquidations: longLiqs,
          shortLiquidations: shortLiqs,
          totalLiquidations: totalLiqs,
          longValue,
          shortValue,
          totalValue: totalVal,
          dominantSide,
          recentLiqs,
        };
      } catch (err) {
        console.log(`[Liquidations API] Error fetching ${okx}:`, err);
        return null;
      }
    }));

    const validCoins = coinResults.filter((c): c is CoinLiquidation => c !== null);
    console.log(`[Liquidations API] Got real data for ${validCoins.length} coins`);

    // Calculate totals
    const totalLongValue = validCoins.reduce((sum, c) => sum + c.longValue, 0);
    const totalShortValue = validCoins.reduce((sum, c) => sum + c.shortValue, 0);
    const totalValue = totalLongValue + totalShortValue;
    const totalLongLiqs = validCoins.reduce((sum, c) => sum + c.longLiquidations, 0);
    const totalShortLiqs = validCoins.reduce((sum, c) => sum + c.shortLiquidations, 0);

    // Determine market bias
    let marketBias: 'longs_liquidated' | 'shorts_liquidated' | 'balanced';
    if (totalLongValue > totalShortValue * 1.3) {
      marketBias = 'longs_liquidated';
    } else if (totalShortValue > totalLongValue * 1.3) {
      marketBias = 'shorts_liquidated';
    } else {
      marketBias = 'balanced';
    }

    // Stress level based on total liquidation value
    let stressLevel: 'low' | 'moderate' | 'high';
    if (totalValue > 50000000) stressLevel = 'high';      // >$50M
    else if (totalValue > 10000000) stressLevel = 'moderate'; // >$10M
    else stressLevel = 'low';

    const result = {
      summary: {
        dataSource: 'okx-real',
        totalLiquidations: totalLongLiqs + totalShortLiqs,
        totalLongLiquidations: totalLongLiqs,
        totalShortLiquidations: totalShortLiqs,
        totalValue: Math.round(totalValue),
        totalLongValue: Math.round(totalLongValue),
        totalShortValue: Math.round(totalShortValue),
        marketBias,
        stressLevel,
        interpretation: marketBias === 'longs_liquidated'
          ? `🔴 $${(totalLongValue / 1000000).toFixed(2)}M in longs liquidated - bearish pressure`
          : marketBias === 'shorts_liquidated'
          ? `🟢 $${(totalShortValue / 1000000).toFixed(2)}M in shorts liquidated - bullish pressure`
          : `⚪ $${(totalValue / 1000000).toFixed(2)}M balanced liquidations`,
        tradingInsight: stressLevel === 'high'
          ? '⚠️ High liquidation activity - volatile market, reduce leverage'
          : stressLevel === 'moderate'
          ? '📊 Moderate liquidations - normal market conditions'
          : '✅ Low liquidations - calm market',
        note: 'Real liquidation data from OKX - testing mode',
      },
      coins: validCoins.map(c => ({
        symbol: c.symbol,
        longLiquidations: c.longLiquidations,
        shortLiquidations: c.shortLiquidations,
        totalLiquidations: c.totalLiquidations,
        longValue: Math.round(c.longValue),
        shortValue: Math.round(c.shortValue),
        totalValue: Math.round(c.totalValue),
        dominantSide: c.dominantSide,
        recentLiqs: c.recentLiqs,
      })),
      timeframe: 'recent',
      source: 'okx',
      timestamp: new Date().toISOString(),
    };

    cache = { data: result, timestamp: Date.now() };
    console.log('[Liquidations API] Returning fresh OKX data');
    return NextResponse.json(result);

  } catch (error) {
    console.error('[Liquidations API] Error:', error);
    
    if (cache) {
      return NextResponse.json({ ...cache.data, stale: true });
    }
    
    return NextResponse.json({
      summary: {
        dataSource: 'unavailable',
        totalLiquidations: 0,
        totalValue: 0,
        marketBias: 'balanced',
        stressLevel: 'unknown',
        interpretation: '⚪ Liquidation data temporarily unavailable',
        tradingInsight: 'Check back later',
        note: 'OKX API error - using fallback',
      },
      coins: [],
      timeframe: 'recent',
      source: 'okx',
      timestamp: new Date().toISOString(),
      error: 'Data temporarily unavailable',
    });
  }
}
