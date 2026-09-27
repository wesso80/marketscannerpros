import { readPositionHistory } from './positionHistory';
import { q } from '@/lib/db';
import { lastCompletedUsSessionDate } from '@/lib/time/usSession';
import { computePositionLevels, type DailyBarLike } from './positionLevels';
import { computePositionTrend } from './positionTrend';
import type { SavedPacket } from './sharedScan';

/** Read-only upgrade of legacy EQUITY packets using identity-checked stored daily bars.
 * Crypto history is intentionally not read from the symbol-only equity cache. New crypto scans attach their own trend. */
export async function enrichStoredPositionEvidence(packets: SavedPacket[], nowMs = Date.now()): Promise<SavedPacket[]> {
  const stored = await readPositionHistory();
  const history = new Map(stored.map(h => [h.market + ":" + h.symbol, h]));
  packets = packets.map(p => {
    const cached = history.get(p.market + ":" + p.symbol);
    if (!cached?.bars?.length) return p;
    const completedThrough = p.market === 'EQUITIES' ? lastCompletedUsSessionDate(nowMs) : new Date(nowMs - 86400000).toISOString().slice(0,10);
    const trend = computePositionTrend(cached.bars, completedThrough, nowMs);
    if (p.snapshot.positionTrend?.status === 'ok' && trend.status !== 'ok') return p;
    return { ...p, snapshot: { ...p.snapshot, positionEvidenceSource: 'market_qualified_history' as const, positionTrend: trend,
      positionLevels: computePositionLevels({dailyBars: cached.bars, completedThrough, price: p.snapshot.price, nowMs}) } };
  });
  const symbols = [...new Set(packets.filter(p => p.market === 'EQUITIES' && (!p.snapshot.positionTrend || p.snapshot.positionTrend.status !== 'ok')).map(p => p.symbol))];
  if (!symbols.length) return packets;
  let rows: { symbol: string; timestamp: string; open: number; high: number; low: number; close: number }[];
  try {
    rows = await q(`SELECT u.symbol, b.ts::date::text AS timestamp, b.open::float8, b.high::float8, b.low::float8, b.close::float8
      FROM symbol_universe u CROSS JOIN LATERAL
      (SELECT ts, open, high, low, close FROM ohlcv_bars WHERE symbol = u.symbol AND timeframe = 'daily' ORDER BY ts DESC LIMIT 500) b
      WHERE u.symbol = ANY($1::text[]) AND lower(u.asset_type) IN ('equity','equities','stock','etf')`, [symbols]);
  } catch { return packets; }
  const bySymbol = new Map<string, DailyBarLike[]>();
  for (const row of rows) { const bars = bySymbol.get(row.symbol) ?? []; bars.push(row); bySymbol.set(row.symbol, bars); }
  const completedThrough = lastCompletedUsSessionDate(nowMs);
  return packets.map(p => {
    const dailyBars = p.market === 'EQUITIES' && (!p.snapshot.positionTrend || p.snapshot.positionTrend.status !== 'ok') ? bySymbol.get(p.symbol) : null;
    if (!dailyBars?.length) return p;
    return { ...p, snapshot: { ...p.snapshot, positionEvidenceSource: 'ohlcv_bars_identity_checked' as const,
      positionTrend: computePositionTrend(dailyBars, completedThrough, nowMs),
      positionLevels: computePositionLevels({ dailyBars, completedThrough, price: p.snapshot.price, nowMs }),
    } };
  });
}
