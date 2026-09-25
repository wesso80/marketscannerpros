import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { avFetch } from '@/lib/avRateGovernor';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import { defaultChainProviders, fetchSharedOptionsChain } from '@/lib/options/chainCache';
import { chainDataDate } from '@/lib/options-confluence-analyzer';
import {
  DEALER_GAMMA_CONVENTION,
  MIN_GEX_STRIKES,
  buildDealerIntelligence,
  calculateDealerGammaFromContracts,
  countGexStrikes,
  gexContractsForExpiry,
  pickGexExpiry,
  type RawChainRowForGex,
} from '@/lib/options-gex';

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

function nyTodayYmd(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

async function fetchRealtimeSpot(symbol: string): Promise<number> {
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&entitlement=realtime&apikey=${AV_KEY}`;
    const data = await avFetch<Record<string, any>>(url, `GLOBAL_QUOTE ${symbol}`);
    const gq = data?.['Global Quote'] ?? data?.['Global Quote - DATA DELAYED BY 15 MINUTES'];
    const price = parseFloat(gq?.['05. price']);
    return price > 0 ? price : 0;
  } catch {
    return 0;
  }
}

/**
 * GEX estimate for the Intraday Charts overlay.
 *
 * Built from ONE expiry of the (shared, short-TTL cached) Alpha Vantage chain plus a realtime spot quote —
 * no full analyzer run. Alpha Vantage has no dealer positions, so the result is always labelled an
 * estimate under the standard convention (dealers long calls, short puts). When the chain can't support
 * an estimate the route answers `available: false` before spending the spot-quote call.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ success: false, error: 'Please log in to use GEX' }, { status: 401 });
    }
    if (!hasPaidSessionAccess(session)) {
      return NextResponse.json({ success: false, error: 'Pro subscription required for GEX' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const symbol = String(searchParams.get('symbol') || '').trim().toUpperCase();
    const expirationDate = searchParams.get('expirationDate') || undefined;

    if (!symbol) {
      return NextResponse.json({ success: false, error: 'Symbol is required' }, { status: 400 });
    }

    const unavailable = (reason: string, extra: Record<string, unknown> = {}) => NextResponse.json({
      success: true,
      data: {
        symbol,
        available: false,
        estimate: false,
        reason,
        dealerGamma: null,
        dealerIntelligence: null,
        dealerPositionVerified: false,
        ...extra,
      },
      timestamp: new Date().toISOString(),
    });

    if (!AV_KEY) return unavailable('Options data provider not configured.');

    const chain = await fetchSharedOptionsChain<RawChainRowForGex>(symbol, {
      apiKey: AV_KEY,
      providers: defaultChainProviders(),
      fetchPayload: (fn, url) => avFetch(url, `${fn} ${symbol}`),
    });
    if (!chain) return unavailable('No usable options chain for this symbol.');

    const expiration = pickGexExpiry(chain.rows, nyTodayYmd(), expirationDate);
    if (!expiration) return unavailable('Options chain has no current expiries.');

    const contracts = gexContractsForExpiry(chain.rows, expiration);
    if (countGexStrikes(contracts) < MIN_GEX_STRIKES) {
      return unavailable(`Not enough strikes with open interest and gamma in the ${expiration} expiry to estimate GEX.`, { expirationDate: expiration });
    }

    // Spot is only fetched once the chain is known to be usable.
    const spot = await fetchRealtimeSpot(symbol);
    if (!(spot > 0)) return unavailable('Underlying price unavailable.', { expirationDate: expiration });

    const dealerGamma = calculateDealerGammaFromContracts(contracts, spot, expiration);
    const dealerIntelligence = buildDealerIntelligence({
      snapshot: dealerGamma,
      currentPrice: spot,
      baseScore: 50,
      setupDescriptor: '',
      direction: 'neutral',
    });
    const dataDate = chainDataDate(chain.payloadMeta, chain.rows as Array<{ date?: unknown }>);

    return NextResponse.json({
      success: true,
      data: {
        symbol,
        available: true,
        estimate: true,
        convention: DEALER_GAMMA_CONVENTION,
        currentPrice: spot,
        expirationDate: expiration,
        strikesUsed: countGexStrikes(contracts),
        chainSource: chain.provider,
        chainFreshness: chain.provider === 'HISTORICAL_OPTIONS' ? 'EOD' : 'REALTIME',
        asOf: dataDate || new Date(chain.fetchedAt).toISOString(),
        dealerGamma,
        dealerIntelligence,
        // Still false: this is an open-interest estimate, not verified dealer positioning.
        dealerPositionVerified: false,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate GEX',
    }, { status: 500 });
  }
}
