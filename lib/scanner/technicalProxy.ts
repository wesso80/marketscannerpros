/** Historical technical proxy, shared by live snapshots and bar replay.
 * Signed bullish scale: long >= threshold, short <= 100-threshold.
 * This legacy heuristic is NOT the direction-independent MSP composite.
 * Formula preserved so existing historical results remain comparable.
 */
export const TECHNICAL_PROXY_VERSION = 'msp.technical-proxy.v1' as const;

export interface TechnicalProxyResult {
  version: typeof TECHNICAL_PROXY_VERSION;
  score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  signals: { bullish: number; bearish: number; neutral: number };
}

export function computeTechnicalProxy(
  close: number,
  ema200Val: number,
  rsiVal: number,
  macLine: number,
  sigLine: number,
  macHist: number,
  atrVal: number,
  adxVal: number,
  stochK: number,
  aroonU: number,
  aroonD: number,
  cciVal: number,
  obvCurr: number,
  obvPrev: number,
): TechnicalProxyResult {
  let bull = 0, bear = 0, neut = 0;

  // ADX trend multiplier
  let tm = 1.0;
  if (Number.isFinite(adxVal)) {
    if (adxVal >= 40) tm = 1.4;
    else if (adxVal >= 25) tm = 1.25;
    else if (adxVal >= 20) tm = 1.0;
    else tm = 0.7;
  }

  // Trend signals (ADX-weighted)
  if (Number.isFinite(ema200Val) && Number.isFinite(close)) {
    const w = 2 * tm;
    if (close > ema200Val * 1.01) bull += w;
    else if (close < ema200Val * 0.99) bear += w;
    else neut += 1;
  }
  if (Number.isFinite(macHist)) { if (macHist > 0) bull += tm; else bear += tm; }
  if (Number.isFinite(macLine) && Number.isFinite(sigLine)) { if (macLine > sigLine) bull += tm; else bear += tm; }
  if (Number.isFinite(aroonU) && Number.isFinite(aroonD)) {
    const w = tm;
    if (aroonU > aroonD && aroonU > 70) bull += w;
    else if (aroonD > aroonU && aroonD > 70) bear += w;
    else neut += 0.5;
  }
  if (Number.isFinite(obvCurr) && Number.isFinite(obvPrev)) {
    const w = tm;
    if (obvCurr > obvPrev) bull += w; else if (obvCurr < obvPrev) bear += w; else neut += 0.5;
  }

  // Oscillator signals (NOT ADX-weighted)
  if (Number.isFinite(rsiVal)) {
    if (rsiVal >= 55 && rsiVal <= 70) bull += 1;
    else if (rsiVal > 70) bear += 1;
    else if (rsiVal <= 45 && rsiVal >= 30) bear += 1;
    else if (rsiVal < 30) bull += 1;
    else neut += 1;
  }
  if (Number.isFinite(stochK)) {
    if (stochK > 80) bear += 1; else if (stochK < 20) bull += 1;
    else if (stochK >= 50) bull += 0.5; else bear += 0.5;
  }
  if (Number.isFinite(cciVal)) {
    if (cciVal > 100) bull += 1; else if (cciVal > 0) bull += 0.5;
    else if (cciVal < -100) bear += 1; else bear += 0.5;
  }
  if (Number.isFinite(atrVal) && Number.isFinite(close)) {
    if ((atrVal / close) * 100 > 5) neut += 1;
  }

  let direction: 'bullish' | 'bearish' | 'neutral';
  if (bull > bear * 1.15) direction = 'bullish';
  else if (bear > bull * 1.15) direction = 'bearish';
  else direction = 'neutral';

  const maxSig = 10 * tm;
  let score = 50 + ((bull - bear) / maxSig) * 50;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    version: TECHNICAL_PROXY_VERSION,
    score,
    direction,
    signals: {
      bullish: Math.round(bull * 10) / 10,
      bearish: Math.round(bear * 10) / 10,
      neutral: Math.round(neut * 10) / 10,
    },
  };
}
