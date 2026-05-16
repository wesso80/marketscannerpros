/**
 * lib/admin/changeEvents.ts — diff engine for material deltas between
 * successive admin snapshots. Writes durable rows to admin_change_events.
 *
 * Use:
 *   const events = diffAndPersist({
 *     workspaceId, scope: 'symbol', scopeKey: 'AAPL',
 *     packetId, sourceRoute, evidenceQuality,
 *     prev: prevPayload, next: nextPayload,
 *     fields: ['opportunity_score', 'trend', 'gamma_wall'],
 *   });
 */

import { q } from '@/lib/db';

export interface ChangeEventInput {
  workspaceId: string;
  scope: 'symbol' | 'sector' | 'macro' | 'portfolio' | 'regime';
  scopeKey: string;
  packetId?: string | null;
  sourceRoute: string;
  evidenceQuality?: number | null;
  prev: Record<string, unknown> | null;
  next: Record<string, unknown> | null;
  /** Field names to inspect (dot-paths supported, e.g. 'gamma.wall'). */
  fields: string[];
}

export interface PersistedChangeEvent {
  field: string;
  prevValue: unknown;
  nextValue: unknown;
  magnitude: number;          // 0..100
  direction: 'up' | 'down' | 'flip' | 'new' | 'gone';
  reason: string;
}

function read(obj: Record<string, unknown> | null, path: string): unknown {
  if (!obj) return undefined;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function magnitudeOf(prev: unknown, next: unknown): number {
  if (isNum(prev) && isNum(next)) {
    const denom = Math.max(1, Math.abs(prev));
    return Math.min(100, Math.round((Math.abs(next - prev) / denom) * 100));
  }
  if (prev === undefined && next !== undefined) return 50;
  if (prev !== undefined && next === undefined) return 50;
  if (prev !== next) return 35;
  return 0;
}

function directionOf(prev: unknown, next: unknown): 'up' | 'down' | 'flip' | 'new' | 'gone' {
  if (prev === undefined || prev === null) return 'new';
  if (next === undefined || next === null) return 'gone';
  if (isNum(prev) && isNum(next)) {
    if (next > prev) return 'up';
    if (next < prev) return 'down';
    return 'flip';
  }
  return 'flip';
}

export function diffEvents(input: ChangeEventInput): PersistedChangeEvent[] {
  const out: PersistedChangeEvent[] = [];
  for (const field of input.fields) {
    const prev = read(input.prev, field);
    const next = read(input.next, field);
    // skip if both are absent or identical (deep equal for primitives only)
    if (prev === next) continue;
    if (prev === undefined && next === undefined) continue;
    const mag = magnitudeOf(prev, next);
    if (mag < 1) continue;
    const dir = directionOf(prev, next);
    out.push({
      field,
      prevValue: prev ?? null,
      nextValue: next ?? null,
      magnitude: mag,
      direction: dir,
      reason: `${field}: ${JSON.stringify(prev) ?? 'null'} → ${JSON.stringify(next) ?? 'null'}`,
    });
  }
  return out;
}

export async function persistChangeEvents(input: ChangeEventInput, events: PersistedChangeEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  for (const ev of events) {
    await q(
      `INSERT INTO admin_change_events
         (workspace_id, scope, scope_key, field, prev_value, next_value,
          magnitude, direction, reason, packet_id, source_route, evidence_quality)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        input.workspaceId, input.scope, input.scopeKey, ev.field,
        JSON.stringify(ev.prevValue), JSON.stringify(ev.nextValue),
        ev.magnitude, ev.direction, ev.reason,
        input.packetId ?? null, input.sourceRoute, input.evidenceQuality ?? null,
      ],
    );
  }
  return events.length;
}

export async function diffAndPersist(input: ChangeEventInput): Promise<PersistedChangeEvent[]> {
  const events = diffEvents(input);
  await persistChangeEvents(input, events);
  return events;
}

export async function readRecentChangeEvents(opts: {
  workspaceId: string;
  scope?: 'symbol' | 'sector' | 'macro' | 'portfolio' | 'regime';
  scopeKey?: string;
  sinceISO?: string;
  limit?: number;
}): Promise<Array<{
  id: number;
  scope: string;
  scopeKey: string;
  field: string;
  prevValue: unknown;
  nextValue: unknown;
  magnitude: number;
  direction: string;
  reason: string;
  packetId: string | null;
  sourceRoute: string;
  observedAt: string;
}>> {
  const where: string[] = ['workspace_id = $1'];
  const params: unknown[] = [opts.workspaceId];
  let p = 2;
  if (opts.scope) { where.push(`scope = $${p++}`); params.push(opts.scope); }
  if (opts.scopeKey) { where.push(`scope_key = $${p++}`); params.push(opts.scopeKey); }
  if (opts.sinceISO) { where.push(`observed_at >= $${p++}`); params.push(new Date(opts.sinceISO)); }
  params.push(opts.limit ?? 200);
  const rows = await q<{
    id: number; scope: string; scope_key: string; field: string;
    prev_value: unknown; next_value: unknown; magnitude: string; direction: string;
    reason: string; packet_id: string | null; source_route: string; observed_at: Date;
  }>(
    `SELECT id, scope, scope_key, field, prev_value, next_value, magnitude, direction,
            reason, packet_id, source_route, observed_at
       FROM admin_change_events
      WHERE ${where.join(' AND ')}
      ORDER BY observed_at DESC
      LIMIT $${p}`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    scopeKey: r.scope_key,
    field: r.field,
    prevValue: r.prev_value,
    nextValue: r.next_value,
    magnitude: Number(r.magnitude),
    direction: r.direction,
    reason: r.reason,
    packetId: r.packet_id,
    sourceRoute: r.source_route,
    observedAt: r.observed_at.toISOString(),
  }));
}
