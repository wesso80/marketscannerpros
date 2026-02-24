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
export const maxDuration = 60; // Allow inline compute up to 25s + overhead

const AUTO_COHORT_THRESHOLD = 10;
const BUILD_VERSION = '2026-02-24T16:00:00Z'; // v3: inline compute — no fire-and-forget
const INLINE_COMPUTE_TIMEOUT_MS = 25_000; // 25s max for inline full compute

/**
 * Inline background compute with dedup.
 * Instead of fire-and-forget HTTP POST (which fails when RENDER_EXTERNAL_URL
 * is misconfigured), compute directly in a detached promise.
 */
const DEDUP_WINDOW_MS = 120_000; // 2 minutes
const _pendingComputes = new Map<string, number>();

function startInlineCompute(ticker: string, subtype: CatalystSubtype, cohort: StudyCohort, lookbackDays: number) {
  const key = `${ticker}:${subtype}:${cohort}:${lookbackDays}`;
  const now = Date.now();
  const last = _pendingComputes.get(key);
  if (last && (now - last) < DEDUP_WINDOW_MS) return; // Already computing
  _pendingComputes.set(key, now);

  // Housekeep
  if (_pendingComputes.size > 200) {
    for (const [k, ts] of _pendingComputes) {
      if ((now - ts) > DEDUP_WINDOW_MS) _pendingComputes.delete(k);
    }
  }

  // Fire-and-forget direct function call — no HTTP needed
  getOrComputeStudy({ ticker, subtype, lookbackDays, cohort }, true)
    .then(r => console.log(`[CatalystStudy] Background compute done: ${ticker}/${subtype} n=${r.study.sampleN}`))
    .catch(err => console.warn(`[CatalystStudy] Background compute failed: ${ticker}/${subtype}:`, err.message));
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

  // ── v3: Inline compute with timeout ──────────────────────────
  // 1. Try cache first (instant).
  // 2. On miss → full compute inline with 25s timeout.
  // 3. If timeout → return DB-only stub and compute in background.
  let study: EventStudyResult;
  let cached = false;
  let cacheAge: number | null = null;
  let isPending = true;
  const warnings: string[] = [];

  const opts = { ticker, subtype: subtypeParam, lookbackDays, cohort };

  try {
    // Fast path: check cache only (no AV calls)
    const fastResult = await getOrComputeStudy(opts, false);

    if (fastResult.cached && !fastResult.pendingPriceData) {
      // Cache HIT with real data — return instantly
      study = fastResult.study;
      cached = fastResult.cached;
      cacheAge = fastResult.cacheAge;
      isPending = false;
    } else {
      // Cache MISS or stale — try inline full compute with timeout
      const fullResult = await Promise.race([
        getOrComputeStudy(opts, true),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), INLINE_COMPUTE_TIMEOUT_MS)),
      ]);

      if (fullResult) {
        // Inline compute completed within timeout
        study = fullResult.study;
        cached = fullResult.cached;
        cacheAge = fullResult.cacheAge;
        isPending = fullResult.pendingPriceData;
      } else {
        // Timeout — return DB-only stub and compute in background
        study = fastResult.study;
        cached = false;
        cacheAge = null;
        isPending = true;
        warnings.push('INLINE_COMPUTE_TIMEOUT: Study is being computed in the background. Results will refresh automatically.');
        startInlineCompute(ticker, subtypeParam, cohort, lookbackDays);
      }
    }

    // If cache returned an empty study, kick off background recompute
    if (cached && study.sampleN === 0) {
      startInlineCompute(ticker, subtypeParam, cohort, lookbackDays);
    }
  } catch (err) {
    console.error('[CatalystStudy] Computation failed, returning pending stub:', (err as Error).message, (err as Error).stack);
    study = pendingStudy(ticker, subtypeParam, cohort, lookbackDays, (err as Error).message);
    warnings.push(`COMPUTATION_ERROR: Study could not be computed. Background job will retry.`);
    startInlineCompute(ticker, subtypeParam, cohort, lookbackDays);
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
