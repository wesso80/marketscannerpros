/**
 * Options Expirations API
 * Returns available expiration dates for a given symbol
 */

import { NextRequest, NextResponse } from 'next/server';

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    
    if (!symbol) {
      return NextResponse.json({
        success: false,
        error: 'Symbol is required',
      }, { status: 400 });
    }
    
    if (!ALPHA_VANTAGE_KEY) {
      return NextResponse.json({
        success: false,
        error: 'API key not configured',
      }, { status: 500 });
    }
    
    const normalizedSymbol = symbol.toUpperCase().trim();
    console.log(`📅 Fetching expiration dates for ${normalizedSymbol}...`);
    
    // Use HISTORICAL_OPTIONS to get available expirations
    const url = `https://www.alphavantage.co/query?function=HISTORICAL_OPTIONS&symbol=${normalizedSymbol}&apikey=${ALPHA_VANTAGE_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data['Error Message']) {
      return NextResponse.json({
        success: false,
        error: data['Error Message'],
      }, { status: 400 });
    }
    
    if (data['Note']) {
      return NextResponse.json({
        success: false,
        error: 'Rate limit reached - please wait a moment',
      }, { status: 429 });
    }
    
    if (data['Information']) {
      return NextResponse.json({
        success: false,
        error: 'Premium API access required for options data',
      }, { status: 403 });
    }
    
    const options = data['data'] || [];
    if (!Array.isArray(options) || options.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No options data available for this symbol',
      }, { status: 404 });
    }
    
    // Collect unique expiration dates with contract counts
    const expiryStats: Map<string, { calls: number; puts: number; totalOI: number }> = new Map();
    
    for (const opt of options) {
      if (!opt.expiration) continue;
      
      const expiry = opt.expiration;
      const current = expiryStats.get(expiry) || { calls: 0, puts: 0, totalOI: 0 };
      
      if (opt.type?.toLowerCase() === 'call') {
        current.calls++;
      } else if (opt.type?.toLowerCase() === 'put') {
        current.puts++;
      }
      
      current.totalOI += parseInt(opt.open_interest || '0', 10);
      expiryStats.set(expiry, current);
    }
    
    // Convert to sorted array with DTE calculations
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const expirations = Array.from(expiryStats.entries())
      .map(([date, stats]) => {
        const expiryDate = new Date(date);
        const dte = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        // Format for display: "Jan 31 (3 DTE)"
        const formatted = expiryDate.toLocaleDateString('en-US', { 
          weekday: 'short',
          month: 'short', 
          day: 'numeric' 
        });
        
        return {
          date,
          formatted,
          dte,
          calls: stats.calls,
          puts: stats.puts,
          totalOI: stats.totalOI,
          label: `${formatted} (${dte} DTE)`,
        };
      })
      .filter(exp => exp.dte >= 0) // Only future expirations
      .sort((a, b) => a.dte - b.dte); // Sort by DTE ascending
    
    console.log(`✅ Found ${expirations.length} expiration dates for ${normalizedSymbol}`);
    
    return NextResponse.json({
      success: true,
      symbol: normalizedSymbol,
      expirations,
      count: expirations.length,
    });
    
  } catch (error) {
    console.error('Expirations fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch expirations',
    }, { status: 500 });
  }
}
