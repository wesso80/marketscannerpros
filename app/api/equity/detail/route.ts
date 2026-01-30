import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const BASE_URL = 'https://www.alphavantage.co/query';

interface GlobalQuote {
  '01. symbol': string;
  '02. open': string;
  '03. high': string;
  '04. low': string;
  '05. price': string;
  '06. volume': string;
  '07. latest trading day': string;
  '08. previous close': string;
  '09. change': string;
  '10. change percent': string;
}

interface OverviewData {
  Symbol: string;
  Name: string;
  Description: string;
  Exchange: string;
  Currency: string;
  Country: string;
  Sector: string;
  Industry: string;
  Address: string;
  FiscalYearEnd: string;
  LatestQuarter: string;
  MarketCapitalization: string;
  EBITDA: string;
  PERatio: string;
  PEGRatio: string;
  BookValue: string;
  DividendPerShare: string;
  DividendYield: string;
  EPS: string;
  RevenuePerShareTTM: string;
  ProfitMargin: string;
  OperatingMarginTTM: string;
  ReturnOnAssetsTTM: string;
  ReturnOnEquityTTM: string;
  RevenueTTM: string;
  GrossProfitTTM: string;
  DilutedEPSTTM: string;
  QuarterlyEarningsGrowthYOY: string;
  QuarterlyRevenueGrowthYOY: string;
  AnalystTargetPrice: string;
  AnalystRatingStrongBuy: string;
  AnalystRatingBuy: string;
  AnalystRatingHold: string;
  AnalystRatingSell: string;
  AnalystRatingStrongSell: string;
  TrailingPE: string;
  ForwardPE: string;
  PriceToSalesRatioTTM: string;
  PriceToBookRatio: string;
  EVToRevenue: string;
  EVToEBITDA: string;
  Beta: string;
  '52WeekHigh': string;
  '52WeekLow': string;
  '50DayMovingAverage': string;
  '200DayMovingAverage': string;
  SharesOutstanding: string;
  DividendDate: string;
  ExDividendDate: string;
}

interface IncomeStatement {
  fiscalDateEnding: string;
  totalRevenue: string;
  grossProfit: string;
  operatingIncome: string;
  netIncome: string;
  ebitda?: string;
}

interface EarningsData {
  fiscalDateEnding: string;
  reportedDate: string;
  reportedEPS: string;
  estimatedEPS: string;
  surprise: string;
  surprisePercentage: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  if (!ALPHA_VANTAGE_API_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  // Check session (optional - for rate limiting)
  const session = await getSessionFromCookie();

  try {
    // Fetch all data in parallel
    const [overviewRes, quoteRes, dailyRes, incomeRes, earningsRes, newsRes] = await Promise.all([
      fetch(`${BASE_URL}?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`),
      fetch(`${BASE_URL}?function=GLOBAL_QUOTE&symbol=${symbol}&entitlement=delayed&apikey=${ALPHA_VANTAGE_API_KEY}`),
      fetch(`${BASE_URL}?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${ALPHA_VANTAGE_API_KEY}`),
      fetch(`${BASE_URL}?function=INCOME_STATEMENT&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`),
      fetch(`${BASE_URL}?function=EARNINGS&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`),
      fetch(`${BASE_URL}?function=NEWS_SENTIMENT&tickers=${symbol}&limit=10&apikey=${ALPHA_VANTAGE_API_KEY}`),
    ]);

    const [overviewRaw, quote, daily, income, earnings, news] = await Promise.all([
      overviewRes.json(),
      quoteRes.json(),
      dailyRes.json(),
      incomeRes.json(),
      earningsRes.json(),
      newsRes.json(),
    ]) as [OverviewData & { 'Error Message'?: string; 'Note'?: string }, { 'Global Quote': GlobalQuote }, Record<string, unknown>, { annualReports?: IncomeStatement[]; quarterlyReports?: IncomeStatement[] }, { annualEarnings?: EarningsData[]; quarterlyEarnings?: EarningsData[] }, { feed?: Array<{ title: string; url: string; time_published: string; authors: string[]; summary: string; source: string; overall_sentiment_label: string; overall_sentiment_score: number; ticker_sentiment?: Array<{ ticker: string; relevance_score: string; ticker_sentiment_label: string }> }> }];

    // Check for API errors
    if (overviewRaw['Error Message'] || overviewRaw['Note']) {
      return NextResponse.json(
        { error: overviewRaw['Error Message'] || 'API rate limit reached. Please try again later.' },
        { status: 429 }
      );
    }

    const overview = overviewRaw as OverviewData;

    if (!overview.Symbol) {
      return NextResponse.json({ error: 'Symbol not found' }, { status: 404 });
    }

    // Parse quote data
    const globalQuote = quote['Global Quote'] || {};
    const price = parseFloat(globalQuote['05. price']) || 0;
    const change = parseFloat(globalQuote['09. change']) || 0;
    const changePercent = parseFloat(globalQuote['10. change percent']?.replace('%', '')) || 0;
    const open = parseFloat(globalQuote['02. open']) || 0;
    const high = parseFloat(globalQuote['03. high']) || 0;
    const low = parseFloat(globalQuote['04. low']) || 0;
    const volume = parseInt(globalQuote['06. volume']) || 0;
    const prevClose = parseFloat(globalQuote['08. previous close']) || 0;

    // Parse daily data for chart
    const timeSeries = daily['Time Series (Daily)'] as Record<string, { '1. open': string; '2. high': string; '3. low': string; '4. close': string; '5. volume': string }> || {};
    const chartData = Object.entries(timeSeries)
      .slice(0, 90) // Last 90 days
      .reverse()
      .map(([date, values]) => ({
        date,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume']),
      }));

    // Parse income statement
    const annualIncome = (income.annualReports || []).slice(0, 4).map((report: IncomeStatement) => ({
      fiscalDate: report.fiscalDateEnding,
      revenue: parseFloat(report.totalRevenue) || 0,
      grossProfit: parseFloat(report.grossProfit) || 0,
      operatingIncome: parseFloat(report.operatingIncome) || 0,
      netIncome: parseFloat(report.netIncome) || 0,
    }));

    const quarterlyIncome = (income.quarterlyReports || []).slice(0, 8).map((report: IncomeStatement) => ({
      fiscalDate: report.fiscalDateEnding,
      revenue: parseFloat(report.totalRevenue) || 0,
      grossProfit: parseFloat(report.grossProfit) || 0,
      operatingIncome: parseFloat(report.operatingIncome) || 0,
      netIncome: parseFloat(report.netIncome) || 0,
    }));

    // Parse earnings
    const quarterlyEarnings = (earnings.quarterlyEarnings || []).slice(0, 8).map((e: EarningsData) => ({
      fiscalDate: e.fiscalDateEnding,
      reportedDate: e.reportedDate,
      reportedEPS: parseFloat(e.reportedEPS) || 0,
      estimatedEPS: parseFloat(e.estimatedEPS) || 0,
      surprise: parseFloat(e.surprise) || 0,
      surprisePercent: parseFloat(e.surprisePercentage) || 0,
    }));

    // Parse news
    const newsItems = (news.feed || []).slice(0, 10).map((item) => ({
      title: item.title,
      url: item.url,
      publishedAt: item.time_published,
      source: item.source,
      sentiment: item.overall_sentiment_label,
      sentimentScore: item.overall_sentiment_score,
      summary: item.summary?.slice(0, 200),
    }));

    // Calculate analyst ratings distribution
    const analystRatings = {
      strongBuy: parseInt(overview.AnalystRatingStrongBuy) || 0,
      buy: parseInt(overview.AnalystRatingBuy) || 0,
      hold: parseInt(overview.AnalystRatingHold) || 0,
      sell: parseInt(overview.AnalystRatingSell) || 0,
      strongSell: parseInt(overview.AnalystRatingStrongSell) || 0,
      targetPrice: parseFloat(overview.AnalystTargetPrice) || 0,
    };
    const totalRatings = analystRatings.strongBuy + analystRatings.buy + analystRatings.hold + analystRatings.sell + analystRatings.strongSell;

    // Calculate price vs MAs
    const ma50 = parseFloat(overview['50DayMovingAverage']) || 0;
    const ma200 = parseFloat(overview['200DayMovingAverage']) || 0;
    const priceVs50MA = ma50 ? ((price - ma50) / ma50) * 100 : 0;
    const priceVs200MA = ma200 ? ((price - ma200) / ma200) * 100 : 0;

    // Calculate 52-week position
    const week52High = parseFloat(overview['52WeekHigh']) || 0;
    const week52Low = parseFloat(overview['52WeekLow']) || 0;
    const week52Range = week52High - week52Low;
    const week52Position = week52Range ? ((price - week52Low) / week52Range) * 100 : 50;

    const response = {
      company: {
        symbol: overview.Symbol,
        name: overview.Name,
        description: overview.Description,
        exchange: overview.Exchange,
        currency: overview.Currency,
        country: overview.Country,
        sector: overview.Sector,
        industry: overview.Industry,
        address: overview.Address,
        fiscalYearEnd: overview.FiscalYearEnd,
        latestQuarter: overview.LatestQuarter,
      },
      quote: {
        price,
        change,
        changePercent,
        open,
        high,
        low,
        volume,
        prevClose,
        latestTradingDay: globalQuote['07. latest trading day'],
      },
      valuation: {
        marketCap: parseFloat(overview.MarketCapitalization) || 0,
        pe: parseFloat(overview.PERatio) || 0,
        forwardPE: parseFloat(overview.ForwardPE) || 0,
        peg: parseFloat(overview.PEGRatio) || 0,
        priceToSales: parseFloat(overview.PriceToSalesRatioTTM) || 0,
        priceToBook: parseFloat(overview.PriceToBookRatio) || 0,
        evToRevenue: parseFloat(overview.EVToRevenue) || 0,
        evToEBITDA: parseFloat(overview.EVToEBITDA) || 0,
        bookValue: parseFloat(overview.BookValue) || 0,
      },
      fundamentals: {
        eps: parseFloat(overview.EPS) || 0,
        dilutedEPS: parseFloat(overview.DilutedEPSTTM) || 0,
        revenuePerShare: parseFloat(overview.RevenuePerShareTTM) || 0,
        profitMargin: parseFloat(overview.ProfitMargin) || 0,
        operatingMargin: parseFloat(overview.OperatingMarginTTM) || 0,
        returnOnAssets: parseFloat(overview.ReturnOnAssetsTTM) || 0,
        returnOnEquity: parseFloat(overview.ReturnOnEquityTTM) || 0,
        revenue: parseFloat(overview.RevenueTTM) || 0,
        grossProfit: parseFloat(overview.GrossProfitTTM) || 0,
        ebitda: parseFloat(overview.EBITDA) || 0,
        quarterlyEarningsGrowth: parseFloat(overview.QuarterlyEarningsGrowthYOY) || 0,
        quarterlyRevenueGrowth: parseFloat(overview.QuarterlyRevenueGrowthYOY) || 0,
      },
      technicals: {
        beta: parseFloat(overview.Beta) || 0,
        week52High,
        week52Low,
        week52Position,
        ma50,
        ma200,
        priceVs50MA,
        priceVs200MA,
      },
      dividend: {
        dividendPerShare: parseFloat(overview.DividendPerShare) || 0,
        dividendYield: parseFloat(overview.DividendYield) || 0,
        dividendDate: overview.DividendDate,
        exDividendDate: overview.ExDividendDate,
      },
      shares: {
        outstanding: parseFloat(overview.SharesOutstanding) || 0,
      },
      analysts: {
        ...analystRatings,
        totalRatings,
      },
      financials: {
        annual: annualIncome,
        quarterly: quarterlyIncome,
      },
      earnings: quarterlyEarnings,
      news: newsItems,
      chart: chartData,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('[Equity Detail] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch equity data' },
      { status: 500 }
    );
  }
}
