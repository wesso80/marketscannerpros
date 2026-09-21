/** ATR scenarios require observed volatility and a directional hypothesis. */
export function atrResearchLevels(price: number, atr: number | undefined, direction: string) {
  const unavailable = { entry: undefined, stop: undefined, target: undefined, rMultiple: undefined };
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(atr) || atr! <= 0) return unavailable;
  if (direction !== 'bullish' && direction !== 'bearish') return unavailable;
  const sign = direction === 'bullish' ? 1 : -1;
  const stop = price - sign * atr! * 1.5;
  const target = price + sign * atr! * 3;
  if (!Number.isFinite(stop) || !Number.isFinite(target) || stop <= 0 || target <= 0 || stop === price || target === price) return unavailable;
  return { entry: price, stop, target, rMultiple: Math.abs(target - price) / Math.abs(price - stop) };
}
