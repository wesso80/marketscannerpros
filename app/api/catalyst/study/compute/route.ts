/**
 * POST /api/catalyst/study/compute
 *
 * Background cron endpoint that pre-computes catalyst event studies
 * with full Alpha Vantage price data. Iterates through tickers
 * with the most catalyst events and computes studies for each
 * unique subtype.
 *
 * Protected by CRON_SECRET — only callable by Render cron jobs.
 *
 * Rate-limit aware: processes ~5 tickers per run (each ticker/subtype
 * study uses ~6–60 AV calls depending on cohort). Runs every 30 min
 * so entire universe is covered progressively.
 */

import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { getOrComputeStudy } from '@/lib/catalyst/eventStudy';
import { CatalystSubtype, type StudyCohort } from '@/lib/catalyst/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

const AUTO_COHORT_THRESHOLD = 10;
const MAX_STUDIES_PER_RUN = 5; // Limit per invocation to stay within AV rate limits

export async function POST(req: NextRequest) {
  try {
    // ── Auth ───────────────────────────────────────────────────────
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = req.headers.get('x-cron-secret');
    const authHeader = req.headers.get('authorization');

    if (cronSecret) {
      const validHeader = headerSecret === cronSecret;
      const validBearer = authHeader === `Bearer ${cronSecret}`;
      if (!validHeader && !validBearer) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // ── Find top ticker+subtype combos needing computation ────────
    // Priority: tickers with most events that don't have a fresh cached study
    const lookbackDays = 1825; // 5 years default
    const cutoff = new Date(Date.now() - lookbackDays * 86_400_000);

    const combos = await q(
      `SELECT ce.ticker, ce.catalyst_subtype, COUNT(*) as cnt
       FROM catalyst_events ce
       WHERE ce.event_timestamp_utc >= $1
       GROUP BY ce.ticker, ce.catalyst_subtype
       HAVING COUNT(*) >= 3
       ORDER BY COUNT(*) DESC
       LIMIT 100`,
      [cutoff]
    );

    if (!combos || combos.length === 0) {
      return NextResponse.json({ message: 'No ticker/subtype combos to process', computed: 0 });
    }

    // Filter out combos that already have a fresh cached study
    const staleThresholdMs = 6 * 3600 * 1000; // 6 hours
    const needsCompute: { ticker: string; subtype: CatalystSubtype; cohort: StudyCohort; count: number }[] = [];

    for (const row of combos) {
      if (needsCompute.length >= MAX_STUDIES_PER_RUN * 3) break; // Check a few extra to find enough stale ones

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
    }

    // ── Compute studies (sequentially to respect AV rate limits) ──
    const results: { ticker: string; subtype: string; cohort: string; sampleN: number; error?: string }[] = [];
    let computed = 0;

    for (const item of needsCompute.slice(0, MAX_STUDIES_PER_RUN)) {
      try {
        console.log(`[CatalystCron] Computing study: ${item.ticker} / ${item.subtype} (${item.cohort}, n=${item.count})`);

        const result = await getOrComputeStudy({
          ticker: item.ticker,
          subtype: item.subtype,
          lookbackDays,
          cohort: item.cohort,
        }, true); // fullCompute = true → runs AV calls and caches

        results.push({
          ticker: item.ticker,
          subtype: item.subtype,
          cohort: item.cohort,
          sampleN: result.study.sampleN,
        });
        computed++;
        console.log(`[CatalystCron] ✓ ${item.ticker}/${item.subtype}: n=${result.study.sampleN}, Q${result.study.dataQuality.score}`);
      } catch (err: any) {
        console.error(`[CatalystCron] ✗ ${item.ticker}/${item.subtype}:`, err.message);
        results.push({
          ticker: item.ticker,
          subtype: item.subtype,
          cohort: item.cohort,
          sampleN: 0,
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      message: `Computed ${computed} catalyst studies`,
      computed,
      pending: Math.max(0, needsCompute.length - MAX_STUDIES_PER_RUN),
      results,
    });
  } catch (error: any) {
    console.error('[CatalystCron] Fatal error:', error);
    return NextResponse.json({ error: 'Cron job failed', detail: error.message }, { status: 500 });
  }
}
