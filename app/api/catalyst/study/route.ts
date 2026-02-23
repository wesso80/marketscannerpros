/**
 * GET /api/catalyst/study?ticker=XYZ&subtype=SEC_8K_LEADERSHIP&lookback=1825&cohort=auto
 *
 * Computes (or returns cached) an event study for the given
 * ticker + catalyst subtype. Returns full distribution stats,
 * data quality, and member event list.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { getOrComputeStudy } from '@/lib/catalyst/eventStudy';
import { CatalystSubtype, type StudyCohort } from '@/lib/catalyst/types';

const AUTO_COHORT_THRESHOLD = 10; // Use TICKER cohort if >= 10 samples

export async function GET(req: NextRequest) {
  try {
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

    // ── Determine cohort ──────────────────────────────────────────
    let cohort: StudyCohort;

    if (cohortParam === 'auto') {
      // Count ticker-specific events
      const cutoff = new Date(Date.now() - lookbackDays * 86_400_000);
      const countRows = await q(
        `SELECT COUNT(*) as cnt FROM catalyst_events
         WHERE ticker = $1 AND catalyst_subtype = $2 AND event_timestamp_utc >= $3`,
        [ticker, subtypeParam, cutoff]
      );
      const tickerCount = parseInt(countRows?.[0]?.cnt || '0', 10);

      if (tickerCount >= AUTO_COHORT_THRESHOLD) {
        cohort = 'TICKER';
      } else {
        cohort = 'MARKET'; // Fallback to market-wide
      }
    } else {
      cohort = cohortParam;
    }

    // ── Compute or retrieve cached study ──────────────────────────
    const result = await getOrComputeStudy({
      ticker,
      subtype: subtypeParam,
      lookbackDays,
      cohort,
    });

    // ── Quality warnings ──────────────────────────────────────────
    const warnings: string[] = [];
    if (result.study.sampleN < 5) {
      warnings.push('LOW_SAMPLE_SIZE: Fewer than 5 events. Results should be treated with low confidence.');
    }
    if (result.study.dataQuality.percentMissingBars > 0.2) {
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
      cached: result.cached,
      cacheAge: result.cacheAge,
      pendingPriceData: result.pendingPriceData,
      warnings,
      study: result.study,
    });
  } catch (error: any) {
    console.error('Catalyst study error:', error?.message, error?.stack);
    return NextResponse.json({ error: 'Failed to compute study', detail: error.message }, { status: 500 });
  }
}
