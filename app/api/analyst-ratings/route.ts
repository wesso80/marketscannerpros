import { NextRequest, NextResponse } from "next/server";
import { avTakeToken } from '@/lib/avRateGovernor';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

function formatMarketCap(value: string | number | undefined): string {
  if (!value) return 'N/A';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return 'N/A';
  
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");

    if (!symbol) {
      return NextResponse.json({
        success: false,
        error: "Symbol is required",
      });
    }

    // Fetch company overview from Alpha Vantage
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    await avTakeToken();
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Alpha Vantage API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Check for API errors or empty response
    if (data.Note || data.Information || !data.Symbol) {
      return NextResponse.json({
        success: false,
        error: data.Note || data.Information || "No data available for this symbol",
      });
    }

    // Parse analyst ratings
    const strongBuy = parseInt(data.AnalystRatingStrongBuy) || 0;
    const buy = parseInt(data.AnalystRatingBuy) || 0;
    const hold = parseInt(data.AnalystRatingHold) || 0;
    const sell = parseInt(data.AnalystRatingSell) || 0;
    const strongSell = parseInt(data.AnalystRatingStrongSell) || 0;
    
    // Calculate consensus
    const totalRatings = strongBuy + buy + hold + sell + strongSell;
    let analystRating = 'N/A';
    if (totalRatings > 0) {
      const buyPercentage = ((strongBuy + buy) / totalRatings) * 100;
      const sellPercentage = ((sell + strongSell) / totalRatings) * 100;
      
      if (buyPercentage >= 70) analystRating = 'Strong Buy';
      else if (buyPercentage >= 50) analystRating = 'Buy';
      else if (sellPercentage >= 50) analystRating = 'Sell';
      else if (sellPercentage >= 70) analystRating = 'Strong Sell';
      else analystRating = 'Hold';
    }

    const result = {
      symbol: data.Symbol,
      name: data.Name || symbol,
      sector: data.Sector || 'N/A',
      industry: data.Industry || 'N/A',
      marketCap: formatMarketCap(data.MarketCapitalization),
      peRatio: data.PERatio && data.PERatio !== 'None' ? parseFloat(data.PERatio) : null,
      forwardPE: data.ForwardPE && data.ForwardPE !== 'None' ? parseFloat(data.ForwardPE) : null,
      eps: data.EPS && data.EPS !== 'None' ? parseFloat(data.EPS) : null,
      dividendYield: data.DividendYield && data.DividendYield !== 'None' ? parseFloat(data.DividendYield) * 100 : null,
      targetPrice: data.AnalystTargetPrice && data.AnalystTargetPrice !== 'None' ? parseFloat(data.AnalystTargetPrice) : null,
      analystRating,
      strongBuy,
      buy,
      hold,
      sell,
      strongSell,
      description: data.Description || 'No description available.',
      week52High: data['52WeekHigh'] && data['52WeekHigh'] !== 'None' ? parseFloat(data['52WeekHigh']) : null,
      week52Low: data['52WeekLow'] && data['52WeekLow'] !== 'None' ? parseFloat(data['52WeekLow']) : null,
      beta: data.Beta && data.Beta !== 'None' ? parseFloat(data.Beta) : null,
      profitMargin: data.ProfitMargin && data.ProfitMargin !== 'None' ? parseFloat(data.ProfitMargin) * 100 : null,
      revenueGrowth: data.QuarterlyRevenueGrowthYOY && data.QuarterlyRevenueGrowthYOY !== 'None' ? parseFloat(data.QuarterlyRevenueGrowthYOY) * 100 : null,
    };

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Analyst ratings error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch analyst data",
      },
      { status: 500 }
    );
  }
}
