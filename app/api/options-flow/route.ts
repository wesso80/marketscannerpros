/**
 * Options Flow API — /api/options-flow
 *
 * Options chain flow facts for the nearest usable expiry:
 * - Call/put premium, volume, open interest and volume vs OI
 * - IV skew and ATM IV
 * - Buy/sell premium split estimated from bid/ask (approximate, labelled as such)
 *
 * The chain is a snapshot, not trade prints, so directional scores (conviction, large-flow direction/confidence),
 * block/sweep labels and whale/institutional tiers are NOT returned: `inferenceAvailable: false` and those
 * fields are null. See toSnapshotFlowView in lib/options-flow-classifier.
 *
 * Query params:
 *   symbol — required ticker (e.g. AAPL, SPY)
 *
 * Data source: shared chain — Alpha Vantage REALTIME_OPTIONS, else HISTORICAL_OPTIONS (previous session, labelled)
 */

import { NextRequest, NextResponse } from 'next/server';
import { avFetch } from '@/lib/avRateGovernor';
import { checkOptionsAccess } from '@/lib/options/access';
import { describeChainSource, fetchSharedOptionsChain, type ChainQuoteBasis } from '@/lib/options/chainCache';
import { classifyOptionsFlow, toSnapshotFlowView, type OptionsFlowClassification, type SnapshotFlowView } from '@/lib/options-flow-classifier';

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
    // Shared chain: REALTIME_OPTIONS (live bid/ask) first; HISTORICAL_OPTIONS (previous session close) when the
    // live chain is missing, not entitled, or has too few two-sided quotes. FMV marks carry no bid/ask, so they
    // can never be classified as flow.
    const providerIssues: string[] = [];
    const shared = await fetchSharedOptionsChain<AVContract>(symbol, {
      apiKey: AV_KEY,
      fetchPayload: (fn, url) => avFetch<{ data?: AVContract[] }>(url, `OPTIONS_FLOW_${fn}_${symbol}`),
      issues: providerIssues,
    });
    if (!shared) {
      // A key without the realtime-options entitlement gets Alpha Vantage's artificial sample chain — never
      // classify that as flow; say so plainly when no previous-session chain was available either.
      const notEntitled = providerIssues.find((i) => /^REALTIME_OPTIONS: .*(not entitled|artificial sample)/i.test(i));
      if (notEntitled) {
        console.warn(`[options-flow] ${symbol} realtime options not entitled and no fallback chain: ${providerIssues.join(' | ')}`);
        return NextResponse.json({
          error: 'Realtime options data is not enabled on the Alpha Vantage API key (Alpha Vantage returned its sample data). Options Flow needs realtime options.',
          providerIssue: notEntitled,
        }, { status: 503 });
      }
      return NextResponse.json({ error: `Options data unavailable for ${symbol}`, providerIssue: providerIssues.join(' | ').slice(0, 400) }, { status: 502 });
    }
    const contracts = shared.rows;
    const source = {
      provider: shared.provider,
      quoteBasis: shared.quoteBasis,
      asOfDate: shared.asOfDate,
      sourceLabel: describeChainSource(shared),
    };

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

    // Previous-session data describes yesterday's trading; an expiry that settles today (0DTE, US time) is about
    // to vanish, so prefer the next expiry with dte >= 1 when one exists.
    const skippedZeroDte = shared.quoteBasis === 'previous_session' && expirations[0] === todayKey && expirations.length > 1;
    const candidateExpirations = skippedZeroDte ? expirations.filter((expiration) => expiration > todayKey) : expirations;

    // Select nearest expiration with decent contract count
    let selectedExpiry = candidateExpirations[0];
    for (const exp of candidateExpirations) {
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
        ...source,
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

    const view = toSnapshotFlowView(classification);
    const onPreviousSession = shared.quoteBasis === 'previous_session';

    // Build response (trim contracts to reduce payload)
    const response: OptionsFlowResponse = {
      success: true,
      symbol,
      currentPrice,
      changePct: parseFloat(quote?.['10. change percent']?.replace('%', '') || '0'),
      expiration: selectedExpiry,
      availableExpirations: expirations,
      contractCount: expiryContracts.length,
      expiryNote: skippedZeroDte
        ? `Skipped ${todayKey} (expires today) because this is previous-session data; showing the next expiry.`
        : null,
      ...source,
      factsLabel: onPreviousSession ? 'Previous session estimate' : 'Snapshot estimate',
      inferenceAvailable: view.inferenceAvailable,
      inferenceNote: view.inferenceNote,
      facts: view.facts,
      aggregate: view.aggregate,
      flowPattern: view.flowPattern,
      ivSkew: classification.ivSkew,
      smartMoney: view.smartMoney,
      topFlows: view.topFlows,
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
  /** Set when a same-day (0DTE) expiry was skipped because the data is from the previous session */
  expiryNote: string | null;
  provider: string;
  /** previous_session = HISTORICAL_OPTIONS close — this is the prior session's flow, not live. */
  quoteBasis: ChainQuoteBasis;
  asOfDate: string | null;
  sourceLabel: string;
  /** 'Previous session estimate' on the HISTORICAL_OPTIONS fallback */
  factsLabel: string;
  /** false: snapshot data, so conviction/confidence, block/sweep and whale/institutional tiers are withheld (null) */
  inferenceAvailable: boolean;
  inferenceNote: string;
  facts: SnapshotFlowView['facts'];
  aggregate: SnapshotFlowView['aggregate'];
  flowPattern: SnapshotFlowView['flowPattern'];
  ivSkew: OptionsFlowClassification['ivSkew'];
  smartMoney: SnapshotFlowView['smartMoney'];
  topFlows: SnapshotFlowView['topFlows'];
  timestamp: string;
  duration: string;
}
