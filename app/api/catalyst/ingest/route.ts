/**
 * POST /api/catalyst/ingest
 *
 * Internal/admin endpoint to trigger SEC + news ingestion.
 * Returns counts of ingested/skipped/errored events.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { ingestSecFilings } from '@/lib/catalyst/secIngestion';
import { ingestNews } from '@/lib/catalyst/newsProvider';
import type { IngestionResult } from '@/lib/catalyst/types';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const lookbackDays = Number(body.lookbackDays) || 7;
    const lookbackHours = Number(body.lookbackHours) || 24;
    const tickers: string[] = Array.isArray(body.tickers) ? body.tickers : [];

    const results: IngestionResult[] = [];

    // SEC ingestion
    try {
      const sec = await ingestSecFilings(lookbackDays);
      results.push(sec);
    } catch (err: any) {
      results.push({
        source: 'SEC_EDGAR',
        ingested: 0,
        skipped: 0,
        errors: [`SEC ingestion failed: ${err.message}`],
        durationMs: 0,
      });
    }

    // News ingestion
    try {
      const news = await ingestNews(tickers, lookbackHours);
      results.push(news);
    } catch (err: any) {
      results.push({
        source: 'NEWS',
        ingested: 0,
        skipped: 0,
        errors: [`News ingestion failed: ${err.message}`],
        durationMs: 0,
      });
    }

    const totalIngested = results.reduce((s, r) => s + r.ingested, 0);
    const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

    return NextResponse.json({
      success: true,
      totalIngested,
      totalSkipped,
      totalErrors,
      results,
    });
  } catch (error: any) {
    console.error('Catalyst ingest error:', error);
    return NextResponse.json({ error: 'Ingestion failed', detail: error.message }, { status: 500 });
  }
}
