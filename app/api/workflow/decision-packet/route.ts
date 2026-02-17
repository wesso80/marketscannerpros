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

    const tagNeedle = `dp_${id}`;
    const noteNeedle = `%Decision Packet: ${id}%`;

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
             event_data->'payload'->>'decision_packet_id' = $2
             OR event_data->'payload'->'setup'->>'decision_packet_id' = $2
             OR event_data->'payload'->'links'->>'decision_packet_id' = $2
             OR event_data->'payload'->'trade_plan'->'setup'->>'decision_packet_id' = $2
             OR event_data->'payload'->'trade_plan'->'links'->>'decision_packet_id' = $2
             OR event_data->'payload'->'decision_packet'->>'id' = $2
             OR event_data->'entity'->>'entity_id' = $2
           )
         ORDER BY created_at DESC
         LIMIT 200`,
        [session.workspaceId, id]
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
             smart_alert_context->>'decisionPacketId' = $2
             OR smart_alert_context->>'decision_packet_id' = $2
           )
         ORDER BY created_at DESC
         LIMIT 100`,
        [session.workspaceId, id]
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
             COALESCE(tags, ARRAY[]::text[]) @> ARRAY[$2]::text[]
             OR notes ILIKE $3
           )
         ORDER BY created_at DESC
         LIMIT 100`,
        [session.workspaceId, tagNeedle, noteNeedle]
      ),
    ]);

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
      decisionPacketId: id,
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