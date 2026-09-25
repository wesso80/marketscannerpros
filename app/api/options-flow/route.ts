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
import { avFetch } from '@/lib/avRateGovernor';
import { checkOptionsAccess } from '@/lib/options/access';
import { isAlphaVantageSampleChain, usableOptionRows } from '@/lib/options/avChain';
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
  'Global Quote - DATA DELAYED BY 15 MINUTES'?: {
    '05. price'?: string;
    '10. change percent'?: string;
  };
}

export async function GET(req: NextRequest) {
  const access = await checkOptionsAccess(req);
  if (!access.ok) {
    return access.status === 401
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : NextResponse.json({ error: 'Options Flow requires a Pro subscription' }, { status: 403 });
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
    let payload: { data?: AVContract[] } | null;
    try {
      payload = await avFetch<{ data?: AVContract[] }>(url, `OPTIONS_FLOW_${symbol}`);
    } catch (err) {
      const detail = (err instanceof Error ? err.message : String(err)).slice(0, 200);
      console.warn(`[options-flow] ${symbol} REALTIME_OPTIONS_FMV failed: ${detail}`);
      return NextResponse.json({ error: `Options data unavailable for ${symbol}`, providerIssue: detail }, { status: 502 });
    }

    // Options flow needs the realtime chain. A key without the realtime-options entitlement gets
    // Alpha Vantage's artificial sample chain here — never classify that as flow.
    if (isAlphaVantageSampleChain(payload)) {
      console.warn(`[options-flow] ${symbol} REALTIME_OPTIONS_FMV returned the artificial premium sample (key not entitled to realtime options)`);
      return NextResponse.json({
        error: 'Realtime options data is not enabled on the Alpha Vantage API key (Alpha Vantage returned its sample data). Options Flow needs realtime options.',
        providerIssue: 'REALTIME_OPTIONS_FMV: artificial sample (not entitled)',
      }, { status: 503 });
    }

    const contracts = usableOptionRows(payload, symbol);
    if (!contracts) {
      return NextResponse.json({ error: `No options data for ${symbol}` }, { status: 404 });
    }

    // Get current price
    // entitlement=realtime: without it Alpha Vantage returns the previous close, so intraday moneyness/ATM
    // would be judged against a stale price (same request the Options Terminal makes).
    const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&entitlement=realtime&apikey=${AV_KEY}`;
    let quoteData: AVQuoteResult | null;
    try {
      quoteData = await avFetch<AVQuoteResult>(quoteUrl, `QUOTE_${symbol}`);
    } catch {
      return NextResponse.json({ error: `Price data unavailable for ${symbol}` }, { status: 502 });
    }
    const quote = quoteData?.['Global Quote'] ?? quoteData?.['Global Quote - DATA DELAYED BY 15 MINUTES'];
    const currentPrice = parseFloat(quote?.['05. price'] || '0');

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

    // Only current/future expirations can be treated as current flow evidence.
    const todayParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const getPart = (type: string) => todayParts.find((part) => part.type === type)?.value || '';
    const todayKey = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
    const expirations = [...byExpiry.keys()]
      .filter((expiration) => /^\d{4}-\d{2}-\d{2}$/.test(expiration) && expiration >= todayKey)
      .sort();
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
    const quotedContracts = expiryContracts.filter((contract) => {
      const bid = Number.parseFloat(contract.bid || '0');
      const ask = Number.parseFloat(contract.ask || '0');
      return bid > 0 && ask > 0 && ask >= bid;
    });
    const quoteCoverage = expiryContracts.length ? quotedContracts.length / expiryContracts.length : 0;
    if (quoteCoverage < 0.25) {
      return NextResponse.json({
        error: `Options flow unavailable: only ${Math.round(quoteCoverage * 100)}% of ${selectedExpiry} contracts have usable bid/ask quotes`,
        code: 'INSUFFICIENT_QUOTE_COVERAGE',
        expiration: selectedExpiry,
        quoteCoveragePct: Math.round(quoteCoverage * 100),
      }, { status: 422 });
    }
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
      changePct: parseFloat(quote?.['10. change percent']?.replace('%', '') || '0'),
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
