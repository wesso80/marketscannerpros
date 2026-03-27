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
import { postToDiscord, buildResearchEmbed } from '@/lib/discord-bridge';
import type { IngestionResult } from '@/lib/catalyst/types';

// Register the live news provider
setNewsProvider(new AlphaVantageNewsProvider());

export const runtime = 'nodejs';
export const maxDuration = 120;

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

    // Run SEC + News ingestion in parallel
    const [secResult, newsResult] = await Promise.allSettled([
      ingestSecFilings(lookbackDays),
      ingestNews(tickers, lookbackHours),
    ]);

    if (secResult.status === 'fulfilled') {
      results.push(secResult.value);
    } else {
      results.push({
        source: 'SEC_EDGAR',
        ingested: 0,
        skipped: 0,
        errors: [`SEC ingestion failed: ${secResult.reason?.message ?? secResult.reason}`],
        durationMs: 0,
      });
    }

    if (newsResult.status === 'fulfilled') {
      results.push(newsResult.value);
    } else {
      results.push({
        source: 'NEWS',
        ingested: 0,
        skipped: 0,
        errors: [`News ingestion failed: ${newsResult.reason?.message ?? newsResult.reason}`],
        durationMs: 0,
      });
    }

    const totalIngested = results.reduce((s, r) => s + r.ingested, 0);
    const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

    // Post catalyst summary to Discord research channel
    if (totalIngested > 0) {
      postToDiscord('research', buildResearchEmbed({
        title: `Catalyst Ingest: ${totalIngested} new events`,
        summary: results.map(r => `${r.source}: ${r.ingested} ingested`).join(' | '),
        impact: totalIngested >= 10 ? 'high' : totalIngested >= 3 ? 'medium' : 'low',
      })).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      totalIngested,
      totalSkipped,
      totalErrors,
      results,
    });
  } catch (error: any) {
    console.error('Catalyst ingest error:', error);
    alertCronFailure('catalyst-ingest', error?.message ?? String(error));
    return NextResponse.json({ error: 'Ingestion failed', detail: error.message }, { status: 500 });
  }
}
