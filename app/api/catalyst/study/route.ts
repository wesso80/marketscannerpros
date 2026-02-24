/**
 * GET /api/catalyst/study?ticker=XYZ&subtype=SEC_8K_LEADERSHIP&lookback=1825&cohort=auto
 *
 * Computes (or returns cached) an event study for the given
 * ticker + catalyst subtype. Returns full distribution stats,
 * data quality, and member event list.
 *
 * Fail-safe: if computation errors, returns a valid "pending" response
 * instead of a 500 so the UI can show a meaningful state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { getOrComputeStudy, computeDistribution } from '@/lib/catalyst/eventStudy';
import { CatalystSubtype, type StudyCohort, type EventStudyResult } from '@/lib/catalyst/types';

export const runtime = 'nodejs';
export const maxDuration = 30; // Fast: returns cache or DB-only stub

const AUTO_COHORT_THRESHOLD = 10;
const BUILD_VERSION = '2026-02-24T09:00:00Z'; // v2: fast-path + background compute

/**
 * Fire-and-forget: POST to the compute endpoint for a specific ticker+subtype.
 * On Render (persistent Node.js process), this runs in the background
 * after the response is returned. Errors are swallowed silently.
 */
function triggerBackgroundCompute(ticker: string, subtype: string, cohort: string, lookbackDays: number) {
  const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.NEXT_PUBLIC_BASE_URL || '';
  if (!baseUrl) return;

  const url = `${baseUrl}/api/catalyst/study/compute?ticker=${encodeURIComponent(ticker)}&subtype=${encodeURIComponent(subtype)}&cohort=${cohort}&lookback=${lookbackDays}&limit=1`;
  const cronSecret = process.env.CRON_SECRET || '';

  // Fire-and-forget — don't await
  fetch(url, {
    method: 'POST',
    headers: {
      'x-cron-secret': cronSecret,
      'x-trigger': 'inline-study',
    },
  }).catch(err => {
    console.warn('[CatalystStudy] Background compute trigger failed:', err.message);
  });
}

/** Return a minimal valid study result when computation fails */
function pendingStudy(ticker: string, subtype: CatalystSubtype, cohort: StudyCohort, lookbackDays: number, reason: string): EventStudyResult {
  const emptyDist = computeDistribution([]);
  return {
    ticker,
    catalystSubtype: subtype,
    cohort,
    lookbackDays,
    sampleN: 0,
    computedAt: new Date(),
    horizons: {
      close_to_open: emptyDist,
      open_to_close: emptyDist,
      day1: emptyDist,
      day2: emptyDist,
      day5: emptyDist,
    },
    intradayPath: null,
    dataQuality: {
      score: 0,
      sampleN: 0,
      percentMissingBars: 0,
      timestampConfidence: 0,
      confoundedCount: 0,
      notes: [`COMPUTATION_ERROR: ${reason}. Background job will retry.`],
    },
    memberEvents: [],
  };
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get('ticker')?.toUpperCase().trim();
  const subtypeParam = searchParams.get('subtype') as CatalystSubtype | null;
  const lookbackDays = Math.min(Number(searchParams.get('lookback')) || 1825, 3650);
  const cohortParam = (searchParams.get('cohort') || 'auto') as 'auto' | StudyCohort;

  if (!ticker) {
    return NextResponse.json({ error: 'ticker query parameter is required' }, { status: 400 });
  }
  if (!subtypeParam || !Object.values(CatalystSubtype).includes(subtypeParam)) {
    return NextResponse.json({
      error: 'subtype query parameter is required and must be a valid CatalystSubtype',
      validSubtypes: Object.values(CatalystSubtype),
    }, { status: 400 });
  }

  // ── Determine cohort (fail-safe: default to MARKET) ───────────
  let cohort: StudyCohort = 'MARKET';
  try {
    if (cohortParam === 'auto') {
      const cutoff = new Date(Date.now() - lookbackDays * 86_400_000);
      const countRows = await q(
        `SELECT COUNT(*) as cnt FROM catalyst_events
         WHERE ticker = $1 AND catalyst_subtype = $2 AND event_timestamp_utc >= $3`,
        [ticker, subtypeParam, cutoff]
      );
      const tickerCount = parseInt(countRows?.[0]?.cnt || '0', 10);
      cohort = tickerCount >= AUTO_COHORT_THRESHOLD ? 'TICKER' : 'MARKET';
    } else {
      cohort = cohortParam;
    }
  } catch (err) {
    console.error('[CatalystStudy] Cohort detection failed, defaulting to MARKET:', (err as Error).message);
  }

  // ── Retrieve cached study or return fast DB-only stub ────────
  // Full AV-backed compute now runs ONLY in the background cron.
  // Inline requests return cached or pending results instantly.
  let study: EventStudyResult;
  let cached = false;
  let cacheAge: number | null = null;
  let isPending = true;
  const warnings: string[] = [];

  try {
    const result = await getOrComputeStudy({
      ticker,
      subtype: subtypeParam,
      lookbackDays,
      cohort,
    }, false);  // fullCompute=false — instant: return cache or DB-only stub
    study = result.study;
    cached = result.cached;
    cacheAge = result.cacheAge;
    isPending = result.pendingPriceData;

    // If pending, trigger background compute for this specific study
    if (isPending) {
      triggerBackgroundCompute(ticker, subtypeParam, cohort, lookbackDays);
    }
  } catch (err) {
    console.error('[CatalystStudy] Computation failed, returning pending stub:', (err as Error).message, (err as Error).stack);
    study = pendingStudy(ticker, subtypeParam, cohort, lookbackDays, (err as Error).message);
    warnings.push(`COMPUTATION_ERROR: Study could not be computed. Background job will retry.`);
  }

  // ── Quality warnings ──────────────────────────────────────────
  if (study.sampleN < 5) {
    warnings.push('LOW_SAMPLE_SIZE: Fewer than 5 events. Results should be treated with low confidence.');
  }
  if (study.dataQuality.percentMissingBars > 0.2) {
    warnings.push('HIGH_MISSING_DATA: Significant price data gaps may affect accuracy.');
  }
  if (cohortParam === 'auto' && cohort === 'MARKET') {
    warnings.push(`AUTO_COHORT_FALLBACK: Ticker-specific sample too small. Using MARKET cohort.`);
  }

  return NextResponse.json({
    ticker,
    subtype: subtypeParam,
    cohort,
    lookbackDays,
    cached,
    cacheAge,
    pendingPriceData: isPending,
    warnings,
    study,
    _v: BUILD_VERSION,
  });
}
