/**
 * lib/admin/memoPacketPersister.ts — Stage 3 helper.
 *
 * Each admin memo (equity-research, daily-brief, earnings-analyzer, etc.)
 * runs a data fetch BEFORE calling the LLM. This helper turns that data
 * into a persisted AdminMarketPacket so:
 *  1. ARCA can be invoked against the EXACT snapshot the memo saw.
 *  2. Operator can re-open the snapshot later (Daily Operator Packet).
 *  3. Backtests can replay deterministically.
 *
 * If persistence fails, we log + continue — never block the memo on it.
 */

import {
  buildAdminMarketPacket,
  persistAdminMarketPacket,
  type AdminMarketPacket,
  type PacketType,
} from './marketPacket';
import type { DataEnvelope, Freshness } from '@/lib/marketData/types';

export interface MemoSourceInput {
  /** Logical source name, e.g. 'alpha-vantage:TIME_SERIES_DAILY' */
  source: string;
  /** Whether this source returned usable data (drives freshness aggregation). */
  ok: boolean;
  /** Optional freshness override. Default: 'real-time' if ok, else 'unknown'. */
  freshness?: Freshness;
  /** When this fetch happened. Default: now. */
  fetchedAt?: string;
  /** Critical fields that were missing in the response. */
  missingFields?: string[];
  /** Underlying error message if any. */
  error?: string;
}

export interface PersistMemoPacketInput {
  workspaceId: string;
  scope: AdminMarketPacket['scope'];
  scopeKey: string;          // e.g. ticker / sector etf / 'global'
  packetType: PacketType;
  sources: MemoSourceInput[];
  /** Hours until the packet should be considered stale. Default 24. */
  staleAfterHours?: number;
}

function toEnvelope(input: MemoSourceInput): DataEnvelope<unknown> {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  return {
    data: input.ok ? { ok: true } : null,
    source: input.source,
    fetchedAt,
    freshness: input.freshness ?? (input.ok ? 'real-time' : 'unknown'),
    fromCache: 'av',
    missingFields: input.missingFields ?? [],
    staleAfter: new Date(Date.parse(fetchedAt) + 24 * 60 * 60 * 1000).toISOString(),
    ageSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(fetchedAt)) / 1000)),
    error: input.error,
  };
}

/**
 * Build + persist an AdminMarketPacket from an array of source descriptors.
 * Returns the packet on success, or null on failure (already logged).
 */
export async function persistMemoPacket(
  input: PersistMemoPacketInput,
): Promise<AdminMarketPacket | null> {
  try {
    const envelopes = input.sources.map(toEnvelope);
    const staleAfter = new Date(
      Date.now() + (input.staleAfterHours ?? 24) * 60 * 60 * 1000,
    ).toISOString();
    const packet = buildAdminMarketPacket({
      workspaceId: input.workspaceId,
      scope: input.scope,
      scopeKey: input.scopeKey,
      packetType: input.packetType,
      envelopes,
      staleAfter,
    });
    await persistAdminMarketPacket(packet);
    return packet;
  } catch (e: unknown) {
    console.warn(
      '[memoPacketPersister]',
      input.packetType,
      input.scopeKey,
      'persist failed:',
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}
