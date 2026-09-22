/** CoinGecko OHLC timestamps are candle CLOSE times; OHLC has no volume. */
export type ClosedCandle = { time: Date; closeTime: Date; open: number; high: number; low: number; close: number };

export function closedCandles(rows: number[][], intervalMs: number, now = Date.now()): ClosedCandle[] {
  const valid = new Map<number, ClosedCandle>();
  for (const [t, open, high, low, close] of rows) {
    if (![t, open, high, low, close].every(Number.isFinite) || Math.min(open, high, low, close) <= 0 ||
        high < Math.max(open, close, low) || low > Math.min(open, close, high) || t > now || t % intervalMs !== 0) continue;
    valid.set(t, { time: new Date(t - intervalMs), closeTime: new Date(t), open, high, low, close });
  }
  // Reject a finer source series instead of silently re-labelling selected candles.
  const times = [...new Set(rows.map(r => r[0]).filter(Number.isFinite))].sort((a, b) => a - b);
  if (times.some((t, i) => i > 0 && t - times[i - 1] < intervalMs)) return [];
  return [...valid.values()].sort((a, b) => a.time.getTime() - b.time.getTime());
}

/** Aggregate only complete, contiguous UTC periods. Monday anchors weekly bars. */
export function aggregateClosedCandles(bars: ClosedCandle[], sourceMs: number, targetMs: number): ClosedCandle[] {
  if (targetMs < sourceMs || targetMs % sourceMs !== 0) return [];
  const anchor = targetMs === 7 * 86400000 ? 4 * 86400000 : 0;
  const groups = new Map<number, ClosedCandle[]>();
  for (const b of bars) {
    const start = Math.floor((b.time.getTime() - anchor) / targetMs) * targetMs + anchor;
    groups.set(start, [...(groups.get(start) || []), b]);
  }
  return [...groups].flatMap(([start, group]) => {
    const ordered = group.sort((a, b) => a.time.getTime() - b.time.getTime());
    if (ordered.length !== targetMs / sourceMs || ordered.some((b, i) => b.time.getTime() !== start + i * sourceMs || b.closeTime.getTime() !== start + (i + 1) * sourceMs)) return [];
    return [{ time: new Date(start), closeTime: new Date(start + targetMs), open: ordered[0].open,
      high: Math.max(...ordered.map(b => b.high)), low: Math.min(...ordered.map(b => b.low)), close: ordered.at(-1)!.close }];
  });
}
