/**
 * GET /api/catalyst/events?ticker=XYZ&days=30&subtype=SEC_8K_LEADERSHIP
 *
 * Returns recent catalyst events for a ticker with classification,
 * session labels, and confidence scores.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { CatalystSubtype } from '@/lib/catalyst/types';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('ticker')?.toUpperCase().trim();
    const days = Math.min(Number(searchParams.get('days')) || 30, 365);
    const subtype = searchParams.get('subtype') as CatalystSubtype | null;

    if (!ticker) {
      return NextResponse.json({ error: 'ticker query parameter is required' }, { status: 400 });
    }

    const cutoff = new Date(Date.now() - days * 86_400_000);

    let query = `
      SELECT id, ticker, source, headline, url,
             catalyst_type, catalyst_subtype,
             event_timestamp_utc, event_timestamp_et,
             session, anchor_timestamp_et,
             confidence, severity, classification_reason,
             created_at
      FROM catalyst_events
      WHERE ticker = $1 AND event_timestamp_utc >= $2
    `;
    const params: any[] = [ticker, cutoff];

    if (subtype && Object.values(CatalystSubtype).includes(subtype)) {
      query += ` AND catalyst_subtype = $3`;
      params.push(subtype);
    }

    query += ` ORDER BY event_timestamp_et DESC LIMIT 100`;

    const rows = await q(query, params);

    const events = (rows || []).map((row: any) => ({
      id: row.id,
      ticker: row.ticker,
      source: row.source,
      headline: row.headline,
      url: row.url,
      catalystType: row.catalyst_type,
      catalystSubtype: row.catalyst_subtype,
      eventTimestampUtc: row.event_timestamp_utc,
      eventTimestampEt: row.event_timestamp_et,
      session: row.session,
      anchorTimestampEt: row.anchor_timestamp_et,
      confidence: parseFloat(row.confidence),
      severity: row.severity,
      classificationReason: row.classification_reason,
      createdAt: row.created_at,
    }));

    return NextResponse.json({
      ticker,
      days,
      count: events.length,
      events,
    });
  } catch (error: any) {
    console.error('Catalyst events error:', error);
    return NextResponse.json({ error: 'Failed to fetch events', detail: error.message }, { status: 500 });
  }
}
