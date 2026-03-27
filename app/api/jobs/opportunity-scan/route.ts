/**
 * Opportunity Scan Job — v4 Suggestion Engine
 *
 * @route GET|POST /api/jobs/opportunity-scan
 * @description Scans top daily picks, matches against each workspace's edge
 *              profile, and inserts ranked trade suggestions.
 *
 * Designed to run every 30 minutes during market hours via Render cron.
 * Protected by CRON_SECRET.
 *
 * Pipeline:
 *  1. Fetch today's daily_picks (pre-computed by scan-universe)
 *  2. Enrich with indicators_latest (RSI, ADX, squeeze, etc.)
 *  3. For each workspace with enough trade history:
 *     a. Build edge profile + softEdgeHints
 *     b. Score each pick against edge profile
 *     c. Apply guardrails (min confidence, min scanner score, min edge match)
 *     d. Insert top suggestions into trade_suggestions
 *  4. Expire stale pending suggestions
 */

import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { verifyCronAuth, verifyAdminAuth } from '@/lib/adminAuth';
import { alertCronFailure } from '@/lib/opsAlerting';
import { postToDiscord, buildScannerEmbed, buildGoldenEggEmbed } from '@/lib/discord-bridge';
import {
  computeEdgeProfile,
  MIN_SAMPLE_SIZE,
  type SoftEdgeHints,
  type EdgeProfile,
  normalizeSide,
} from '@/lib/intelligence/edgeProfile';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 min budget

/* ── Guardrail thresholds ─────────────────────────────────────────────── */

/** Minimum scanner score to consider a pick (0-100). */
const MIN_SCANNER_SCORE = 60;

/** Minimum edge-match score to surface a suggestion (0-1). */
const MIN_EDGE_MATCH = 0.25;

/** Minimum composite confidence to surface a suggestion (0-1). */
const MIN_CONFIDENCE = 0.5;

/** Max suggestions per workspace per run. */
const MAX_SUGGESTIONS_PER_WORKSPACE = 5;

/** Max pending suggestions per workspace (prevent flood). */
const MAX_PENDING_PER_WORKSPACE = 10;

/** Suggestion TTL in hours. */
const SUGGESTION_TTL_HOURS = 8;

/** Minimum trades in trade_outcomes before we generate suggestions. */
const MIN_TRADE_HISTORY = MIN_SAMPLE_SIZE; // 10

/** Edge-match personalization weight cap (10%). */
const PERSONALIZATION_CAP = 0.10;

/* ── Types ────────────────────────────────────────────────────────────── */

interface DailyPick {
  symbol: string;
  asset_class: string;
  score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  price: number | null;
  change_percent: number | null;
  indicators: Record<string, number | null> | null;
  rank_type: string;
}

interface IndicatorRow {
  symbol: string;
  rsi14: number | null;
  adx14: number | null;
  atr14: number | null;
  ema200: number | null;
  in_squeeze: boolean | null;
  bb_upper: number | null;
  bb_lower: number | null;
}

interface ScoredPick extends DailyPick {
  edgeMatchScore: number;
  confidenceScore: number;
  strategy: string;
  setup: string;
  suggestedEntry: number | null;
  suggestedStop: number | null;
  suggestedTarget: number | null;
  riskReward: number | null;
  reasoning: string;
}

/* ── Handlers ─────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) { return runOpportunityScan(req); }
export async function POST(req: NextRequest) { return runOpportunityScan(req); }

async function runOpportunityScan(req: NextRequest) {
  if (!verifyCronAuth(req) && !verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const log: string[] = [];
  const push = (msg: string) => { log.push(msg); console.log(`[opportunity-scan] ${msg}`); };

  try {
    // ── 0. Expire stale suggestions ────────────────────────────────────
    const expired = await q(
      `UPDATE trade_suggestions SET status = 'expired'
       WHERE status = 'pending' AND expires_at < NOW()
       RETURNING id`
    );
    if (expired.length) push(`Expired ${expired.length} stale suggestions`);

    // ── 1. Load today's daily picks ────────────────────────────────────
    const scanDate = new Date().toISOString().split('T')[0];
    const picks: DailyPick[] = await q(
      `SELECT symbol, asset_class, score, direction, price, change_percent,
              indicators::text as indicators, rank_type
       FROM daily_picks
       WHERE scan_date = $1
       ORDER BY score DESC`,
      [scanDate]
    );

    if (!picks.length) {
      push('No daily picks found for today — skipping');
      return NextResponse.json({ success: true, message: 'No picks available', log });
    }

    // Parse JSON indicators column
    for (const p of picks) {
      if (typeof p.indicators === 'string') {
        try { p.indicators = JSON.parse(p.indicators); } catch { p.indicators = null; }
      }
    }

    push(`Loaded ${picks.length} daily picks`);

    // ── 2. Enrich with indicators_latest ───────────────────────────────
    const symbols = picks.map(p => p.symbol);
    const indicatorRows: IndicatorRow[] = await q(
      `SELECT symbol, rsi14, adx14, atr14, ema200, in_squeeze, bb_upper, bb_lower
       FROM indicators_latest
       WHERE symbol = ANY($1) AND timeframe = 'daily'`,
      [symbols]
    );
    const indicatorMap = new Map(indicatorRows.map(r => [r.symbol, r]));

    // ── 3. Find eligible workspaces ────────────────────────────────────
    const workspaces: { workspace_id: string; cnt: number }[] = await q(
      `SELECT workspace_id, COUNT(*)::int as cnt
       FROM trade_outcomes
       GROUP BY workspace_id
       HAVING COUNT(*) >= $1`,
      [MIN_TRADE_HISTORY]
    );

    if (!workspaces.length) {
      push('No workspaces with sufficient trade history — skipping');
      return NextResponse.json({ success: true, message: 'No eligible workspaces', log });
    }

    push(`Found ${workspaces.length} eligible workspaces`);

    let totalInserted = 0;

    // ── 4. For each workspace: score & insert ──────────────────────────
    for (const ws of workspaces) {
      try {
        // Check pending count cap
        const pendingRows = await q<{ cnt: number }>(
          `SELECT COUNT(*)::int as cnt FROM trade_suggestions
           WHERE workspace_id = $1 AND status = 'pending'`,
          [ws.workspace_id]
        );
        const pendingCount = pendingRows[0]?.cnt ?? 0;
        if (pendingCount >= MAX_PENDING_PER_WORKSPACE) {
          push(`Workspace ${ws.workspace_id.slice(0, 8)}… already has ${pendingCount} pending — skipping`);
          continue;
        }

        const slotsAvailable = MAX_PENDING_PER_WORKSPACE - pendingCount;
        const limit = Math.min(MAX_SUGGESTIONS_PER_WORKSPACE, slotsAvailable);

        // Build edge profile
        const edgeProfile = await computeEdgeProfile(ws.workspace_id);
        const hints = edgeProfile.softEdgeHints;

        // Score every pick against this workspace's edge profile
        const scored: ScoredPick[] = [];

        for (const pick of picks) {
          if (pick.direction === 'neutral') continue;
          if (pick.score < MIN_SCANNER_SCORE) continue;

          const ind = indicatorMap.get(pick.symbol);
          const edgeMatch = computeEdgeMatch(pick, hints, edgeProfile);
          const confidence = computeConfidence(pick, ind, edgeMatch);

          if (confidence < MIN_CONFIDENCE) continue;
          if (edgeMatch < MIN_EDGE_MATCH) continue;

          const { strategy, setup } = classifySetup(pick, ind);
          const levels = computeLevels(pick, ind);

          scored.push({
            ...pick,
            edgeMatchScore: edgeMatch,
            confidenceScore: confidence,
            strategy,
            setup,
            ...levels,
            reasoning: buildReasoning(pick, ind, hints, edgeMatch, confidence, strategy),
          });
        }

        // Rank by expected value (confidence × scanner score)
        scored.sort((a, b) => {
          const evA = a.confidenceScore * a.score;
          const evB = b.confidenceScore * b.score;
          return evB - evA;
        });

        const toInsert = scored.slice(0, limit);

        // Check for duplicate symbol+direction already pending
        const existingSymbols = await q<{ symbol: string; direction: string }>(
          `SELECT symbol, direction FROM trade_suggestions
           WHERE workspace_id = $1 AND status = 'pending'`,
          [ws.workspace_id]
        );
        const existingSet = new Set(existingSymbols.map(r => `${r.symbol}:${r.direction}`));

        const expiresAt = new Date(Date.now() + SUGGESTION_TTL_HOURS * 60 * 60 * 1000).toISOString();
        let wsInserted = 0;

        for (const s of toInsert) {
          if (existingSet.has(`${s.symbol}:${s.direction}`)) continue;

          await q(
            `INSERT INTO trade_suggestions
             (workspace_id, symbol, asset_class, direction, strategy, setup,
              scanner_score, edge_match_score, confidence_score,
              suggested_entry, suggested_stop, suggested_target, position_size,
              risk_reward, reasoning, status, expires_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending',$16)`,
            [
              ws.workspace_id,
              s.symbol,
              s.asset_class,
              s.direction,
              s.strategy,
              s.setup,
              s.score,
              s.edgeMatchScore,
              s.confidenceScore,
              s.suggestedEntry,
              s.suggestedStop,
              s.suggestedTarget,
              null, // position_size — left null, trader decides
              s.riskReward,
              s.reasoning,
              expiresAt,
            ]
          );
          wsInserted++;
        }

        if (wsInserted) push(`Inserted ${wsInserted} suggestions for ${ws.workspace_id.slice(0, 8)}…`);
        totalInserted += wsInserted;
      } catch (wsErr: any) {
        push(`Error for workspace ${ws.workspace_id.slice(0, 8)}…: ${wsErr.message}`);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    push(`Done in ${duration}s — ${totalInserted} suggestions created`);

    // Post top picks to Discord scanner channel
    if (picks.length > 0) {
      postToDiscord('msp-scanner', buildScannerEmbed(
        picks.slice(0, 10).map(p => {
          const ind = indicatorMap.get(p.symbol);
          return {
            symbol: p.symbol,
            score: p.score ?? 0,
            side: p.direction ?? 'long',
            rsi: ind?.rsi14 ?? undefined,
            adx: ind?.adx14 ?? undefined,
            squeeze: ind?.in_squeeze === true,
          };
        })
      )).catch(() => {});

      // Post top pick as Golden Egg if score is high enough
      const topPick = picks[0];
      if (topPick && (topPick.score ?? 0) >= 75) {
        postToDiscord('golden-egg', buildGoldenEggEmbed({
          symbol: topPick.symbol,
          verdict: (topPick.score ?? 0) >= 85 ? 'TRADE' : 'WATCH',
          bias: topPick.direction ?? 'neutral',
          confluenceScore: topPick.score ?? 0,
          reasoning: `High-confluence ${topPick.direction} setup on ${topPick.symbol} (score ${topPick.score})`,
        })).catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      suggestionsCreated: totalInserted,
      workspacesProcessed: workspaces.length,
      picksEvaluated: picks.length,
      expired: expired.length,
      duration: `${duration}s`,
      log,
    });
  } catch (err: any) {
    push(`Fatal error: ${err.message}`);
    await alertCronFailure('opportunity-scan', err.message);
    // Return 200 to prevent cron exit-22
    return NextResponse.json({ success: false, error: err.message, log });
  }
}

/* ── Edge matching ────────────────────────────────────────────────────── */

/**
 * Score how well a pick matches the trader's edge profile.
 * Returns 0-1.  Personalization contribution is capped at PERSONALIZATION_CAP (10%).
 */
function computeEdgeMatch(
  pick: DailyPick,
  hints: SoftEdgeHints,
  profile: EdgeProfile
): number {
  if (!hints.hasEnoughData) return 0.5; // neutral when no history

  let matchPoints = 0;
  let maxPoints = 0;

  // Asset class match
  maxPoints += 1;
  if (hints.preferredAssets.includes(pick.asset_class)) matchPoints += 1;

  // Direction/side match
  maxPoints += 1;
  const pickSide = normalizeSide(pick.direction);
  if (hints.preferredSides.includes(pickSide)) matchPoints += 1;

  // Regime — we don't have regime for daily picks, skip (neutral)

  // Strategy match is evaluated after classification, use overall quality
  maxPoints += 1;
  const overallSlice = profile.slices.find(s => s.dimension === 'overall');
  if (overallSlice && overallSlice.expectancy > 0) matchPoints += 1;
  else if (overallSlice && overallSlice.expectancy > -0.2) matchPoints += 0.5;

  const rawMatch = maxPoints > 0 ? matchPoints / maxPoints : 0.5;

  // Cap personalization influence at 10% — base stays at 0.5
  // Final range: 0.5 - cap .. 0.5 + cap
  const baseScore = 0.5;
  const personalContribution = (rawMatch - 0.5) * PERSONALIZATION_CAP * 2;
  return Math.max(0, Math.min(1, baseScore + personalContribution + rawMatch * 0.4));
}

/* ── Confidence scoring ───────────────────────────────────────────────── */

/**
 * Composite confidence from scanner score, indicator health, and edge match.
 * Returns 0-1.
 */
function computeConfidence(
  pick: DailyPick,
  ind: IndicatorRow | undefined,
  edgeMatch: number
): number {
  // Scanner score contributes 50%
  const scannerComponent = (pick.score / 100) * 0.50;

  // Indicator health contributes 30%
  let indicatorHealth = 0.5; // neutral default
  if (ind) {
    let healthPoints = 0;
    let healthMax = 0;

    // RSI not extreme (30-70 = healthy for new entries)
    healthMax++;
    if (ind.rsi14 != null && ind.rsi14 >= 30 && ind.rsi14 <= 70) healthPoints++;

    // ADX > 20 (trending)
    healthMax++;
    if (ind.adx14 != null && ind.adx14 > 20) healthPoints++;

    // ATR exists (volatility measurable)
    healthMax++;
    if (ind.atr14 != null && ind.atr14 > 0) healthPoints++;

    indicatorHealth = healthMax > 0 ? healthPoints / healthMax : 0.5;
  }
  const indicatorComponent = indicatorHealth * 0.30;

  // Edge match contributes 20%
  const edgeComponent = edgeMatch * 0.20;

  return scannerComponent + indicatorComponent + edgeComponent;
}

/* ── Setup classification ─────────────────────────────────────────────── */

function classifySetup(
  pick: DailyPick,
  ind: IndicatorRow | undefined
): { strategy: string; setup: string } {
  const rsi = ind?.rsi14;
  const adx = ind?.adx14;
  const squeeze = ind?.in_squeeze;

  // Squeeze breakout
  if (squeeze) {
    return {
      strategy: 'squeeze_breakout',
      setup: `Volatility squeeze detected — ${pick.direction} breakout setup`,
    };
  }

  // Strong trend momentum
  if (adx != null && adx > 30 && pick.score >= 70) {
    return {
      strategy: 'momentum',
      setup: `Strong trend (ADX ${adx.toFixed(0)}) with high confluence — momentum continuation`,
    };
  }

  // Mean reversion
  if (rsi != null && (rsi < 30 || rsi > 70)) {
    const condition = rsi < 30 ? 'oversold' : 'overbought';
    return {
      strategy: 'mean_reversion',
      setup: `RSI ${rsi.toFixed(0)} ${condition} — mean reversion ${pick.direction === 'bullish' ? 'bounce' : 'fade'}`,
    };
  }

  // Breakout (high score, moderate ADX)
  if (pick.score >= 65 && adx != null && adx > 20) {
    return {
      strategy: 'breakout',
      setup: `Technical breakout — ${pick.direction} with ADX ${adx.toFixed(0)} trend strength`,
    };
  }

  // Default: confluence trade
  return {
    strategy: 'confluence',
    setup: `Multi-indicator confluence — scanner score ${pick.score}`,
  };
}

/* ── Price levels ─────────────────────────────────────────────────────── */

function computeLevels(
  pick: DailyPick,
  ind: IndicatorRow | undefined
): {
  suggestedEntry: number | null;
  suggestedStop: number | null;
  suggestedTarget: number | null;
  riskReward: number | null;
} {
  const price = pick.price;
  if (!price || price <= 0) {
    return { suggestedEntry: null, suggestedStop: null, suggestedTarget: null, riskReward: null };
  }

  const atr = ind?.atr14 ?? price * 0.02; // fallback 2%

  const isBull = pick.direction === 'bullish';

  // Entry: current price (market) or slight pullback
  const entry = price;

  // Stop: 1.5 ATR from entry
  const stopDistance = atr * 1.5;
  const stop = isBull ? entry - stopDistance : entry + stopDistance;

  // Target: 3 ATR from entry (2:1 R:R)
  const targetDistance = atr * 3;
  const target = isBull ? entry + targetDistance : entry - targetDistance;

  const rr = stopDistance > 0 ? targetDistance / stopDistance : null;

  return {
    suggestedEntry: round8(entry),
    suggestedStop: round8(stop),
    suggestedTarget: round8(target),
    riskReward: rr ? Math.round(rr * 100) / 100 : null,
  };
}

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

/* ── Reasoning builder ────────────────────────────────────────────────── */

function buildReasoning(
  pick: DailyPick,
  ind: IndicatorRow | undefined,
  hints: SoftEdgeHints,
  edgeMatch: number,
  confidence: number,
  strategy: string
): string {
  const parts: string[] = [];

  parts.push(`Scanner score ${pick.score}/100 (${pick.direction}).`);

  if (ind?.rsi14 != null) parts.push(`RSI ${ind.rsi14.toFixed(0)}.`);
  if (ind?.adx14 != null) parts.push(`ADX ${ind.adx14.toFixed(0)}.`);
  if (ind?.in_squeeze) parts.push('Bollinger/Keltner squeeze active.');

  parts.push(`Strategy: ${strategy}.`);

  if (hints.hasEnoughData) {
    const matches: string[] = [];
    if (hints.preferredAssets.includes(pick.asset_class)) matches.push(`preferred asset (${pick.asset_class})`);
    const side = normalizeSide(pick.direction);
    if (hints.preferredSides.includes(side)) matches.push(`preferred direction (${side})`);
    if (matches.length) parts.push(`Matches edge profile: ${matches.join(', ')}.`);
  }

  parts.push(`Edge match ${(edgeMatch * 100).toFixed(0)}%, confidence ${(confidence * 100).toFixed(0)}%.`);

  return parts.join(' ');
}
