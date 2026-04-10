import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { timingSafeEqual } from 'crypto';
import { alertCronFailure } from '@/lib/opsAlerting';

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
// ── Internal fetch base URL ──────────────────────────────────────
// Use RENDER_EXTERNAL_URL (set by Render on web services) or fall back to WEB_URL/APP_URL
const INTERNAL_BASE_URL = process.env.RENDER_EXTERNAL_URL
  || process.env.WEB_URL
  || process.env.NEXT_PUBLIC_BASE_URL
  || 'https://marketscannerpros.onrender.com';

const QUOTE_FETCH_TIMEOUT_MS = 10_000; // 10s max for price fetch
const WALL_CLOCK_LIMIT_MS = 90_000;     // 90s hard stop (leaves buffer for curl's 120s max-time)

/** Ensure learning tables exist (self-healing schema) */
async function ensureLearningSchema() {
  try {
    await q(`CREATE TABLE IF NOT EXISTS learning_predictions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID,
      symbol VARCHAR(20) NOT NULL,
      asset_type VARCHAR(20) DEFAULT 'crypto',
      current_price DECIMAL(20, 8) NOT NULL,
      prediction_direction VARCHAR(10) NOT NULL,
      target_price DECIMAL(20, 8),
      stop_loss DECIMAL(20, 8),
      confidence DECIMAL(5, 2),
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await q(`CREATE TABLE IF NOT EXISTS learning_outcomes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      prediction_id UUID NOT NULL,
      minutes_since_prediction INT NOT NULL,
      price_at_measure DECIMAL(20, 8) NOT NULL,
      move_pct DECIMAL(10, 4),
      direction VARCHAR(10),
      hit_target BOOLEAN DEFAULT false,
      hit_stop BOOLEAN DEFAULT false,
      outcome_window_mins INT DEFAULT 60,
      measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await q(`CREATE TABLE IF NOT EXISTS learning_stats (
      symbol VARCHAR(20) PRIMARY KEY,
      total_predictions INT DEFAULT 0,
      win_rate DECIMAL(6, 2) DEFAULT 0,
      avg_move_pct DECIMAL(10, 4) DEFAULT 0,
      avg_time_to_move_mins DECIMAL(10, 2) DEFAULT 0,
      last_updated TIMESTAMPTZ DEFAULT NOW(),
      bullish_total INT DEFAULT 0,
      bullish_wins INT DEFAULT 0,
      bullish_win_rate DECIMAL(6, 2) DEFAULT 0,
      bearish_total INT DEFAULT 0,
      bearish_wins INT DEFAULT 0,
      bearish_win_rate DECIMAL(6, 2) DEFAULT 0,
      target_hit_rate DECIMAL(6, 2) DEFAULT 0,
      stop_hit_rate DECIMAL(6, 2) DEFAULT 0,
      avg_winner_pct DECIMAL(10, 4) DEFAULT 0,
      avg_loser_pct DECIMAL(10, 4) DEFAULT 0,
      direction_bias DECIMAL(6, 2) DEFAULT 0
    )`);
    // Self-heal: add new columns if table already exists without them
    const newCols = [
      ['bullish_total', 'INT DEFAULT 0'],
      ['bullish_wins', 'INT DEFAULT 0'],
      ['bullish_win_rate', 'DECIMAL(6,2) DEFAULT 0'],
      ['bearish_total', 'INT DEFAULT 0'],
      ['bearish_wins', 'INT DEFAULT 0'],
      ['bearish_win_rate', 'DECIMAL(6,2) DEFAULT 0'],
      ['target_hit_rate', 'DECIMAL(6,2) DEFAULT 0'],
      ['stop_hit_rate', 'DECIMAL(6,2) DEFAULT 0'],
      ['avg_winner_pct', 'DECIMAL(10,4) DEFAULT 0'],
      ['avg_loser_pct', 'DECIMAL(10,4) DEFAULT 0'],
      ['direction_bias', 'DECIMAL(6,2) DEFAULT 0'],
    ];
    for (const [col, def] of newCols) {
      try {
        await q(`ALTER TABLE learning_stats ADD COLUMN IF NOT EXISTS ${col} ${def}`);
      } catch { /* column already exists */ }
    }
  } catch (e) {
    console.warn('[learning-outcomes] ensureLearningSchema warning:', e);
  }
}

interface PredictionRow {
  id: string;
  symbol: string;
  asset_type: string;
  created_at: string;
  current_price: number;
  prediction_direction: string;
  target_price: number | null;
  stop_loss: number | null;
}

async function fetchLatestPrice(symbol: string, assetType: string): Promise<number | null> {
  try {
    const url = `${INTERNAL_BASE_URL}/api/quote?symbol=${encodeURIComponent(symbol)}&type=${encodeURIComponent(assetType)}`;
    const headers: Record<string, string> = {};
    if (process.env.CRON_SECRET) headers['x-cron-secret'] = process.env.CRON_SECRET;
    const res = await fetch(url, { cache: 'no-store', headers, signal: AbortSignal.timeout(QUOTE_FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.price === 'number' ? data.price : null;
  } catch (err) {
    console.error('Price fetch failed:', err);
    return null;
  }
}

function directionFromMove(movePct: number): 'up' | 'down' | 'flat' {
  if (movePct > 0.2) return 'up';
  if (movePct < -0.2) return 'down';
  return 'flat';
}

export async function POST(_req: NextRequest) {
  // SECURITY: Accept cron secret (automated jobs) or admin secret (manual trigger)
  const cronSecret = process.env.CRON_SECRET;
  const adminSecret = process.env.ADMIN_SECRET;
  const headerCron = _req.headers.get('x-cron-secret');
  const headerAuth = _req.headers.get('authorization')?.replace('Bearer ', '');

  const cronOk = cronSecret && headerCron && safeCompare(headerCron, cronSecret);
  const adminOk = adminSecret && headerAuth && safeCompare(headerAuth, adminSecret);

  if (!cronOk && !adminOk) {
    return NextResponse.json({ ok: false, processed: 0, errors: ['Unauthorized'] }, { status: 401 });
  }

  await ensureLearningSchema();

  const start = Date.now();
  const processed: string[] = [];
  const errors: string[] = [];

  try {
    const rows = await q<PredictionRow>(
      `SELECT id, symbol, asset_type, created_at, current_price, prediction_direction, target_price, stop_loss
       FROM learning_predictions
       WHERE status = 'pending'
         AND created_at < NOW() - INTERVAL '30 minutes'
       ORDER BY created_at ASC
       LIMIT 200`
    );

    for (const pred of rows) {
      // Wall-clock guard: stop processing if approaching curl timeout
      if (Date.now() - start > WALL_CLOCK_LIMIT_MS) {
        console.warn(`[learning-outcomes] Approaching wall-clock limit after ${processed.length} predictions, stopping early`);
        break;
      }

      const latestPrice = await fetchLatestPrice(pred.symbol, pred.asset_type || 'crypto');
      if (!latestPrice || pred.current_price <= 0) {
        errors.push(`${pred.symbol}: price unavailable`);
        continue;
      }

      const movePct = ((latestPrice - pred.current_price) / pred.current_price) * 100;
      const minutesSince = Math.max(1, Math.round((Date.now() - new Date(pred.created_at).getTime()) / 60000));
      const direction = directionFromMove(movePct);

      const hitTarget =
        pred.prediction_direction === 'bullish'
          ? (pred.target_price ? latestPrice >= pred.target_price : false)
          : pred.prediction_direction === 'bearish'
          ? (pred.target_price ? latestPrice <= pred.target_price : false)
          : false;

      const hitStop =
        pred.prediction_direction === 'bullish'
          ? (pred.stop_loss ? latestPrice <= pred.stop_loss : false)
          : pred.prediction_direction === 'bearish'
          ? (pred.stop_loss ? latestPrice >= pred.stop_loss : false)
          : false;

      await q(
        `INSERT INTO learning_outcomes (
          prediction_id, minutes_since_prediction, price_at_measure, move_pct, direction, hit_target, hit_stop, outcome_window_mins
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`
        , [
          pred.id,
          minutesSince,
          latestPrice,
          Number(movePct.toFixed(4)),
          direction,
          hitTarget,
          hitStop,
          60
        ]
      );

      await q(`UPDATE learning_predictions SET status = 'processed' WHERE id = $1`, [pred.id]);

      // Update rolling stats with directional breakdown
      const stats = await q<{
        total_predictions: number; win_rate: number; avg_move_pct: number; avg_time_to_move_mins: number;
        bullish_total: number; bullish_wins: number; bearish_total: number; bearish_wins: number;
        target_hit_rate: number; stop_hit_rate: number;
        avg_winner_pct: number; avg_loser_pct: number;
      }>(
        `SELECT total_predictions, win_rate, avg_move_pct, avg_time_to_move_mins,
                COALESCE(bullish_total, 0) as bullish_total, COALESCE(bullish_wins, 0) as bullish_wins,
                COALESCE(bearish_total, 0) as bearish_total, COALESCE(bearish_wins, 0) as bearish_wins,
                COALESCE(target_hit_rate, 0) as target_hit_rate, COALESCE(stop_hit_rate, 0) as stop_hit_rate,
                COALESCE(avg_winner_pct, 0) as avg_winner_pct, COALESCE(avg_loser_pct, 0) as avg_loser_pct
         FROM learning_stats WHERE symbol = $1`,
        [pred.symbol]
      );

      const prev = stats[0];
      const total = (prev?.total_predictions || 0) + 1;

      // Directional win = price moved in the predicted direction by > 0.2%
      const isBullish = pred.prediction_direction === 'bullish';
      const isBearish = pred.prediction_direction === 'bearish';
      const directionCorrect = (isBullish && movePct > 0.2) || (isBearish && movePct < -0.2);

      // Overall wins (direction correct OR hit target)
      const isWin = directionCorrect || hitTarget;
      const prevWins = prev ? Math.round((prev.win_rate / 100) * prev.total_predictions) : 0;
      const wins = prevWins + (isWin ? 1 : 0);
      const winRate = (wins / total) * 100;

      // Per-direction tracking
      const bullTotal = (prev?.bullish_total || 0) + (isBullish ? 1 : 0);
      const bullWins = (prev?.bullish_wins || 0) + (isBullish && isWin ? 1 : 0);
      const bullWinRate = bullTotal > 0 ? (bullWins / bullTotal) * 100 : 0;

      const bearTotal = (prev?.bearish_total || 0) + (isBearish ? 1 : 0);
      const bearWins = (prev?.bearish_wins || 0) + (isBearish && isWin ? 1 : 0);
      const bearWinRate = bearTotal > 0 ? (bearWins / bearTotal) * 100 : 0;

      // Target/stop hit rates
      const prevTargetHits = prev ? Math.round((prev.target_hit_rate / 100) * prev.total_predictions) : 0;
      const prevStopHits = prev ? Math.round((prev.stop_hit_rate / 100) * prev.total_predictions) : 0;
      const targetHitRate = ((prevTargetHits + (hitTarget ? 1 : 0)) / total) * 100;
      const stopHitRate = ((prevStopHits + (hitStop ? 1 : 0)) / total) * 100;

      // Separate winner/loser average move sizes
      const absMov = Math.abs(movePct);
      let avgWinner = prev?.avg_winner_pct || 0;
      let avgLoser = prev?.avg_loser_pct || 0;
      if (isWin) {
        const prevWinnerCount = prevWins;
        avgWinner = prevWinnerCount > 0 ? (avgWinner * prevWinnerCount + absMov) / (prevWinnerCount + 1) : absMov;
      } else {
        const prevLoserCount = (prev?.total_predictions || 0) - prevWins;
        avgLoser = prevLoserCount > 0 ? (avgLoser * prevLoserCount + absMov) / (prevLoserCount + 1) : absMov;
      }

      const avgMove = ((prev?.avg_move_pct || 0) * (total - 1) + absMov) / total;
      const avgTime = ((prev?.avg_time_to_move_mins || 0) * (total - 1) + minutesSince) / total;

      // Direction bias: positive = symbol tends bullish, negative = bearish
      // Based on actual price moves, not predictions
      const directionBias = bullTotal + bearTotal > 5
        ? bullWinRate - bearWinRate
        : 0;

      await q(
        `INSERT INTO learning_stats (
          symbol, total_predictions, win_rate, avg_move_pct, avg_time_to_move_mins,
          bullish_total, bullish_wins, bullish_win_rate,
          bearish_total, bearish_wins, bearish_win_rate,
          target_hit_rate, stop_hit_rate,
          avg_winner_pct, avg_loser_pct, direction_bias, last_updated
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
         ON CONFLICT (symbol) DO UPDATE SET
           total_predictions = EXCLUDED.total_predictions,
           win_rate = EXCLUDED.win_rate,
           avg_move_pct = EXCLUDED.avg_move_pct,
           avg_time_to_move_mins = EXCLUDED.avg_time_to_move_mins,
           bullish_total = EXCLUDED.bullish_total,
           bullish_wins = EXCLUDED.bullish_wins,
           bullish_win_rate = EXCLUDED.bullish_win_rate,
           bearish_total = EXCLUDED.bearish_total,
           bearish_wins = EXCLUDED.bearish_wins,
           bearish_win_rate = EXCLUDED.bearish_win_rate,
           target_hit_rate = EXCLUDED.target_hit_rate,
           stop_hit_rate = EXCLUDED.stop_hit_rate,
           avg_winner_pct = EXCLUDED.avg_winner_pct,
           avg_loser_pct = EXCLUDED.avg_loser_pct,
           direction_bias = EXCLUDED.direction_bias,
           last_updated = NOW()`
        , [
          pred.symbol, total,
          Number(winRate.toFixed(2)), Number(avgMove.toFixed(4)), Number(avgTime.toFixed(2)),
          bullTotal, bullWins, Number(bullWinRate.toFixed(2)),
          bearTotal, bearWins, Number(bearWinRate.toFixed(2)),
          Number(targetHitRate.toFixed(2)), Number(stopHitRate.toFixed(2)),
          Number(avgWinner.toFixed(4)), Number(avgLoser.toFixed(4)),
          Number(directionBias.toFixed(2)),
        ]
      );

      processed.push(pred.id);
    }
  } catch (err: any) {
    console.error('Learning outcomes job error:', err);
    await alertCronFailure('learning-outcomes', err.message || 'Unknown error');
    errors.push(err.message || 'Unknown error');
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  return NextResponse.json({
    ok: true,
    processed: processed.length,
    errors,
    durationSeconds: duration,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
