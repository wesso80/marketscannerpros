import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

export async function GET(request: NextRequest) {
  try {
    // Get top gainers, losers, and most actively traded
    const url = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${ALPHA_VANTAGE_API_KEY}`;
    
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json();
    
    if (data['Error Message'] || data['Note']) {
      return NextResponse.json(
        { error: data['Error Message'] || data['Note'] },
        { status: 429 }
      );
    }
    
    return NextResponse.json({
      success: true,
      metadata: data.metadata,
      lastUpdated: data.last_updated, // Alpha Vantage's last update timestamp
      topGainers: data.top_gainers || [],
      topLosers: data.top_losers || [],
      mostActive: data.most_actively_traded || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch market movers' },
      { status: 500 }
    );
  }
}
