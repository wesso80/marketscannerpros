// =====================================================
// MSP AI EVENTS API - Log telemetry events
// POST /api/ai/events
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import type { AIEvent } from '@/lib/ai/types';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { events } = body as { events: AIEvent[] };

    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'No events provided' }, { status: 400 });
    }

    // Batch insert events (limit to 50 per request)
    const eventsToInsert = events.slice(0, 50);
    
    // Generate session ID if not provided
    const sessionId = body.sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Build batch insert
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const event of eventsToInsert) {
      placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`);
      values.push(
        session.workspaceId,
        event.eventType,
        JSON.stringify(event.eventData || {}),
        JSON.stringify(event.pageContext || {}),
        sessionId
      );
      paramIndex += 5;
    }

    await q(
      `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context, session_id)
       VALUES ${placeholders.join(', ')}`,
      values
    );

    // Update user memory based on certain events (async, don't wait)
    updateUserMemoryFromEvents(session.workspaceId, eventsToInsert).catch(console.error);

    return NextResponse.json({ 
      success: true, 
      eventsLogged: eventsToInsert.length,
      sessionId 
    });

  } catch (error) {
    console.error('Error logging AI events:', error);
    return NextResponse.json({ error: 'Failed to log events' }, { status: 500 });
  }
}

// Background task to update user memory based on events
async function updateUserMemoryFromEvents(workspaceId: string, events: AIEvent[]) {
  try {
    for (const event of events) {
      // Track most used features
      if (event.eventType === 'page_view' && event.pageContext?.name) {
        await q(
          `UPDATE user_memory 
           SET most_used_features = (
             SELECT jsonb_agg(DISTINCT val)
             FROM (
               SELECT jsonb_array_elements_text(COALESCE(most_used_features, '[]'::jsonb)) AS val
               UNION SELECT $2
               LIMIT 20
             ) sub
           )
           WHERE workspace_id = $1`,
          [workspaceId, event.pageContext.name]
        );
      }

      // Track downvoted topics from thumbs_down
      if (event.eventType === 'thumbs_down' && event.eventData?.topic) {
        await q(
          `UPDATE user_memory 
           SET downvoted_topics = (
             SELECT jsonb_agg(DISTINCT val)
             FROM (
               SELECT jsonb_array_elements_text(COALESCE(downvoted_topics, '[]'::jsonb)) AS val
               UNION SELECT $2
               LIMIT 50
             ) sub
           )
           WHERE workspace_id = $1`,
          [workspaceId, event.eventData.topic]
        );
      }

      // Track common scan filters
      if (event.eventType === 'widget_interaction' && event.eventData?.filterName) {
        await q(
          `UPDATE user_memory 
           SET common_scan_filters = common_scan_filters || $2::jsonb
           WHERE workspace_id = $1`,
          [workspaceId, JSON.stringify({ [event.eventData.filterName as string]: event.eventData.filterValue })]
        );
      }
    }
  } catch (error) {
    console.error('Error updating user memory from events:', error);
  }
}
