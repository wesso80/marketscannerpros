/**
 * Market inputs API (Pro) — GET /api/market-pressure?symbol=BTCUSD&scanMode=intraday_1h
 *
 * Returns the public Market Inputs contract (lib/research/publicMarketInputs): measured volatility, derivatives
 * (crypto) and options-chain (equity) inputs, each with source, time and an explicit "not collected" reason. The
 * Market Pressure Engine's composite score, LONG/SHORT direction, alignment, label, per-dimension scores and weights
 * are not published; the engine itself is unchanged and still used internally.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import { getIndicators } from '@/lib/onDemandFetch';
import { getAggregatedFundingRates, getAggregatedOpenInterest } from '@/lib/coingecko';
import { optionsAnalyzer } from '@/lib/options-confluence-analyzer';
import { calculateDealerGammaSnapshot } from '@/lib/options-gex';
import type { ScanMode } from '@/lib/confluence-learning-agent';
import {
  PUBLIC_MARKET_INPUTS_CONTRACT,
  MARKET_INPUTS_NOTE,
  derivativesSection,
  optionsSection,
  volatilitySection,
  type PublicMarketInputs,
} from '@/lib/research/publicMarketInputs';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
const SCAN_MODES: ScanMode[] = ['scalping', 'intraday_30m', 'intraday_1h', 'intraday_4h', 'swing_1d', 'swing_3d', 'swing_1w', 'macro_monthly', 'macro_yearly'];

// ── Asset class detection ──────────────────────────────────────────────
const CRYPTO_SUFFIXES = ['USD', 'USDT', 'USDC', 'BTC', 'ETH', 'BUSD'];
const KNOWN_CRYPTO = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'LINK', 'UNI', 'ATOM', 'BNB'];
function isCrypto(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  if (CRYPTO_SUFFIXES.some(s => upper.endsWith(s) && upper.length > s.length)) return true;
  return KNOWN_CRYPTO.includes(upper);
}

// Symbol-level market data only (no workspace data); 5-minute cache of the public reading.
const cache = new Map<string, { data: PublicMarketInputs; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) return json({ success: false, error: 'Please log in' }, 401);
    if (!hasPaidSessionAccess(session)) return json({ success: false, error: 'Pro subscription required' }, 403);

    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || '').trim().toUpperCase();
    if (!symbol) return json({ success: false, error: 'Missing symbol parameter' }, 400);
    const requestedMode = searchParams.get('scanMode') as ScanMode | null;
    const scanMode: ScanMode = requestedMode && SCAN_MODES.includes(requestedMode) ? requestedMode : 'intraday_1h';

    const cacheKey = `mpi:${symbol}:${scanMode}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CACHE_TTL) return json({ success: true, data: hit.data, cached: true });

    const assetClass: 'crypto' | 'equity' = isCrypto(symbol) ? 'crypto' : 'equity';
    const observedAt = new Date().toISOString();

    const indicators = await getIndicators(symbol, 'daily').catch((err) => { console.warn(`[market-inputs] indicators failed for ${symbol}:`, err); return null; });

    let derivatives: PublicMarketInputs['derivatives'] = null;
    if (assetClass === 'crypto') {
      const base = symbol.replace(/(USD|USDT|USDC|BUSD)$/i, '').toUpperCase();
      const [funding, oi] = await Promise.all([
        getAggregatedFundingRates([base]).catch(() => []),
        getAggregatedOpenInterest([base]).catch(() => []),
      ]);
      // Only this coin's own figures; no cross-coin average is substituted.
      derivatives = derivativesSection(
        oi.find((c) => c.symbol.toUpperCase() === base) ?? null,
        funding.find((c) => c.symbol.toUpperCase() === base) ?? null,
        observedAt,
      );
    }

    let options: PublicMarketInputs['options'] = null;
    if (assetClass === 'equity') {
      let analysis: any = null;
      let gamma: ReturnType<typeof calculateDealerGammaSnapshot> | null = null;
      try {
        analysis = await optionsAnalyzer.analyzeForOptions(symbol, scanMode);
        if (analysis?.openInterestAnalysis) gamma = calculateDealerGammaSnapshot(analysis.openInterestAnalysis, analysis.currentPrice);
      } catch (err) {
        console.warn(`[market-inputs] options failed for ${symbol}:`, err);
      }
      options = optionsSection(analysis, gamma);
    }

    const data: PublicMarketInputs = {
      contract: PUBLIC_MARKET_INPUTS_CONTRACT,
      symbol,
      assetClass,
      observedAt,
      volatility: volatilitySection(indicators),
      derivatives,
      options,
      note: MARKET_INPUTS_NOTE,
    };
    cache.set(cacheKey, { data, ts: Date.now() });
    return json({ success: true, data, cached: false });
  } catch (err) {
    console.error('[market-inputs] Error:', err);
    return json({ success: false, error: 'Market inputs could not be loaded right now.' }, 500);
  }
}
