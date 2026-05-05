/**
 * Layer 1 — Brain Event Recorder
 *
 * Single entry point for recording every meaningful platform event with
 * full provenance. Engines call `recordBrainEvent()` instead of writing
 * to ad-hoc tables.
 *
 * Provenance contract:
 *   - Source, freshness, model_version, rule_version REQUIRED.
 *   - admin_only and public_safe are mutually exclusive (CHECK enforces).
 *   - input_snapshot_hash + score_snapshot make the event replayable.
 */

import { createHash, randomUUID } from 'crypto';
import { q } from '@/lib/db';
import {
  BRAIN_RULE_VERSION_DEFAULT,
  type BrainEvent,
  type BrainEventInput,
} from './types';

const DEFAULT_MODEL_VERSION = 'unversioned';

/**
 * Compute a stable sha256 hash of arbitrary inputs. Order-independent
 * for plain objects (sorted keys); arrays preserve order.
 */
export function hashInputs(inputs: unknown): string {
  return createHash('sha256').update(canonical(inputs)).digest('hex');
}

function canonical(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonical).join(',') + ']';
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v));
  return '{' + entries.join(',') + '}';
}

export async function recordBrainEvent(input: BrainEventInput): Promise<BrainEvent> {
  if (!input.workspaceId) {
    throw new Error('recordBrainEvent: workspaceId is required');
  }
  if (!input.source) {
    throw new Error('recordBrainEvent: source is required');
  }
  if (!input.dataFreshness) {
    throw new Error('recordBrainEvent: dataFreshness is required');
  }
  if (input.adminOnly && input.publicSafe) {
    throw new Error('recordBrainEvent: adminOnly and publicSafe are mutually exclusive');
  }

  const eventId = randomUUID();
  const ts = input.ts ?? new Date();
  const event: BrainEvent = {
    eventId,
    workspaceId: input.workspaceId,
    symbol: input.symbol ?? null,
    assetClass: input.assetClass ?? null,
    timeframe: input.timeframe ?? null,
    eventType: input.eventType,
    ts,
    source: input.source,
    dataFreshness: input.dataFreshness,
    inputSnapshotHash: input.inputSnapshotHash ?? null,
    scoreSnapshot: input.scoreSnapshot ?? {},
    modelVersion: input.modelVersion ?? DEFAULT_MODEL_VERSION,
    promptVersion: input.promptVersion ?? null,
    ruleVersion: input.ruleVersion ?? BRAIN_RULE_VERSION_DEFAULT,
    adminOnly: input.adminOnly ?? false,
    publicSafe: input.publicSafe ?? false,
    signalId: input.signalId ?? null,
    aiSignalLogId: input.aiSignalLogId ?? null,
    journalEntryId: input.journalEntryId ?? null,
    decisionPacketId: input.decisionPacketId ?? null,
    meta: input.meta ?? {},
  };

  await q(
    `INSERT INTO brain_events (
       event_id, workspace_id, symbol, asset_class, timeframe, event_type, ts,
       source, data_freshness, input_snapshot_hash, score_snapshot,
       model_version, prompt_version, rule_version,
       admin_only, public_safe,
       signal_id, ai_signal_log_id, journal_entry_id, decision_packet_id,
       meta
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,
       $8,$9,$10,$11,
       $12,$13,$14,
       $15,$16,
       $17,$18,$19,$20,
       $21
     )`,
    [
      event.eventId,
      event.workspaceId,
      event.symbol,
      event.assetClass,
      event.timeframe,
      event.eventType,
      event.ts,
      event.source,
      event.dataFreshness,
      event.inputSnapshotHash,
      JSON.stringify(event.scoreSnapshot),
      event.modelVersion,
      event.promptVersion,
      event.ruleVersion,
      event.adminOnly,
      event.publicSafe,
      event.signalId,
      event.aiSignalLogId,
      event.journalEntryId,
      event.decisionPacketId,
      JSON.stringify(event.meta),
    ],
  );

  return event;
}

/**
 * Strip admin-only fields from an event before exposing to public surfaces.
 * Use when a public endpoint needs to surface generic event metadata.
 */
export function publicSafeEventView(event: BrainEvent): Partial<BrainEvent> | null {
  if (event.adminOnly) return null;
  if (!event.publicSafe) return null;
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    symbol: event.symbol,
    assetClass: event.assetClass,
    timeframe: event.timeframe,
    ts: event.ts,
    source: event.source,
    dataFreshness: event.dataFreshness,
    publicSafe: true,
  };
}
