import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { verifyCronAuth } from '@/lib/adminAuth';
import { backfillTradeOutcomes, ingestTradeOutcome } from '@/lib/intelligence/ingestOutcome';

/**
 * POST /api/intelligence/ingest-outcomes
 *
 * Two modes:
 *   { action: "backfill" }                 — recompute all outcomes for workspace
 *   { action: "single", journalEntryId: N } — ingest one closed trade
 *
 * Auth: user session OR cron secret (for scheduled backfill jobs).
 */
export async function POST(req: NextRequest) {
  // Auth: session or cron
  const session = await getSessionFromCookie();
  const isCron = verifyCronAuth(req);

  if (!session?.workspaceId && !isCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { action?: string; journalEntryId?: number; workspaceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Cron can specify workspaceId; user gets theirs from session
  const workspaceId = session?.workspaceId ?? (isCron ? body.workspaceId : null);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
  }

  try {
    if (body.action === 'single') {
      const entryId = Number(body.journalEntryId);
      if (!Number.isInteger(entryId) || entryId <= 0) {
        return NextResponse.json({ error: 'Invalid journalEntryId' }, { status: 400 });
      }
      const result = await ingestTradeOutcome(workspaceId, entryId);
      return NextResponse.json(result);
    }

    // Default: backfill
    const result = await backfillTradeOutcomes(workspaceId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('relation "trade_outcomes" does not exist')) {
      return NextResponse.json({
        error: 'trade_outcomes table not yet created — run migration 051',
      }, { status: 503 });
    }
    console.error('[ingest-outcomes] Error:', message);
    return NextResponse.json({ error: 'Ingestion failed' }, { status: 500 });
  }
}
