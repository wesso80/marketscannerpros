import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { avTakeToken } from '@/lib/avRateGovernor';
import { apiLimiter, getClientIP } from '@/lib/rateLimit';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

// Inline tier check — Pro or Pro Trader required (mirrors canAccessPortfolioInsights)
function hasFundamentalsAccess(tier: string | undefined): boolean {
  return tier === 'pro' || tier === 'pro_trader';
}

export async function GET(request: NextRequest) {
  // Auth guard: AV license requires authenticated users only
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Please log in to access company data' }, { status: 401 });
  }

  // Tier gate: Company Overview is a Pro feature — enforce server-side
  if (!hasFundamentalsAccess(session.tier)) {
    return NextResponse.json({ error: 'Pro subscription required for company fundamentals' }, { status: 403 });
  }

  // Rate limit
  const ip = getClientIP(request);
  const rateCheck = apiLimiter.check(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const includeQuote = searchParams.get('includeQuote') === '1';
  
  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }
  
  try {
    await avTakeToken();
    const overviewResponse = await fetch(
      `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`
    );
    
    const data = await overviewResponse.json();

    let quoteData: any = null;
    if (includeQuote) {
      await avTakeToken();
      const quoteResponse = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&entitlement=realtime&apikey=${ALPHA_VANTAGE_API_KEY}`
      );
      quoteData = await quoteResponse.json();
    }
    
    if (data['Error Message']) {
      return NextResponse.json(
        { error: data['Error Message'] },
        { status: 400 }
      );
    }
    if (data['Note'] || data['Information']) {
      // AV rate limit or quota message — return 429 with clear message
      return NextResponse.json(
        { error: 'Market data provider rate limit reached. Please try again in a moment.' },
        { status: 429 }
      );
    }
    
    if (!data.Symbol) {
      return NextResponse.json(
        { error: 'Company not found or symbol not supported' },
        { status: 404 }
      );
    }

    // Extract current price from quote
    const globalQuote = quoteData?.['Global Quote'] || {};
    const currentPrice = globalQuote['05. price'] || null;
    const changePercent = globalQuote['10. change percent'] || null;
    
    return NextResponse.json({
      success: true,
      data: {
        symbol: data.Symbol,
        name: data.Name,
        description: data.Description,
        sector: data.Sector,
        industry: data.Industry,
        marketCap: data.MarketCapitalization,
        pe: data.PERatio,
        peg: data.PEGRatio,
        bookValue: data.BookValue,
        dividendYield: data.DividendYield,
        eps: data.EPS,
        revenuePerShare: data.RevenuePerShareTTM,
        profitMargin: data.ProfitMargin,
        operatingMargin: data.OperatingMarginTTM,
        returnOnAssets: data.ReturnOnAssetsTTM,
        returnOnEquity: data.ReturnOnEquityTTM,
        revenue: data.RevenueTTM,
        grossProfit: data.GrossProfitTTM,
        dilutedEPS: data.DilutedEPSTTM,
        quarterlyEarningsGrowth: data.QuarterlyEarningsGrowthYOY,
        quarterlyRevenueGrowth: data.QuarterlyRevenueGrowthYOY,
        analystTargetPrice: data.AnalystTargetPrice,
        trailingPE: data.TrailingPE,
        forwardPE: data.ForwardPE,
        priceToSales: data.PriceToSalesRatioTTM,
        priceToBook: data.PriceToBookRatio,
        evToRevenue: data.EVToRevenue,
        evToEBITDA: data.EVToEBITDA,
        beta: data.Beta,
        week52High: data['52WeekHigh'],
        week52Low: data['52WeekLow'],
        day50MA: data['50DayMovingAverage'],
        day200MA: data['200DayMovingAverage'],
        sharesOutstanding: data.SharesOutstanding,
        dividendDate: data.DividendDate,
        exDividendDate: data.ExDividendDate,
        ipoDate: data.IPODate || null,
        // New: current price data
        currentPrice,
        changePercent,
        // Data provenance — when MSP fetched this from Alpha Vantage
        fetchedAt: new Date().toISOString(),
        dataSource: 'alpha_vantage',
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch company overview' },
      { status: 500 }
    );
  }
}
