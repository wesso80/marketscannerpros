import { NextRequest, NextResponse } from 'next/server';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  
  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }
  
  try {
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data['Error Message'] || data['Note']) {
      return NextResponse.json(
        { error: data['Error Message'] || data['Note'] },
        { status: 429 }
      );
    }
    
    if (!data.Symbol) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }
    
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
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch company overview' },
      { status: 500 }
    );
  }
}
