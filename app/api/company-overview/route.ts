import { valuationAtPrice } from '@/lib/market/valuationIntegrity';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { apiLimiter, getClientIP } from '@/lib/rateLimit';
import { getQuote } from '@/lib/onDemandFetch';
import { getCompanyOverviewRaw, getEarningsHistory, getNextEarnings } from '@/lib/goldenEgg/companyOverview';
import { describeMultiple, periodLabels, daysUntil } from '@/lib/goldenEgg/fundamentalsContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Inline tier check — Pro or Pro Trader required (mirrors canAccessPortfolioInsights)
function hasFundamentalsAccess(tier: string | undefined): boolean {
  return tier === 'pro' || tier === 'pro_trader';
}

const numOrNull = (v: unknown): number | null => { if (v == null || v === 'None' || v === '-' || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

export async function GET(request: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Please log in to access company data' }, { status: 401 });
  }
  if (!hasFundamentalsAccess(session.tier)) {
    return NextResponse.json({ error: 'Pro subscription required for company fundamentals' }, { status: 403 });
  }
  const ip = getClientIP(request);
  const rateCheck = apiLimiter.check(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get('symbol') || '').trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  try {
    // Shared, cached OVERVIEW snapshot — the same object Golden Egg and Deep Analyst read.
    const data = await getCompanyOverviewRaw(symbol);
    if (!data) {
      return NextResponse.json({ error: 'Company not found, symbol not supported, or provider limit reached' }, { status: 404 });
    }
    const [earnings, nextEarnings, quote] = await Promise.all([
      getEarningsHistory(symbol).catch(() => null),
      getNextEarnings(symbol).catch(() => null),
      getQuote(symbol).catch(() => null),
    ]);

    const valuation = valuationAtPrice(quote?.price, data.EPS, data.SharesOutstanding, data.MarketCapitalization);
    const pe = valuation.pe, fwd = numOrNull(data.ForwardPE), peg = numOrNull(data.PEGRatio);
    const ratings = {
      strongBuy: Number(data.AnalystRatingStrongBuy) || 0,
      buy: Number(data.AnalystRatingBuy) || 0,
      hold: Number(data.AnalystRatingHold) || 0,
      sell: Number(data.AnalystRatingSell) || 0,
      strongSell: Number(data.AnalystRatingStrongSell) || 0,
    };
    const analystCount = ratings.strongBuy + ratings.buy + ratings.hold + ratings.sell + ratings.strongSell;
    const period = periodLabels(data);
    const multiple = describeMultiple(pe, fwd, peg);

    return NextResponse.json({
      success: true,
      data: {
        symbol: data.Symbol,
        name: data.Name,
        description: data.Description,
        sector: data.Sector,
        industry: data.Industry,
        marketCap: valuation.marketCap,
        providerMarketCap: data.MarketCapitalization,
        valuationBasis: valuation.basis,
        pe,
        providerPe: data.PERatio,
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
        trailingPE: pe,
        providerTrailingPE: data.TrailingPE,
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
        // Period basis (Part K1)
        latestQuarter: period.latestQuarter,
        fiscalYearEnd: period.fiscalYearEnd,
        periodBasis: period.basis,
        periodSummary: `${period.summary} ${valuation.basis}`,
        // Transparent multiple wording (Part K2)
        multiple,
        // Earnings (Part K3)
        nextEarningsDate: nextEarnings?.reportDate ?? null,
        nextEarningsEstimate: nextEarnings?.estimate ?? null,
        daysToEarnings: daysUntil(nextEarnings?.reportDate ?? null),
        lastReportedQuarter: earnings?.lastReported?.fiscalDateEnding ?? period.latestQuarter,
        lastReportedDate: earnings?.lastReported?.reportedDate ?? null,
        lastReportedEPS: earnings?.lastReported?.reportedEPS ?? null,
        lastEstimatedEPS: earnings?.lastReported?.estimatedEPS ?? null,
        lastEpsBeat: earnings?.lastReported?.beat ?? null,
        beatRate: earnings?.beatRate ?? null,
        recentQuarters: earnings?.recentQuarters ?? [],
        // Analyst data (Part K4)
        analystCount: analystCount || null,
        analystRatings: analystCount ? ratings : null,
        // Current price from the shared quote cache (Alpha Vantage realtime quote is not re-called here)
        currentPrice: quote?.price != null ? String(quote.price) : null,
        changePercent: quote?.changePct != null ? `${quote.changePct}%` : null,
        priceAsOf: (quote as any)?.latestDay ?? null,
        fetchedAt: new Date().toISOString(),
        dataSource: 'alpha_vantage',
      },
    });
  } catch (error) {
    console.error('[company-overview] error:', error);
    return NextResponse.json({ error: 'Failed to fetch company overview' }, { status: 500 });
  }
}
