/**
 * POST /api/catalyst/ingest
 *
 * Internal/cron endpoint to trigger SEC + news ingestion.
 * Accepts either session auth (manual trigger from admin UI)
 * or x-cron-secret header (Render cron job).
 * Returns counts of ingested/skipped/errored events.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { verifyCronAuth } from '@/lib/adminAuth';
import { ingestSecFilings } from '@/lib/catalyst/secIngestion';
import { ingestNews, setNewsProvider } from '@/lib/catalyst/newsProvider';
import { AlphaVantageNewsProvider } from '@/lib/catalyst/alphaVantageNewsProvider';
import { alertCronFailure } from '@/lib/opsAlerting';
import type { IngestionResult } from '@/lib/catalyst/types';

// Register the live news provider
setNewsProvider(new AlphaVantageNewsProvider());

export async function POST(req: NextRequest) {
  try {
    // Allow cron jobs OR authenticated sessions
    const isCron = verifyCronAuth(req);
    const session = isCron ? null : await getSessionFromCookie();
    if (!isCron && !session?.workspaceId) {
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
    alertCronFailure('catalyst-ingest', error);
    return NextResponse.json({ error: 'Ingestion failed', detail: error.message }, { status: 500 });
  }
}
