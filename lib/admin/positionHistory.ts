import { q } from '@/lib/db';
import type { DailyBarLike } from './positionLevels';

/** Market-qualified research cache. No symbol-only crypto/equity collisions. */
export async function savePositionHistory(market: string, symbol: string, bars: DailyBarLike[]): Promise<void> {
  if (!bars.length) return;
  await q(`CREATE TABLE IF NOT EXISTS admin_position_history (
    market TEXT NOT NULL, symbol TEXT NOT NULL, bars JSONB NOT NULL, fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (market, symbol))`);
  await q(`INSERT INTO admin_position_history (market,symbol,bars) VALUES ($1,$2,$3::jsonb)
    ON CONFLICT (market,symbol) DO UPDATE SET bars=EXCLUDED.bars, fetched_at=NOW()`,
    [market,symbol,JSON.stringify(bars.slice(-500))]);
}
export async function readPositionHistory(): Promise<{market:string;symbol:string;bars:DailyBarLike[];fetched_at:string}[]> {
  try { return await q(`SELECT market,symbol,bars,fetched_at::text FROM admin_position_history`); }
  catch { return []; }
}
