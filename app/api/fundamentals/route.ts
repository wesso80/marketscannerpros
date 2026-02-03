import { NextRequest, NextResponse } from 'next/server';

// Cache per symbol for 1 hour (fundamentals don't change frequently)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol');
    const type = searchParams.get('type') || 'overview'; // overview, income, balance, cashflow, etf
    
    if (!symbol) {
      return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    }
    
    const cacheKey = `${symbol}_${type}`;
    const now = Date.now();
    
    // Return cached data if fresh
    const cached = cache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return NextResponse.json(cached.data);
    }
    
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }
    
    let functionName = 'OVERVIEW';
    switch (type) {
      case 'income': functionName = 'INCOME_STATEMENT'; break;
      case 'balance': functionName = 'BALANCE_SHEET'; break;
      case 'cashflow': functionName = 'CASH_FLOW'; break;
      case 'etf': functionName = 'ETF_PROFILE'; break;
      default: functionName = 'OVERVIEW';
    }
    
    const response = await fetch(
      `https://www.alphavantage.co/query?function=${functionName}&symbol=${symbol}&apikey=${apiKey}`
    );
    
    if (!response.ok) {
      throw new Error(`Alpha Vantage API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.Information || data.Note) {
      return NextResponse.json({ 
        error: data.Information || data.Note,
        symbol 
      }, { status: 429 });
    }
    
    let formattedData;
    switch (type) {
      case 'overview': formattedData = formatOverview(data, symbol); break;
      case 'income': formattedData = formatIncomeStatement(data, symbol); break;
      case 'balance': formattedData = formatBalanceSheet(data, symbol); break;
      case 'cashflow': formattedData = formatCashFlow(data, symbol); break;
      case 'etf': formattedData = formatETFProfile(data, symbol); break;
      default: formattedData = data;
    }
    
    // Cache the response
    cache.set(cacheKey, { data: formattedData, timestamp: now });
    
    return NextResponse.json(formattedData);
  } catch (error) {
    console.error('Fundamentals error:', error);
    return NextResponse.json({ error: 'Failed to fetch fundamentals' }, { status: 500 });
  }
}

function formatOverview(data: any, symbol: string) {
  // Quality score based on fundamentals
  let qualityScore = 50; // Base score
  
  const peRatio = parseFloat(data.PERatio) || 0;
  const profitMargin = parseFloat(data.ProfitMargin) || 0;
  const roe = parseFloat(data.ReturnOnEquityTTM) || 0;
  const debtToEquity = parseFloat(data.DebtToEquityRatio) || 999;
  const currentRatio = parseFloat(data.CurrentRatio) || 0;
  
  // Adjust quality score
  if (peRatio > 0 && peRatio < 25) qualityScore += 10;
  if (profitMargin > 0.15) qualityScore += 15;
  if (roe > 0.15) qualityScore += 10;
  if (debtToEquity < 1) qualityScore += 10;
  if (currentRatio > 1.5) qualityScore += 5;
  
  qualityScore = Math.min(100, Math.max(0, qualityScore));
  
  return {
    timestamp: new Date().toISOString(),
    symbol,
    name: data.Name,
    description: data.Description?.slice(0, 500),
    sector: data.Sector,
    industry: data.Industry,
    exchange: data.Exchange,
    currency: data.Currency,
    country: data.Country,
    
    // Valuation
    marketCap: parseFloat(data.MarketCapitalization) || null,
    marketCapFormatted: formatLargeNumber(parseFloat(data.MarketCapitalization)),
    peRatio: peRatio || null,
    pegRatio: parseFloat(data.PEGRatio) || null,
    bookValue: parseFloat(data.BookValue) || null,
    priceToBook: parseFloat(data.PriceToBookRatio) || null,
    evToRevenue: parseFloat(data.EVToRevenue) || null,
    evToEbitda: parseFloat(data.EVToEBITDA) || null,
    
    // Profitability
    profitMargin: profitMargin,
    operatingMargin: parseFloat(data.OperatingMarginTTM) || null,
    returnOnAssets: parseFloat(data.ReturnOnAssetsTTM) || null,
    returnOnEquity: roe,
    
    // Growth
    revenueGrowthYOY: parseFloat(data.QuarterlyRevenueGrowthYOY) || null,
    epsGrowthYOY: parseFloat(data.QuarterlyEarningsGrowthYOY) || null,
    
    // Financial Health
    debtToEquity,
    currentRatio,
    
    // Dividends
    dividendYield: parseFloat(data.DividendYield) || null,
    dividendPerShare: parseFloat(data.DividendPerShare) || null,
    exDividendDate: data.ExDividendDate,
    
    // Per Share
    eps: parseFloat(data.EPS) || null,
    revenuePerShare: parseFloat(data.RevenuePerShareTTM) || null,
    
    // Shares
    sharesOutstanding: parseFloat(data.SharesOutstanding) || null,
    
    // Analyst
    analystTargetPrice: parseFloat(data.AnalystTargetPrice) || null,
    analystRating: data.AnalystRatingStrongBuy ? {
      strongBuy: parseInt(data.AnalystRatingStrongBuy) || 0,
      buy: parseInt(data.AnalystRatingBuy) || 0,
      hold: parseInt(data.AnalystRatingHold) || 0,
      sell: parseInt(data.AnalystRatingSell) || 0,
      strongSell: parseInt(data.AnalystRatingStrongSell) || 0,
    } : null,
    
    // Quality Score
    qualityScore,
    qualityLabel: qualityScore >= 75 ? 'High Quality' : qualityScore >= 50 ? 'Average' : 'Below Average',
    
    // Flags for trading
    flags: {
      highPE: peRatio > 40,
      highDebt: debtToEquity > 2,
      unprofitable: profitMargin < 0,
      lowLiquidity: currentRatio < 1,
      highDividend: (parseFloat(data.DividendYield) || 0) > 0.04,
    },
  };
}

function formatIncomeStatement(data: any, symbol: string) {
  const annual = data.annualReports?.slice(0, 5) || [];
  const quarterly = data.quarterlyReports?.slice(0, 8) || [];
  
  const formatReport = (r: any) => ({
    fiscalDate: r.fiscalDateEnding,
    revenue: parseFloat(r.totalRevenue) || 0,
    revenueFormatted: formatLargeNumber(parseFloat(r.totalRevenue)),
    grossProfit: parseFloat(r.grossProfit) || 0,
    operatingIncome: parseFloat(r.operatingIncome) || 0,
    netIncome: parseFloat(r.netIncome) || 0,
    netIncomeFormatted: formatLargeNumber(parseFloat(r.netIncome)),
    eps: parseFloat(r.reportedEPS) || null,
    grossMargin: parseFloat(r.totalRevenue) > 0 
      ? Math.round((parseFloat(r.grossProfit) / parseFloat(r.totalRevenue)) * 100) / 100 
      : null,
    netMargin: parseFloat(r.totalRevenue) > 0 
      ? Math.round((parseFloat(r.netIncome) / parseFloat(r.totalRevenue)) * 100) / 100 
      : null,
  });
  
  return {
    timestamp: new Date().toISOString(),
    symbol,
    annual: annual.map(formatReport),
    quarterly: quarterly.map(formatReport),
  };
}

function formatBalanceSheet(data: any, symbol: string) {
  const annual = data.annualReports?.slice(0, 5) || [];
  const quarterly = data.quarterlyReports?.slice(0, 4) || [];
  
  const formatReport = (r: any) => ({
    fiscalDate: r.fiscalDateEnding,
    totalAssets: parseFloat(r.totalAssets) || 0,
    totalLiabilities: parseFloat(r.totalLiabilities) || 0,
    totalEquity: parseFloat(r.totalShareholderEquity) || 0,
    cash: parseFloat(r.cashAndCashEquivalentsAtCarryingValue) || 0,
    cashFormatted: formatLargeNumber(parseFloat(r.cashAndCashEquivalentsAtCarryingValue)),
    totalDebt: parseFloat(r.shortLongTermDebtTotal) || 0,
    currentAssets: parseFloat(r.totalCurrentAssets) || 0,
    currentLiabilities: parseFloat(r.totalCurrentLiabilities) || 0,
    currentRatio: parseFloat(r.totalCurrentLiabilities) > 0 
      ? Math.round((parseFloat(r.totalCurrentAssets) / parseFloat(r.totalCurrentLiabilities)) * 100) / 100 
      : null,
    debtToEquity: parseFloat(r.totalShareholderEquity) > 0 
      ? Math.round((parseFloat(r.shortLongTermDebtTotal || 0) / parseFloat(r.totalShareholderEquity)) * 100) / 100 
      : null,
  });
  
  return {
    timestamp: new Date().toISOString(),
    symbol,
    annual: annual.map(formatReport),
    quarterly: quarterly.map(formatReport),
  };
}

function formatCashFlow(data: any, symbol: string) {
  const annual = data.annualReports?.slice(0, 5) || [];
  const quarterly = data.quarterlyReports?.slice(0, 4) || [];
  
  const formatReport = (r: any) => {
    const operating = parseFloat(r.operatingCashflow) || 0;
    const capex = parseFloat(r.capitalExpenditures) || 0;
    const freeCashFlow = operating - Math.abs(capex);
    
    return {
      fiscalDate: r.fiscalDateEnding,
      operatingCashFlow: operating,
      operatingCashFlowFormatted: formatLargeNumber(operating),
      investingCashFlow: parseFloat(r.cashflowFromInvestment) || 0,
      financingCashFlow: parseFloat(r.cashflowFromFinancing) || 0,
      capex: capex,
      freeCashFlow,
      freeCashFlowFormatted: formatLargeNumber(freeCashFlow),
      dividendsPaid: parseFloat(r.dividendPayout) || 0,
      shareRepurchases: parseFloat(r.paymentsForRepurchaseOfEquity) || 0,
    };
  };
  
  return {
    timestamp: new Date().toISOString(),
    symbol,
    annual: annual.map(formatReport),
    quarterly: quarterly.map(formatReport),
  };
}

function formatETFProfile(data: any, symbol: string) {
  return {
    timestamp: new Date().toISOString(),
    symbol,
    name: data.name,
    description: data.description,
    assetClass: data.asset_class,
    netAssets: data.net_assets,
    netAssetsFormatted: formatLargeNumber(parseFloat(data.net_assets)),
    netExpenseRatio: data.net_expense_ratio,
    inceptionDate: data.inception_date,
    sectors: data.sectors || [],
    holdings: (data.holdings || []).slice(0, 20).map((h: any) => ({
      symbol: h.symbol,
      name: h.description,
      weight: parseFloat(h.weight),
    })),
    totalHoldings: data.holdings?.length || 0,
  };
}

function formatLargeNumber(num: number): string {
  if (!num || isNaN(num)) return 'N/A';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}
