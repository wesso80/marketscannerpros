import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { APP_URL } from '@/lib/appUrl';

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
    const url = `${APP_URL}/api/quote?symbol=${encodeURIComponent(symbol)}&type=${encodeURIComponent(assetType)}`;
    const headers: Record<string, string> = {};
    if (process.env.CRON_SECRET) headers['x-cron-secret'] = process.env.CRON_SECRET;
    const res = await fetch(url, { cache: 'no-store', headers });
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

      // Update rolling stats
      const stats = await q<{ total_predictions: number; win_rate: number; avg_move_pct: number; avg_time_to_move_mins: number; }>(
        `SELECT total_predictions, win_rate, avg_move_pct, avg_time_to_move_mins
         FROM learning_stats WHERE symbol = $1`,
        [pred.symbol]
      );

      const prev = stats[0];
      const total = (prev?.total_predictions || 0) + 1;
      const wins = (prev ? Math.round((prev.win_rate / 100) * prev.total_predictions) : 0) + (hitTarget ? 1 : 0);
      const winRate = (wins / total) * 100;
      const avgMove = ((prev?.avg_move_pct || 0) * (total - 1) + Math.abs(movePct)) / total;
      const avgTime = ((prev?.avg_time_to_move_mins || 0) * (total - 1) + minutesSince) / total;

      await q(
        `INSERT INTO learning_stats (symbol, total_predictions, win_rate, avg_move_pct, avg_time_to_move_mins, last_updated)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (symbol) DO UPDATE SET
           total_predictions = EXCLUDED.total_predictions,
           win_rate = EXCLUDED.win_rate,
           avg_move_pct = EXCLUDED.avg_move_pct,
           avg_time_to_move_mins = EXCLUDED.avg_time_to_move_mins,
           last_updated = NOW()`
        , [pred.symbol, total, Number(winRate.toFixed(2)), Number(avgMove.toFixed(4)), Number(avgTime.toFixed(2))]
      );

      processed.push(pred.id);
    }
  } catch (err: any) {
    console.error('Learning outcomes job error:', err);
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
