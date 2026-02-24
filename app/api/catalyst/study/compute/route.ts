/**
 * POST /api/catalyst/study/compute?limit=5
 *
 * Background cron endpoint that pre-computes catalyst event studies
 * with full Alpha Vantage price data. Iterates through tickers
 * with the most catalyst events and computes studies for each
 * unique subtype.
 *
 * Protected by CRON_SECRET — only callable by Render cron jobs.
 *
 * Two modes:
 *  - Regular (limit=5):   Every 30 min, fills in a few studies
 *  - Overnight (limit=50): After market close, bulk backfill
 *
 * Rate-limit aware: 850ms delay between studies keeps us well
 * within Alpha Vantage Premium 75 calls/min limit. Each TICKER
 * cohort study uses ~2 AV calls (daily cached per ticker +
 * intraday per event). MARKET cohort studies are skipped during
 * regular runs (deferred to overnight).
 */

import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { getOrComputeStudy } from '@/lib/catalyst/eventStudy';
import { CatalystSubtype, type StudyCohort } from '@/lib/catalyst/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

const AUTO_COHORT_THRESHOLD = 10;
const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 100;
const DELAY_BETWEEN_STUDIES_MS = 1500; // 1.5s between studies (was 2s)
const PER_STUDY_TIMEOUT_MS = 60_000;   // 60s max per individual study
const WALL_CLOCK_LIMIT_MS = 240_000;   // 4 min hard stop (leaves buffer for response)

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/** Run a promise with an AbortController-style timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
    promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // ── Auth ───────────────────────────────────────────────────────
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = req.headers.get('x-cron-secret');
    const authHeader = req.headers.get('authorization');

    if (!cronSecret) {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }
    {
      const validHeader = headerSecret === cronSecret;
      const validBearer = authHeader === `Bearer ${cronSecret}`;
      if (!validHeader && !validBearer) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // ── Parse params ──────────────────────────────────────────────
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    // ── Targeted compute: specific ticker+subtype (triggered by inline route) ──
    const targetTicker = searchParams.get('ticker')?.toUpperCase().trim();
    const targetSubtype = searchParams.get('subtype') as CatalystSubtype | null;
    const targetCohort = searchParams.get('cohort') as StudyCohort | null;
    const targetLookback = parseInt(searchParams.get('lookback') || '1825', 10);

    if (targetTicker && targetSubtype) {
      // Compute a single specific study — triggered by inline study route
      const cohort: StudyCohort = targetCohort || 'MARKET';
      console.log(`[CatalystCron] Targeted compute: ${targetTicker}/${targetSubtype} (${cohort})`);

      const studyStart = Date.now();
      const result = await getOrComputeStudy({
        ticker: targetTicker,
        subtype: targetSubtype,
        lookbackDays: targetLookback,
        cohort,
      }, true);

      const duration = Date.now() - studyStart;
      return NextResponse.json({
        message: `Targeted study computed in ${(duration / 1000).toFixed(1)}s`,
        computed: 1,
        results: [{
          ticker: targetTicker,
          subtype: targetSubtype,
          cohort,
          sampleN: result.study.sampleN,
          durationMs: duration,
        }],
      });
    }

    // ── Find top ticker+subtype combos needing computation ────────
    const lookbackDays = 1825; // 5 years default
    const cutoff = new Date(Date.now() - lookbackDays * 86_400_000);

    const combos = await q(
      `SELECT ce.ticker, ce.catalyst_subtype, COUNT(*) as cnt
       FROM catalyst_events ce
       WHERE ce.event_timestamp_utc >= $1
       GROUP BY ce.ticker, ce.catalyst_subtype
       HAVING COUNT(*) >= 2
       ORDER BY COUNT(*) DESC
       LIMIT 500`,
      [cutoff]
    );

    if (!combos || combos.length === 0) {
      return NextResponse.json({ message: 'No ticker/subtype combos to process', computed: 0 });
    }

    // Skip SEC_10K_10Q — MARKET cohort studies are too expensive (15-30 AV calls per study)
    const eligibleCombos = combos.filter((row: any) => row.catalyst_subtype !== 'SEC_10K_10Q');

    // Filter out combos that already have a fresh cached study
    const staleThresholdMs = 24 * 3600 * 1000; // 24 hours — matches eventStudy.ts cache TTL
    const needsCompute: { ticker: string; subtype: CatalystSubtype; cohort: StudyCohort; count: number }[] = [];

    for (const row of eligibleCombos) {
      if (needsCompute.length >= limit * 2) break; // Check extra to find enough stale ones

      try {
        const cached = await q(
          `SELECT computed_at FROM catalyst_event_studies
           WHERE ticker = $1 AND catalyst_subtype = $2 AND lookback_days = $3
           LIMIT 1`,
          [row.ticker, row.catalyst_subtype, lookbackDays]
        );

        const isFresh = cached?.[0]?.computed_at &&
          (Date.now() - new Date(cached[0].computed_at).getTime()) < staleThresholdMs;

        if (!isFresh) {
          const count = parseInt(row.cnt, 10);
          const cohort: StudyCohort = count >= AUTO_COHORT_THRESHOLD ? 'TICKER' : 'MARKET';
          needsCompute.push({
            ticker: row.ticker,
            subtype: row.catalyst_subtype as CatalystSubtype,
            cohort,
            count,
          });
        }
      } catch (err) {
        // Table may not exist — treat as needing compute
        const count = parseInt(row.cnt, 10);
        const cohort: StudyCohort = count >= AUTO_COHORT_THRESHOLD ? 'TICKER' : 'MARKET';
        needsCompute.push({
          ticker: row.ticker,
          subtype: row.catalyst_subtype as CatalystSubtype,
          cohort,
          count,
        });
      }
    }

    // ── Compute studies sequentially with rate-limit delays ───────
    const results: { ticker: string; subtype: string; cohort: string; sampleN: number; durationMs: number; error?: string }[] = [];
    let computed = 0;

    for (const item of needsCompute.slice(0, limit)) {
      // Guard: stop if we're approaching the wall-clock limit
      if (Date.now() - startTime > WALL_CLOCK_LIMIT_MS) {
        console.log(`[CatalystCron] Approaching timeout after ${computed} studies, stopping.`);
        break;
      }

      const studyStart = Date.now();
      try {
        console.log(`[CatalystCron] Computing study: ${item.ticker} / ${item.subtype} (${item.cohort}, n=${item.count})`);

        const result = await withTimeout(
          getOrComputeStudy({
            ticker: item.ticker,
            subtype: item.subtype,
            lookbackDays,
            cohort: item.cohort,
          }, true), // fullCompute = true → runs AV calls and caches
          PER_STUDY_TIMEOUT_MS,
          `${item.ticker}/${item.subtype}`
        );

        const duration = Date.now() - studyStart;
        results.push({
          ticker: item.ticker,
          subtype: item.subtype,
          cohort: item.cohort,
          sampleN: result.study.sampleN,
          durationMs: duration,
        });
        computed++;
        console.log(`[CatalystCron] ✓ ${item.ticker}/${item.subtype}: n=${result.study.sampleN}, Q${result.study.dataQuality.score}, ${duration}ms`);
      } catch (err: any) {
        console.error(`[CatalystCron] ✗ ${item.ticker}/${item.subtype}:`, err.message);
        results.push({
          ticker: item.ticker,
          subtype: item.subtype,
          cohort: item.cohort,
          sampleN: 0,
          durationMs: Date.now() - studyStart,
          error: err.message,
        });
      }

      // Rate limit delay between studies
      if (computed < limit) {
        await sleep(DELAY_BETWEEN_STUDIES_MS);
      }
    }

    const totalDuration = Date.now() - startTime;
    return NextResponse.json({
      message: `Computed ${computed} catalyst studies in ${(totalDuration / 1000).toFixed(1)}s`,
      computed,
      pending: Math.max(0, needsCompute.length - limit),
      totalDurationMs: totalDuration,
      results,
    });
  } catch (error: any) {
    console.error('[CatalystCron] Fatal error:', error);
    // Return 200 with error details — prevents cron exit-22 for transient failures
    return NextResponse.json({ error: 'Cron job failed', detail: error.message });
  }
}
