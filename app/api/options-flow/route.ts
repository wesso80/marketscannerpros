/**
 * Options Flow API — /api/options-flow
 *
 * Enhanced options flow analysis with:
 * - Trade direction classification (bid/ask inference)
 * - Block vs sweep pattern detection
 * - Net premium flow with directional conviction
 * - IV skew analysis
 * - Smart money scoring
 *
 * Query params:
 *   symbol — required ticker (e.g. AAPL, SPY)
 *
 * Data source: Alpha Vantage REALTIME_OPTIONS_FMV
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { avFetch } from '@/lib/avRateGovernor';
import { classifyOptionsFlow, type OptionsFlowClassification } from '@/lib/options-flow-classifier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

interface AVContract {
  contractID?: string;
  symbol?: string;
  expiration?: string;
  strike?: string;
  type?: string;
  last?: string;
  mark?: string;
  bid?: string;
  ask?: string;
  volume?: string;
  open_interest?: string;
  implied_volatility?: string;
  delta?: string;
  gamma?: string;
  theta?: string;
  vega?: string;
  [key: string]: unknown;
}

interface AVQuoteResult {
  'Global Quote'?: {
    '05. price'?: string;
    '10. change percent'?: string;
  };
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase().trim();
  if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
  }

  if (!AV_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const start = Date.now();

  try {
    // Fetch options chain
    const url = `https://www.alphavantage.co/query?function=REALTIME_OPTIONS_FMV&symbol=${symbol}&require_greeks=true&apikey=${AV_KEY}`;
    const payload = await avFetch<{ data?: AVContract[] }>(url, `OPTIONS_FLOW_${symbol}`);

    if (!payload?.data?.length) {
      return NextResponse.json({ error: `No options data for ${symbol}` }, { status: 404 });
    }

    const contracts = payload.data;

    // Get current price
    const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${AV_KEY}`;
    const quoteData = await avFetch<AVQuoteResult>(quoteUrl, `QUOTE_${symbol}`);
    const currentPrice = parseFloat(quoteData?.['Global Quote']?.['05. price'] || '0');

    if (currentPrice <= 0) {
      return NextResponse.json({ error: `Could not get price for ${symbol}` }, { status: 404 });
    }

    // Group by expiration, pick the nearest weekly
    const byExpiry = new Map<string, AVContract[]>();
    for (const c of contracts) {
      if (!c.expiration) continue;
      const arr = byExpiry.get(c.expiration) || [];
      arr.push(c);
      byExpiry.set(c.expiration, arr);
    }

    // Sort expirations by date
    const expirations = [...byExpiry.keys()].sort();
    if (expirations.length === 0) {
      return NextResponse.json({ error: 'No expirations found' }, { status: 404 });
    }

    // Select nearest expiration with decent contract count
    let selectedExpiry = expirations[0];
    for (const exp of expirations) {
      const group = byExpiry.get(exp) || [];
      if (group.length >= 20) {
        selectedExpiry = exp;
        break;
      }
    }

    const expiryContracts = byExpiry.get(selectedExpiry) || [];
    const calls = expiryContracts.filter(c => c.type?.toLowerCase() === 'call');
    const puts = expiryContracts.filter(c => c.type?.toLowerCase() === 'put');

    // Run flow classification
    const classification = classifyOptionsFlow(
      calls as any[],
      puts as any[],
      currentPrice,
      symbol,
      selectedExpiry,
    );

    // Build response (trim contracts to reduce payload)
    const response: OptionsFlowResponse = {
      success: true,
      symbol,
      currentPrice,
      changePct: parseFloat(quoteData?.['Global Quote']?.['10. change percent']?.replace('%', '') || '0'),
      expiration: selectedExpiry,
      availableExpirations: expirations,
      contractCount: expiryContracts.length,
      aggregate: classification.aggregate,
      flowPattern: classification.flowPattern,
      ivSkew: classification.ivSkew,
      smartMoney: {
        direction: classification.smartMoney.direction,
        confidence: classification.smartMoney.confidence,
        signals: classification.smartMoney.signals,
        whaleCount: classification.smartMoney.whaleFlows.length,
        institutionalCount: classification.smartMoney.institutionalFlows.length,
      },
      topFlows: classification.topFlows.map(f => ({
        strike: f.strike,
        type: f.type,
        direction: f.direction,
        directionConfidence: f.directionConfidence,
        volume: f.volume,
        openInterest: f.openInterest,
        estimatedPremium: f.estimatedPremium,
        premiumTier: f.premiumTier,
        moneyness: f.moneyness,
        iv: f.iv,
        delta: f.delta,
      })),
      timestamp: classification.timestamp,
      duration: `${Date.now() - start}ms`,
    };

    return NextResponse.json(response);
  } catch (err: any) {
    console.error('[options-flow] Error:', err);
    return NextResponse.json({ error: 'Options flow analysis failed' }, { status: 500 });
  }
}

/* ── Response type ── */

interface OptionsFlowResponse {
  success: boolean;
  symbol: string;
  currentPrice: number;
  changePct: number;
  expiration: string;
  availableExpirations: string[];
  contractCount: number;
  aggregate: OptionsFlowClassification['aggregate'];
  flowPattern: OptionsFlowClassification['flowPattern'];
  ivSkew: OptionsFlowClassification['ivSkew'];
  smartMoney: {
    direction: string;
    confidence: number;
    signals: string[];
    whaleCount: number;
    institutionalCount: number;
  };
  topFlows: Array<{
    strike: number;
    type: string;
    direction: string;
    directionConfidence: number;
    volume: number;
    openInterest: number;
    estimatedPremium: number;
    premiumTier: string;
    moneyness: string;
    iv: number;
    delta: number;
  }>;
  timestamp: string;
  duration: string;
}
