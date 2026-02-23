/**
 * Options Expirations API
 * Returns available expiration dates for a given symbol
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';
const AV_OPTIONS_REALTIME_ENABLED = (process.env.AV_OPTIONS_REALTIME_ENABLED ?? 'true').toLowerCase() !== 'false';

export async function GET(request: NextRequest) {
  // Auth guard: AV license requires authenticated users only
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ success: false, error: 'Please log in to access market data' }, { status: 401 });
  }

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
    
    const providers = AV_OPTIONS_REALTIME_ENABLED
      ? [
          { fn: 'REALTIME_OPTIONS', requireGreeks: false },
          { fn: 'HISTORICAL_OPTIONS', requireGreeks: false },
        ]
      : [{ fn: 'HISTORICAL_OPTIONS', requireGreeks: false }];

    let data: any = null;
    let options: any[] = [];
    let sourceFunction: 'REALTIME_OPTIONS' | 'HISTORICAL_OPTIONS' | null = null;

    for (const provider of providers) {
      const requireGreeks = provider.requireGreeks ? '&require_greeks=true' : '';
      const url = `https://www.alphavantage.co/query?function=${provider.fn}&symbol=${normalizedSymbol}${requireGreeks}&apikey=${ALPHA_VANTAGE_KEY}`;

      const response = await fetch(url);
      const payload = await response.json();

      if (payload?.['Error Message']) {
        console.warn(`[options/expirations] ${provider.fn} error:`, payload['Error Message']);
        continue;
      }

      if (payload?.['Note']) {
        console.warn(`[options/expirations] ${provider.fn} note:`, payload['Note']);
        continue;
      }

      if (payload?.['Information']) {
        console.warn(`[options/expirations] ${provider.fn} info:`, payload['Information']);
        continue;
      }

      const providerOptions = payload?.['data'] || [];
      if (!Array.isArray(providerOptions) || providerOptions.length === 0) {
        continue;
      }

      data = payload;
      options = providerOptions;
      sourceFunction = provider.fn as 'REALTIME_OPTIONS' | 'HISTORICAL_OPTIONS';
      break;
    }

    if (!sourceFunction || !data || options.length === 0) {
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
      sourceFunction,
    });
    
  } catch (error) {
    console.error('Expirations fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch expirations',
    }, { status: 500 });
  }
}
