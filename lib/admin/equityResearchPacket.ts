/**
 * lib/admin/equityResearchPacket.ts — Stage 2/3 glue.
 *
 * Wraps `fetchFundamentalsBundle` and persists an AdminMarketPacket so:
 *  - Daily Operator Packet can cite the most recent equity research.
 *  - ARCA / hallucination auditor can verify model outputs against the
 *    actual JSON the model was shown.
 *  - Backtests can replay the exact fundamentals snapshot.
 *
 * Boundary: read-only persistence. Does not call the LLM.
 */

import {
  buildAdminMarketPacket,
  persistAdminMarketPacket,
  type AdminMarketPacket,
} from './marketPacket';
import {
  fetchFundamentalsBundle,
  type FundamentalsBundle,
} from './fundamentals';
import type { DataEnvelope, Freshness } from '@/lib/marketData/types';

function endpointFreshness(status: string | undefined): Freshness {
  if (status === 'ok') return 'real-time';
  if (status === 'rate-limited') return 'stale';
  return 'unknown';
}

function envelopeFromEndpoint(
  bundle: FundamentalsBundle,
  fn: string,
  hasData: boolean,
): DataEnvelope<unknown> {
  const status = bundle.endpointStatus[fn];
  const errLine = bundle.errors.find((e) => e.startsWith(`${fn}:`));
  const fetchedAt = bundle.fetchedAt;
  return {
    data: hasData ? { fn, ticker: bundle.ticker } : null,
    source: `alpha-vantage:${fn}`,
    fetchedAt,
    freshness: endpointFreshness(status),
    fromCache: 'av',
    missingFields: hasData ? [] : [fn.toLowerCase()],
    staleAfter: new Date(Date.parse(fetchedAt) + 24 * 60 * 60 * 1000).toISOString(),
    ageSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(fetchedAt)) / 1000)),
    error: errLine,
  };
}

export interface EquityResearchPacketResult {
  bundle: FundamentalsBundle;
  packet: AdminMarketPacket;
}

/**
 * Fetch fundamentals for `ticker`, wrap as a persisted AdminMarketPacket.
 */
export async function buildAndPersistEquityResearchPacket(
  workspaceId: string,
  ticker: string,
): Promise<EquityResearchPacketResult> {
  const bundle = await fetchFundamentalsBundle(ticker);

  const envelopes: DataEnvelope<unknown>[] = [
    envelopeFromEndpoint(bundle, 'OVERVIEW', !!bundle.overview),
    envelopeFromEndpoint(bundle, 'INCOME_STATEMENT', bundle.incomeStatementAnnual.length > 0),
    envelopeFromEndpoint(bundle, 'BALANCE_SHEET', bundle.balanceSheetAnnual.length > 0),
    envelopeFromEndpoint(bundle, 'CASH_FLOW', bundle.cashFlowAnnual.length > 0),
  ];

  const packet = buildAdminMarketPacket({
    workspaceId,
    scope: 'symbol',
    scopeKey: ticker.toUpperCase(),
    packetType: 'equity-research',
    envelopes,
  });

  try {
    await persistAdminMarketPacket(packet);
  } catch (e: unknown) {
    // Persistence is best-effort — never fail the memo because the snapshot
    // didn't write. Operator still gets a fresh research note in the response.
    console.warn('[equityResearchPacket] persist failed:', e instanceof Error ? e.message : String(e));
  }

  return { bundle, packet };
}
