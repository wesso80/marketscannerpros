/** Quick direction-relative score for /api/scanner/top-cached (cached worker indicators). */
/**
 * Simple score from cached indicators (0–100 scale).
 * `score` is the strength of the setup IN ITS OWN DIRECTION (a clean downtrend scores as high as the mirrored uptrend),
 * so the "top" list can contain shorts. Every rule is mirror-symmetric and missing indicators are skipped, not read
 * as 0. (Before Sep 2026 the score was a bullishness share — bearish setups sorted to the bottom — RSI < 30 counted
 * as bullish, a Stochastic outside 20–80 counted as bearish, and a missing RSI read as 0 = "oversold bounce".)
 */
export function computeQuickScore(row: Record<string, unknown>): { score: number; direction: string } {
  let bullish = 0;
  let bearish = 0;
  const num = (v: unknown) => {
    if (v === null || v === undefined || v === '') return Number.NaN;
    const n = Number(v);
    return Number.isFinite(n) ? n : Number.NaN;
  };

  const rsi = num(row.rsi14);
  const macdHist = num(row.macd_hist);
  const adx = num(row.adx14);
  const price = num(row.price);
  const ema200 = num(row.ema200);
  const stochK = num(row.stoch_k);
  const changePct = num(row.change_percent);

  // RSI momentum (trend-following, mirrored around 50)
  if (Number.isFinite(rsi)) {
    if (rsi > 50 && rsi < 70) bullish += 15;
    else if (rsi >= 70) bullish += 5;   // strong but stretched
    else if (rsi < 50 && rsi > 30) bearish += 15;
    else if (rsi <= 30) bearish += 5;   // weak but stretched
  }

  // MACD histogram direction
  if (Number.isFinite(macdHist)) {
    if (macdHist > 0) bullish += 15;
    else if (macdHist < 0) bearish += 15;
  }

  // Trend: price vs EMA200
  if (Number.isFinite(ema200) && ema200 > 0 && Number.isFinite(price)) {
    if (price > ema200) bullish += 20;
    else if (price < ema200) bearish += 20;
  }

  // ADX is trend strength, not direction. It only amplifies the side already supported by directional evidence.
  if (Number.isFinite(adx) && adx > 25) {
    if (bullish > bearish) bullish += 10;
    else if (bearish > bullish) bearish += 10;
  }

  // Stochastic position (mirrored around 50)
  if (Number.isFinite(stochK)) {
    if (stochK > 50) bullish += 10;
    else if (stochK < 50) bearish += 10;
  }

  // Recent change
  if (Number.isFinite(changePct)) {
    if (changePct > 0) bullish += 5;
    else if (changePct < 0) bearish += 5;
  }

  const total = bullish + bearish;
  const direction = bullish > bearish ? 'bullish' : bullish < bearish ? 'bearish' : 'neutral';
  const score = total === 0 || direction === 'neutral' ? 50 : Math.round((Math.max(bullish, bearish) / total) * 100);

  return { score, direction };
}
