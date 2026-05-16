/**
 * lib/admin/marketPacket.ts — canonical AdminMarketPacket builder + persistence.
 *
 * The AdminMarketPacket is the single shape every admin memo / page / report
 * consumes. Building one creates a snapshot that:
 *   1. is persisted to admin_market_packets (with a stable id)
 *   2. carries full provenance (sources, fetchedAt per source, freshness)
 *   3. is the substrate that ARCA / LLM layers may cite from
 *   4. is the substrate backtests replay against
 *
 * If a field is missing, it stays missing. We never silently fill.
 */

import { q } from '@/lib/db';
import crypto from 'crypto';
import type {
  DataEnvelope,
  OhlcBar,
  QuoteData,
  OverviewData,
  EarningsRow,
  OptionContract,
  IndicatorSnapshot,
  NewsEvent,
} from '@/lib/marketData';

export type PacketType =
  | 'equity-research'
  | 'earnings'
  | 'options'
  | 'risk'
  | 'sector'
  | 'quant'
  | 'daily-brief'
  | 'morning-brief'
  | 'cross-asset'
  | 'macro'
  | 'symbol-terminal';

export interface PacketSourceRef {
  name: string;                // e.g. 'alpha-vantage:GLOBAL_QUOTE'
  fetchedAt: string;
  freshness: string;
  fromCache: string;
  missingFields: string[];
  ageSeconds: number;
  error?: string;
}

export interface AdminMarketPacket {
  id: string;
  workspaceId: string;
  scope: 'symbol' | 'sector' | 'macro' | 'portfolio' | 'multi';
  scopeKey: string;
  packetType: PacketType;
  builtAt: string;
  staleAfter: string;
  freshness: 'real-time' | 'delayed' | 'stale' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  evidenceQuality: number;     // 0..100

  // Optional payload slices — each carries provenance via `sources`.
  quote?: QuoteData | null;
  overview?: OverviewData | null;
  earnings?: EarningsRow[] | null;
  bars?: { timeframe: string; values: OhlcBar[] }[] | null;
  indicators?: { timeframe: string; snapshot: IndicatorSnapshot }[] | null;
  optionsChain?: OptionContract[] | null;
  news?: NewsEvent[] | null;

  /** Raw provenance list — every external/internal data fetch contributing to this packet. */
  sources: PacketSourceRef[];
  /** Aggregate missing critical fields (deduped across sources). */
  missingFields: string[];
}

function ulidLike(): string {
  return Date.now().toString(36) + '_' + crypto.randomBytes(8).toString('hex');
}

function sourceFromEnvelope<T>(env: DataEnvelope<T>): PacketSourceRef {
  return {
    name: env.source,
    fetchedAt: env.fetchedAt,
    freshness: env.freshness,
    fromCache: env.fromCache,
    missingFields: env.missingFields,
    ageSeconds: env.ageSeconds,
    error: env.error,
  };
}

export interface BuildPacketInput {
  workspaceId: string;
  scope: AdminMarketPacket['scope'];
  scopeKey: string;
  packetType: PacketType;
  envelopes: DataEnvelope<unknown>[];
  staleAfter?: string;
  quote?: QuoteData | null;
  overview?: OverviewData | null;
  earnings?: EarningsRow[] | null;
  bars?: { timeframe: string; values: OhlcBar[] }[] | null;
  indicators?: { timeframe: string; snapshot: IndicatorSnapshot }[] | null;
  optionsChain?: OptionContract[] | null;
  news?: NewsEvent[] | null;
}

/** Compute aggregate freshness/confidence/evidenceQuality from contributing envelopes. */
function aggregate(envelopes: DataEnvelope<unknown>[]): {
  freshness: AdminMarketPacket['freshness'];
  confidence: AdminMarketPacket['confidence'];
  evidenceQuality: number;
  staleAfter: string;
  missingFields: string[];
} {
  if (envelopes.length === 0) {
    return { freshness: 'unknown', confidence: 'low', evidenceQuality: 0, staleAfter: new Date().toISOString(), missingFields: [] };
  }
  const order: Record<string, number> = { 'real-time': 0, delayed: 1, stale: 2, unknown: 3 };
  let worst: AdminMarketPacket['freshness'] = 'real-time';
  let earliestStale = Number.POSITIVE_INFINITY;
  let realCount = 0;
  const missing = new Set<string>();
  for (const e of envelopes) {
    if (order[e.freshness] > order[worst]) worst = e.freshness as AdminMarketPacket['freshness'];
    const sa = Date.parse(e.staleAfter);
    if (Number.isFinite(sa)) earliestStale = Math.min(earliestStale, sa);
    if (e.data !== null) realCount++;
    for (const m of e.missingFields) missing.add(m);
  }
  const coverage = realCount / envelopes.length;
  const evidenceQuality = Math.round(coverage * 70 + (worst === 'real-time' ? 30 : worst === 'delayed' ? 15 : 0));
  const confidence: AdminMarketPacket['confidence'] =
    evidenceQuality >= 75 ? 'high' : evidenceQuality >= 40 ? 'medium' : 'low';
  return {
    freshness: worst,
    confidence,
    evidenceQuality,
    staleAfter: Number.isFinite(earliestStale) ? new Date(earliestStale).toISOString() : new Date().toISOString(),
    missingFields: Array.from(missing),
  };
}

export function buildAdminMarketPacket(input: BuildPacketInput): AdminMarketPacket {
  const agg = aggregate(input.envelopes);
  return {
    id: ulidLike(),
    workspaceId: input.workspaceId,
    scope: input.scope,
    scopeKey: input.scopeKey,
    packetType: input.packetType,
    builtAt: new Date().toISOString(),
    staleAfter: input.staleAfter ?? agg.staleAfter,
    freshness: agg.freshness,
    confidence: agg.confidence,
    evidenceQuality: agg.evidenceQuality,
    quote: input.quote ?? null,
    overview: input.overview ?? null,
    earnings: input.earnings ?? null,
    bars: input.bars ?? null,
    indicators: input.indicators ?? null,
    optionsChain: input.optionsChain ?? null,
    news: input.news ?? null,
    sources: input.envelopes.map(sourceFromEnvelope),
    missingFields: agg.missingFields,
  };
}

export async function persistAdminMarketPacket(packet: AdminMarketPacket): Promise<void> {
  const { id, workspaceId, scope, scopeKey, packetType, builtAt, staleAfter,
    freshness, confidence, evidenceQuality, sources, ...rest } = packet;
  await q(
    `INSERT INTO admin_market_packets
       (id, workspace_id, scope, scope_key, packet_type, payload, sources,
        freshness, confidence, evidence_quality, stale_after, built_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO NOTHING`,
    [
      id, workspaceId, scope, scopeKey, packetType,
      JSON.stringify(rest),
      JSON.stringify(sources),
      freshness, confidence, evidenceQuality,
      new Date(staleAfter), new Date(builtAt),
    ],
  );
}

export async function readLatestAdminMarketPacket(opts: {
  workspaceId: string;
  scope: AdminMarketPacket['scope'];
  scopeKey: string;
  packetType: PacketType;
}): Promise<AdminMarketPacket | null> {
  const rows = await q<{
    id: string; workspace_id: string; scope: string; scope_key: string;
    packet_type: string; payload: Record<string, unknown>; sources: PacketSourceRef[];
    freshness: string; confidence: string; evidence_quality: string;
    stale_after: Date | null; built_at: Date;
  }>(
    `SELECT * FROM admin_market_packets
      WHERE workspace_id = $1 AND scope = $2 AND scope_key = $3 AND packet_type = $4
      ORDER BY built_at DESC LIMIT 1`,
    [opts.workspaceId, opts.scope, opts.scopeKey, opts.packetType],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    scope: r.scope as AdminMarketPacket['scope'],
    scopeKey: r.scope_key,
    packetType: r.packet_type as PacketType,
    builtAt: r.built_at.toISOString(),
    staleAfter: (r.stale_after ?? new Date()).toISOString(),
    freshness: r.freshness as AdminMarketPacket['freshness'],
    confidence: r.confidence as AdminMarketPacket['confidence'],
    evidenceQuality: Number(r.evidence_quality),
    sources: r.sources,
    missingFields: (r.payload.missingFields as string[]) ?? [],
    quote: (r.payload.quote as QuoteData) ?? null,
    overview: (r.payload.overview as OverviewData) ?? null,
    earnings: (r.payload.earnings as EarningsRow[]) ?? null,
    bars: (r.payload.bars as { timeframe: string; values: OhlcBar[] }[]) ?? null,
    indicators: (r.payload.indicators as { timeframe: string; snapshot: IndicatorSnapshot }[]) ?? null,
    optionsChain: (r.payload.optionsChain as OptionContract[]) ?? null,
    news: (r.payload.news as NewsEvent[]) ?? null,
  };
}
