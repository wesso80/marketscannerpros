import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

type TimelineItem = {
  source: 'ai_event' | 'alert' | 'journal';
  createdAt: string;
  type: string;
  id: string;
  symbol: string | null;
  workflowId: string | null;
  payload: Record<string, unknown>;
};

type PacketState = {
  packetId: string;
  fingerprint: string;
  status: string;
  symbol: string;
  market: string | null;
  workflowId: string | null;
  sourceEventCount: number;
  firstEventId: string | null;
  lastEventId: string | null;
  lastEventType: string | null;
  updatedAt: string;
  aliases: string[];
};

function toIso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return new Date(0).toISOString();
  return date.toISOString();
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = String(new URL(req.url).searchParams.get('id') || '').trim();
    if (!id || id.length < 6) {
      return NextResponse.json({ error: 'id query param (decision_packet_id) is required' }, { status: 400 });
    }

    const aliasRows = await q(
      `SELECT
         COALESCE(a.packet_id, d.packet_id) AS canonical_id,
         d.packet_id,
         d.fingerprint,
         d.status,
         d.symbol,
         d.market,
         d.workflow_id,
         d.source_event_count,
         d.first_event_id,
         d.last_event_id,
         d.last_event_type,
         d.updated_at,
         COALESCE(
           (
             SELECT ARRAY_AGG(alias_id ORDER BY alias_id)
             FROM decision_packet_aliases
             WHERE workspace_id = $1
               AND packet_id = d.packet_id
           ),
           ARRAY[]::text[]
         ) AS aliases
       FROM decision_packets d
       LEFT JOIN decision_packet_aliases a
         ON a.workspace_id = d.workspace_id
        AND a.alias_id = $2
       WHERE d.workspace_id = $1
         AND (
           d.packet_id = $2
           OR d.packet_id = a.packet_id
         )
       LIMIT 1`,
      [session.workspaceId, id]
    );

    const packetRow = aliasRows[0] as Record<string, unknown> | undefined;
    const canonicalId = String(packetRow?.canonical_id || packetRow?.packet_id || id);
    const allPacketIds = new Set<string>([id, canonicalId]);

    const aliases = Array.isArray(packetRow?.aliases)
      ? (packetRow?.aliases as unknown[]).map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    for (const alias of aliases) {
      allPacketIds.add(alias);
    }

    const packetIds = Array.from(allPacketIds);

    const tagNeedles = packetIds.map((packetId) => `dp_${packetId}`);
    const noteNeedles = packetIds.map((packetId) => `%Decision Packet: ${packetId}%`);

    const [eventRows, alertRows, journalRows] = await Promise.all([
      q(
        `SELECT
           COALESCE(event_data->>'event_id', CONCAT('db_', id::text)) AS item_id,
           event_type,
           created_at,
           COALESCE(
             event_data->'entity'->>'symbol',
             event_data->'payload'->>'symbol',
             event_data->'payload'->'trade_plan'->>'symbol'
           ) AS symbol,
           COALESCE(
             event_data->'correlation'->>'workflow_id',
             event_data->'payload'->>'workflow_id'
           ) AS workflow_id,
           event_data->'payload' AS payload
         FROM ai_events
         WHERE workspace_id = $1
           AND (
             event_data->'payload'->>'decision_packet_id' = ANY($2::text[])
             OR event_data->'payload'->'setup'->>'decision_packet_id' = ANY($2::text[])
             OR event_data->'payload'->'links'->>'decision_packet_id' = ANY($2::text[])
             OR event_data->'payload'->'trade_plan'->'setup'->>'decision_packet_id' = ANY($2::text[])
             OR event_data->'payload'->'trade_plan'->'links'->>'decision_packet_id' = ANY($2::text[])
             OR event_data->'payload'->'decision_packet'->>'id' = ANY($2::text[])
             OR event_data->'entity'->>'entity_id' = ANY($2::text[])
           )
         ORDER BY created_at DESC
         LIMIT 200`,
        [session.workspaceId, packetIds]
      ),
      q(
        `SELECT
           id::text AS item_id,
           created_at,
           UPPER(symbol) AS symbol,
           smart_alert_context->>'workflowId' AS workflow_id,
           smart_alert_context AS payload
         FROM alerts
         WHERE workspace_id = $1
           AND (
             smart_alert_context->>'decisionPacketId' = ANY($2::text[])
             OR smart_alert_context->>'decision_packet_id' = ANY($2::text[])
           )
         ORDER BY created_at DESC
         LIMIT 100`,
        [session.workspaceId, packetIds]
      ),
      q(
        `SELECT
           id::text AS item_id,
           created_at,
           UPPER(symbol) AS symbol,
           NULL::text AS workflow_id,
           jsonb_build_object(
             'strategy', strategy,
             'setup', setup,
             'outcome', outcome,
             'is_open', is_open,
             'tags', tags,
             'notes', notes
           ) AS payload
         FROM journal_entries
         WHERE workspace_id = $1
           AND (
             COALESCE(tags, ARRAY[]::text[]) && $2::text[]
             OR notes ILIKE ANY($3::text[])
           )
         ORDER BY created_at DESC
         LIMIT 100`,
        [session.workspaceId, tagNeedles, noteNeedles]
      ),
    ]);

    const packetState: PacketState | null = packetRow
      ? {
          packetId: String(packetRow.packet_id || canonicalId),
          fingerprint: String(packetRow.fingerprint || ''),
          status: String(packetRow.status || 'candidate'),
          symbol: String(packetRow.symbol || ''),
          market: packetRow.market ? String(packetRow.market) : null,
          workflowId: packetRow.workflow_id ? String(packetRow.workflow_id) : null,
          sourceEventCount: Number(packetRow.source_event_count || 0),
          firstEventId: packetRow.first_event_id ? String(packetRow.first_event_id) : null,
          lastEventId: packetRow.last_event_id ? String(packetRow.last_event_id) : null,
          lastEventType: packetRow.last_event_type ? String(packetRow.last_event_type) : null,
          updatedAt: toIso(packetRow.updated_at),
          aliases,
        }
      : null;

    const timeline: TimelineItem[] = [
      ...eventRows.map((row: any) => ({
        source: 'ai_event' as const,
        createdAt: toIso(row.created_at),
        type: String(row.event_type || 'event'),
        id: String(row.item_id || ''),
        symbol: row.symbol ? String(row.symbol) : null,
        workflowId: row.workflow_id ? String(row.workflow_id) : null,
        payload: (row.payload || {}) as Record<string, unknown>,
      })),
      ...alertRows.map((row: any) => ({
        source: 'alert' as const,
        createdAt: toIso(row.created_at),
        type: 'alert.created',
        id: String(row.item_id || ''),
        symbol: row.symbol ? String(row.symbol) : null,
        workflowId: row.workflow_id ? String(row.workflow_id) : null,
        payload: (row.payload || {}) as Record<string, unknown>,
      })),
      ...journalRows.map((row: any) => ({
        source: 'journal' as const,
        createdAt: toIso(row.created_at),
        type: 'journal.entry',
        id: String(row.item_id || ''),
        symbol: row.symbol ? String(row.symbol) : null,
        workflowId: row.workflow_id ? String(row.workflow_id) : null,
        payload: (row.payload || {}) as Record<string, unknown>,
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const symbols = Array.from(new Set(timeline.map((item) => item.symbol).filter(Boolean)));
    const workflowIds = Array.from(new Set(timeline.map((item) => item.workflowId).filter(Boolean)));

    return NextResponse.json({
      decisionPacketId: canonicalId,
      requestedId: id,
      packetIds,
      packetState,
      summary: {
        events: eventRows.length,
        alerts: alertRows.length,
        journalEntries: journalRows.length,
        totalItems: timeline.length,
        latestAt: timeline[0]?.createdAt || null,
        earliestAt: timeline[timeline.length - 1]?.createdAt || null,
        symbols,
        workflowIds,
      },
      timeline,
    });
  } catch (error) {
    console.error('Workflow decision-packet trace GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch decision packet trace' }, { status: 500 });
  }
}