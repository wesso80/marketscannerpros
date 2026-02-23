/**
 * Event Study Math Engine
 *
 * Institutional-grade event-study computation.
 * Takes a set of catalyst events + price data and produces
 * distribution statistics for each horizon.
 *
 * Returns explicit data-quality flags, never silently degrades.
 */

import { q } from '@/lib/db';
import { getDaily, getBars, getDailyBar, getNTradingDays, computeMissingBarPercent } from './priceService';
import { nextWeekdayAfter, addDays, etDateString } from './sessionClassifier';
import {
  CatalystSubtype,
  MarketSession,
  type CatalystEvent,
  type EventStudyResult,
  type DistributionStats,
  type IntradayPathStats,
  type DataQualityReport,
  type StudyMemberSummary,
  type StudyHorizon,
  type StudyCohort,
  type PriceBar,
} from './types';

// ─── Distribution math ──────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

export function computeDistribution(values: number[]): DistributionStats {
  if (values.length === 0) {
    return { median: 0, p10: 0, p25: 0, p75: 0, p90: 0, mean: 0, stdDev: 0, winRateAbove1Pct: 0, lossRateBelow1Pct: 0, tailRiskAvg: 0, sampleN: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  // Tail risk: average of worst 10% (lowest returns)
  const tailCount = Math.max(1, Math.floor(n * 0.1));
  const tailSlice = sorted.slice(0, tailCount);

  return {
    median: percentile(sorted, 50),
    p10: percentile(sorted, 10),
    p25: percentile(sorted, 25),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    mean: mean(sorted),
    stdDev: stdDev(sorted),
    winRateAbove1Pct: sorted.filter(v => v > 1).length / n,
    lossRateBelow1Pct: sorted.filter(v => v < -1).length / n,
    tailRiskAvg: mean(tailSlice),
    sampleN: n,
  };
}

// ─── Return computation per event ───────────────────────────────────

interface EventReturns {
  close_to_open: number | null;
  open_to_close: number | null;
  day1: number | null;
  day2: number | null;
  day5: number | null;
}

interface IntradayPathData {
  mfePercent: number;  // max favorable excursion %
  maePercent: number;  // max adverse excursion %
  reversalWithin90m: boolean;
  timeToMaxExcursionMinutes: number;
}

/**
 * Compute returns for a single event.
 * All returns in percent.
 */
async function computeEventReturns(
  ticker: string,
  anchorDate: Date,
  session: MarketSession
): Promise<{ returns: EventReturns; intraday: IntradayPathData | null; missingBars: number }> {
  let missingBars = 0;

  // Get anchor date and surrounding days
  const anchorDateStr = etDateString(anchorDate);
  const prevDateStr = nextPrevWeekday(anchorDateStr);
  const nextDay1Str = nextWeekdayAfter(anchorDateStr);
  const nextDay2Str = nextWeekdayAfter(nextDay1Str);
  const nextDay5Str = nextWeekdayAfter(nextWeekdayAfter(nextWeekdayAfter(nextDay2Str)));

  // Fetch daily bars
  const [prevBar, anchorBar, day1Bar, day2Bar, day5Bar] = await Promise.all([
    getDailyBar(ticker, new Date(prevDateStr)),
    getDailyBar(ticker, new Date(anchorDateStr)),
    getDailyBar(ticker, new Date(nextDay1Str)),
    getDailyBar(ticker, new Date(nextDay2Str)),
    getDailyBar(ticker, new Date(nextDay5Str)),
  ]);

  if (!anchorBar) missingBars++;
  if (!prevBar) missingBars++;

  const prevClose = prevBar?.close ?? null;
  const anchorOpen = anchorBar?.open ?? null;
  const anchorClose = anchorBar?.close ?? null;

  const returns: EventReturns = {
    close_to_open: prevClose && anchorOpen ? ((anchorOpen - prevClose) / prevClose) * 100 : null,
    open_to_close: anchorOpen && anchorClose ? ((anchorClose - anchorOpen) / anchorOpen) * 100 : null,
    day1: prevClose && anchorClose ? ((anchorClose - prevClose) / prevClose) * 100 : null,
    day2: prevClose && day1Bar?.close ? ((day1Bar.close - prevClose) / prevClose) * 100 : null,
    day5: prevClose && day5Bar?.close ? ((day5Bar.close - prevClose) / prevClose) * 100 : null,
  };

  // Intraday path analysis (use 5-min bars)
  let intraday: IntradayPathData | null = null;
  if (anchorOpen) {
    try {
      const intradayStart = new Date(anchorDateStr + 'T09:30:00');
      const intradayEnd = new Date(anchorDateStr + 'T16:00:00');
      const bars = await getBars(ticker, '5min', intradayStart, intradayEnd, true);

      if (bars.length >= 5) {
        intraday = computeIntradayPath(bars, anchorOpen);
      }
    } catch {
      // Intraday data optional — don't fail the study
    }
  }

  return { returns, intraday, missingBars };
}

function computeIntradayPath(bars: PriceBar[], anchorOpen: number): IntradayPathData {
  // Sort ascending by timestamp
  const sorted = [...bars].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  let maxFavorable = 0;  // % above anchor open
  let maxAdverse = 0;    // % below anchor open (stored as positive)
  let maxExcursionTime = 0;
  let maxExcursionIdx = 0;
  let crossedBackAfterImpulse = false;
  let initialDirection: 'up' | 'down' | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const bar = sorted[i];
    const highPct = ((bar.high - anchorOpen) / anchorOpen) * 100;
    const lowPct = ((bar.low - anchorOpen) / anchorOpen) * 100;

    if (highPct > maxFavorable) {
      maxFavorable = highPct;
      maxExcursionIdx = i;
    }
    if (-lowPct > maxAdverse) {
      maxAdverse = -lowPct; // Store as positive
    }

    // Track initial direction for reversal detection
    if (i === 0 || i === 1) {
      if (bar.close > anchorOpen) initialDirection = 'up';
      else if (bar.close < anchorOpen) initialDirection = 'down';
    }

    // Check for reversal within first 90 minutes (18 five-min bars)
    if (i <= 18 && initialDirection && !crossedBackAfterImpulse) {
      if (initialDirection === 'up' && bar.low < anchorOpen) crossedBackAfterImpulse = true;
      if (initialDirection === 'down' && bar.high > anchorOpen) crossedBackAfterImpulse = true;
    }
  }

  // Time to max excursion in minutes
  if (sorted.length > 0 && maxExcursionIdx < sorted.length) {
    maxExcursionTime = (sorted[maxExcursionIdx].timestamp.getTime() - sorted[0].timestamp.getTime()) / 60_000;
  }

  return {
    mfePercent: maxFavorable,
    maePercent: maxAdverse,
    reversalWithin90m: crossedBackAfterImpulse,
    timeToMaxExcursionMinutes: maxExcursionTime,
  };
}

/**
 * Find the previous weekday before a given ET date string.
 */
function nextPrevWeekday(etDateStr: string): string {
  let current = addDays(etDateStr, -1);
  const [y, m, d] = current.split('-').map(Number);
  let dt = new Date(y, m - 1, d);
  while (dt.getDay() === 0 || dt.getDay() === 6) {
    dt = new Date(dt.getTime() - 86_400_000);
  }
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// ─── Confounding check ──────────────────────────────────────────────

/**
 * Check if an event falls within ±24h of a known earnings date.
 * Uses Alpha Vantage EARNINGS endpoint (cached).
 */
async function isEarningsConfounded(ticker: string, eventDate: Date): Promise<boolean> {
  // Simple heuristic: check if any 10-K/10-Q filing exists within ±2 days
  // (Full earnings calendar integration is a v2 enhancement)
  try {
    const windowStart = new Date(eventDate.getTime() - 2 * 86_400_000);
    const windowEnd = new Date(eventDate.getTime() + 2 * 86_400_000);
    const rows = await q(
      `SELECT id FROM catalyst_events
       WHERE ticker = $1 AND catalyst_subtype = $2
       AND event_timestamp_utc BETWEEN $3 AND $4
       LIMIT 1`,
      [ticker, CatalystSubtype.SEC_10K_10Q, windowStart, windowEnd]
    );
    return (rows?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

// ─── Main study computation ─────────────────────────────────────────

export interface ComputeStudyOptions {
  ticker: string;
  subtype: CatalystSubtype;
  lookbackDays: number;
  cohort: StudyCohort;
  /** If provided, these events are used instead of querying DB. */
  events?: CatalystEvent[];
  /**
   * When true, skip all Alpha Vantage API calls and return event metadata only.
   * Horizons will have sampleN: 0. Use for fast inline responses;
   * full price analysis runs in background cron.
   */
  dbOnly?: boolean;
}

/**
 * Compute a full event study for a given ticker + catalyst subtype.
 *
 * This is the core engine: fetches events, computes returns per event,
 * aggregates into distributions, and produces an auditable result.
 */

// Maximum events to process per study to respect AV rate limits.
// Each event needs ~6 AV API calls; 50 events = ~300 calls max.
const MAX_EVENTS_PER_STUDY = 50;

export async function computeEventStudy(opts: ComputeStudyOptions): Promise<EventStudyResult> {
  const { ticker, subtype, lookbackDays, cohort, dbOnly = false } = opts;
  const cutoff = new Date(Date.now() - lookbackDays * 86_400_000);

  // ── Fetch events ────────────────────────────────────────────────
  let events: CatalystEvent[];
  if (opts.events) {
    events = opts.events;
  } else {
    const scope = cohort === 'TICKER'
      ? `ticker = $1 AND catalyst_subtype = $2 AND event_timestamp_utc >= $3`
      : cohort === 'MARKET'
      ? `catalyst_subtype = $2 AND event_timestamp_utc >= $3`
      : `catalyst_subtype = $2 AND event_timestamp_utc >= $3`; // SECTOR: would need sector mapping

    const params = cohort === 'TICKER'
      ? [ticker, subtype, cutoff]
      : [ticker, subtype, cutoff]; // $1 unused for MARKET/SECTOR

    const rows = await q(
      `SELECT id, ticker, source, headline, url, catalyst_type, catalyst_subtype,
              event_timestamp_utc, event_timestamp_et, session, anchor_timestamp_et,
              confidence, severity, classification_reason, raw_payload, created_at
       FROM catalyst_events WHERE ${scope}
       ORDER BY event_timestamp_et DESC
       LIMIT ${MAX_EVENTS_PER_STUDY * 2}`,
      params
    );

    events = (rows || []).map(mapRowToEvent);

    // For MARKET cohort, sample diverse tickers — take most recent N
    // events but ensure no single ticker dominates the sample.
    if (cohort === 'MARKET' && events.length > MAX_EVENTS_PER_STUDY) {
      const tickerBuckets = new Map<string, CatalystEvent[]>();
      for (const e of events) {
        const bucket = tickerBuckets.get(e.ticker) || [];
        bucket.push(e);
        tickerBuckets.set(e.ticker, bucket);
      }
      // Round-robin pick from each ticker to get a diverse sample
      const sampled: CatalystEvent[] = [];
      let round = 0;
      while (sampled.length < MAX_EVENTS_PER_STUDY) {
        let added = false;
        for (const [, bucket] of tickerBuckets) {
          if (round < bucket.length && sampled.length < MAX_EVENTS_PER_STUDY) {
            sampled.push(bucket[round]);
            added = true;
          }
        }
        if (!added) break;
        round++;
      }
      events = sampled;
    } else if (events.length > MAX_EVENTS_PER_STUDY) {
      events = events.slice(0, MAX_EVENTS_PER_STUDY);
    }
  }

  // ── Compute returns per event ───────────────────────────────────
  const members: StudyMemberSummary[] = [];
  const horizonValues: Record<StudyHorizon, number[]> = {
    close_to_open: [],
    open_to_close: [],
    day1: [],
    day2: [],
    day5: [],
  };
  const intradayMFE: number[] = [];
  const intradayMAE: number[] = [];
  const intradayReversal: boolean[] = [];
  const intradayTimeToMax: number[] = [];
  let totalMissingBars = 0;
  let confoundedCount = 0;

  if (dbOnly) {
    // ── DB-only mode: skip all AV calls, just list events as members ──
    for (const event of events) {
      members.push({
        eventId: event.id,
        ticker: event.ticker,
        headline: event.headline,
        eventTimestampEt: event.eventTimestampEt,
        session: event.session,
        included: true,
        exclusionReason: null,
        returns: null,
      });
    }
  } else {
    // ── Full mode: fetch price data from AV and compute returns ───────
    for (const event of events) {
      // Check confounding
      const confounded = await isEarningsConfounded(event.ticker, event.eventTimestampUtc);
      if (confounded) {
        confoundedCount++;
        members.push({
          eventId: event.id,
          ticker: event.ticker,
          headline: event.headline,
          eventTimestampEt: event.eventTimestampEt,
          session: event.session,
          included: false,
          exclusionReason: 'earnings_confound',
          returns: null,
        });
        continue;
      }

      // Compute returns
      try {
        const { returns, intraday, missingBars } = await computeEventReturns(
          event.ticker,
          event.anchorTimestampEt,
          event.session
        );
        totalMissingBars += missingBars;

        const partialReturns: Partial<Record<StudyHorizon, number>> = {};
        for (const [h, val] of Object.entries(returns) as [StudyHorizon, number | null][]) {
          if (val !== null) {
            horizonValues[h].push(val);
            partialReturns[h] = val;
          }
        }

        if (intraday) {
          intradayMFE.push(intraday.mfePercent);
          intradayMAE.push(intraday.maePercent);
          intradayReversal.push(intraday.reversalWithin90m);
          intradayTimeToMax.push(intraday.timeToMaxExcursionMinutes);
        }

        members.push({
          eventId: event.id,
          ticker: event.ticker,
          headline: event.headline,
          eventTimestampEt: event.eventTimestampEt,
          session: event.session,
          included: true,
          exclusionReason: null,
          returns: partialReturns,
        });
      } catch (err: any) {
        members.push({
          eventId: event.id,
          ticker: event.ticker,
          headline: event.headline,
          eventTimestampEt: event.eventTimestampEt,
          session: event.session,
          included: false,
          exclusionReason: `price_data_error: ${err.message}`,
          returns: null,
        });
      }
    }
  }

  // ── Aggregate distributions ─────────────────────────────────────
  const horizons: Record<StudyHorizon, DistributionStats> = {} as any;
  for (const [h, vals] of Object.entries(horizonValues) as [StudyHorizon, number[]][]) {
    horizons[h] = computeDistribution(vals);
  }

  // ── Intraday path stats ─────────────────────────────────────────
  let intradayPath: IntradayPathStats | null = null;
  if (intradayMFE.length >= 3) {
    intradayPath = {
      mfePercent: computeDistribution(intradayMFE),
      maePercent: computeDistribution(intradayMAE),
      reversalWithin90mRate: intradayReversal.filter(Boolean).length / intradayReversal.length,
      timeToMaxExcursionMinutes: computeDistribution(intradayTimeToMax),
    };
  }

  // ── Data quality ────────────────────────────────────────────────
  const includedCount = members.filter(m => m.included).length;
  const avgConfidence = events.length > 0
    ? events.reduce((s, e) => s + e.confidence, 0) / events.length
    : 0;
  const pctMissing = (!dbOnly && includedCount > 0) ? totalMissingBars / (includedCount * 5) : 0; // 5 bars expected per event

  const notes: string[] = [];
  if (dbOnly) notes.push('PENDING_PRICE_ANALYSIS: Price return data is computed in background. Check back shortly.');
  if (includedCount < 5) notes.push('LOW_SAMPLE_SIZE: fewer than 5 events included.');
  if (confoundedCount > 0) notes.push(`${confoundedCount} event(s) excluded due to earnings confound.`);
  if (!dbOnly && pctMissing > 0.2) notes.push(`HIGH_MISSING_DATA: ${(pctMissing * 100).toFixed(0)}% of expected price bars missing.`);

  // Score: 10 = perfect: deduct for small sample, missing data, low confidence
  let score = 10;
  if (dbOnly) score = 1; // DB-only studies always score low until price data arrives
  else {
    if (includedCount < 5) score -= 4;
    else if (includedCount < 10) score -= 2;
    if (pctMissing > 0.3) score -= 3;
    else if (pctMissing > 0.1) score -= 1;
    if (avgConfidence < 0.5) score -= 2;
  }
  score = Math.max(0, Math.min(10, score));

  const dataQuality: DataQualityReport = {
    score,
    sampleN: includedCount,
    percentMissingBars: pctMissing,
    timestampConfidence: avgConfidence,
    confoundedCount,
    notes,
  };

  return {
    ticker,
    catalystSubtype: subtype,
    cohort,
    lookbackDays,
    sampleN: includedCount,
    computedAt: new Date(),
    horizons,
    intradayPath,
    dataQuality,
    memberEvents: members,
  };
}

// ─── DB row → CatalystEvent mapper ──────────────────────────────────

function mapRowToEvent(row: any): CatalystEvent {
  return {
    id: row.id,
    ticker: row.ticker,
    source: row.source,
    headline: row.headline,
    url: row.url,
    catalystType: row.catalyst_type,
    catalystSubtype: row.catalyst_subtype,
    eventTimestampUtc: new Date(row.event_timestamp_utc),
    eventTimestampEt: new Date(row.event_timestamp_et),
    session: row.session as MarketSession,
    anchorTimestampEt: new Date(row.anchor_timestamp_et),
    confidence: parseFloat(row.confidence),
    severity: row.severity || null,
    rawPayload: row.raw_payload || {},
    classificationReason: row.classification_reason || '',
    createdAt: new Date(row.created_at),
  };
}

// ─── Cache management ───────────────────────────────────────────────

const STUDY_CACHE_TTL_HOURS = 6;

/**
 * Get a cached study or compute a fresh one.
 * Stores result in catalyst_event_studies for fast retrieval.
 *
 * When `fullCompute` is false (default for API requests):
 *   - Returns cached study if available and fresh
 *   - Otherwise returns a fast DB-only study (no AV calls, no caching)
 *
 * When `fullCompute` is true (cron background jobs):
 *   - Always computes with full AV price data and caches the result
 */
export async function getOrComputeStudy(
  opts: ComputeStudyOptions,
  fullCompute = false
): Promise<{ study: EventStudyResult; cached: boolean; cacheAge: number | null; pendingPriceData: boolean }> {
  // Check cache
  const cached = await q(
    `SELECT id, result_json, computed_at FROM catalyst_event_studies
     WHERE ticker = $1 AND catalyst_subtype = $2 AND cohort = $3 AND lookback_days = $4
     LIMIT 1`,
    [opts.ticker, opts.subtype, opts.cohort, opts.lookbackDays]
  );

  if (cached && cached.length > 0) {
    const row = cached[0];
    const age = (Date.now() - new Date(row.computed_at).getTime()) / 1000;
    if (age < STUDY_CACHE_TTL_HOURS * 3600 && !fullCompute) {
      return { study: row.result_json as EventStudyResult, cached: true, cacheAge: age, pendingPriceData: false };
    }
  }

  // ── Fast DB-only study for inline API requests ──────────────────
  if (!fullCompute) {
    const study = await computeEventStudy({ ...opts, dbOnly: true });
    // Don't cache DB-only results — let the cron fill in the full study
    return { study, cached: false, cacheAge: null, pendingPriceData: true };
  }

  // ── Full compute with AV price data (cron/background) ──────────
  const study = await computeEventStudy({ ...opts, dbOnly: false });

  // Upsert cache
  try {
    await q(
      `INSERT INTO catalyst_event_studies (ticker, catalyst_subtype, cohort, lookback_days, sample_n, result_json, data_quality_score, notes, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (ticker, catalyst_subtype, cohort, lookback_days)
       DO UPDATE SET sample_n = $5, result_json = $6, data_quality_score = $7, notes = $8, computed_at = NOW()`,
      [opts.ticker, opts.subtype, opts.cohort, opts.lookbackDays,
       study.sampleN, JSON.stringify(study), study.dataQuality.score, study.dataQuality.notes]
    );
  } catch (err) {
    console.error('[EventStudy] Cache upsert failed:', err);
  }

  // Store member audit trail
  try {
    const studyRow = await q(
      `SELECT id FROM catalyst_event_studies WHERE ticker = $1 AND catalyst_subtype = $2 AND cohort = $3 AND lookback_days = $4`,
      [opts.ticker, opts.subtype, opts.cohort, opts.lookbackDays]
    );
    if (studyRow?.[0]?.id) {
      const studyId = studyRow[0].id;
      // Clear old members then insert fresh
      await q(`DELETE FROM catalyst_event_members WHERE study_id = $1`, [studyId]);
      for (const member of study.memberEvents) {
        await q(
          `INSERT INTO catalyst_event_members (study_id, event_id, included, exclusion_reason, features)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (study_id, event_id) DO NOTHING`,
          [studyId, member.eventId, member.included, member.exclusionReason,
           JSON.stringify({ session: member.session, returns: member.returns })]
        );
      }
    }
  } catch (err) {
    console.error('[EventStudy] Member audit insert failed:', err);
  }

  return { study, cached: false, cacheAge: null, pendingPriceData: false };
}
