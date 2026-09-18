/**
 * PRE-MOVE detector — research interest in assets that have NOT yet made the major move.
 * Output stages: EARLY_STAGE / DEVELOPING / NEAR_TRIGGER / ALREADY_MOVED / LOW_QUALITY.
 */
import type { Features } from './types';

export type PreMoveStage = 'EARLY_STAGE' | 'DEVELOPING' | 'NEAR_TRIGGER' | 'ALREADY_MOVED' | 'LOW_QUALITY';

export interface PreMove { symbol: string; stage: PreMoveStage; score: number; signals: string[]; penalties: string[]; triggerLevel: number | null; invalidationLevel: number | null; themeBoost: string | null }

export interface PreMoveContext { sectorStrengthening: Set<string>; categoryStrengthening: Set<string>; crcsDelta: (f: Features) => number | null }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const f1 = (n: number | null | undefined, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : n.toFixed(d));

export function detectPreMove(f: Features, ctx: PreMoveContext): PreMove {
  const n = f.now, sig: string[] = [], pen: string[] = [];
  let s = 0;
  const moveAtr = Math.abs(f.moveAtr ?? 0);

  // Compression
  if (n.bbWidthPctile !== null) { if (n.bbWidthPctile <= 10) { s += 22; sig.push(`BB width pctile ${f1(n.bbWidthPctile, 0)} (tight)`); } else if (n.bbWidthPctile <= 25) { s += 14; sig.push(`BB width pctile ${f1(n.bbWidthPctile, 0)}`); } }
  if (f.atrExpansion !== null && f.atrExpansion < 0.8) { s += 8; sig.push(`ATR5/ATR20 ${f1(f.atrExpansion, 2)} (vol compressed)`); }
  if (f.consolidationTight) { s += 8; sig.push(`20d range ${f1(f.range20VsAtr)} ATR (tight base)`); }
  if (f.squeeze) { s += 6; sig.push('BB inside Keltner (squeeze)'); }

  // Accumulation / volume trend
  if (f.accumRatio !== null) { if (f.accumRatio >= 1.4) { s += 14; sig.push(`5d/20d volume ${f1(f.accumRatio, 2)} (accumulation)`); } else if (f.accumRatio >= 1.15) { s += 8; sig.push(`5d/20d volume ${f1(f.accumRatio, 2)}`); } }
  else pen.push('no volume history');

  // Relative-strength acceleration
  if (f.rsBenchDelta !== null && f.rsBenchDelta > 0.5) { s += clamp(f.rsBenchDelta * 3, 0, 12); sig.push(`RS vs ${f.benchmark} accelerating (Δ5d ${f.rsBenchDelta > 0 ? '+' : ''}${f1(f.rsBenchDelta)}pp)`); }
  if (f.rsBench20 !== null && f.rsBench20 > 0 && f.rsBench5 !== null && f.rsBench5 > 0) { s += 4; sig.push('RS positive on 5d and 20d'); }

  // ADX rising from low
  if (f.adx !== null && f.adxPrev5 !== null && f.adx < 25 && f.adx > f.adxPrev5 + 2) { s += 8; sig.push(`ADX ${f1(f.adxPrev5, 0)}→${f1(f.adx, 0)} rising from low`); }

  // EMA convergence / reclaim
  if (n.ema20 !== null && n.ema50 !== null && Math.abs(n.ema20 - n.ema50) / n.ema50 < 0.015) { s += 5; sig.push('EMA20/50 converged'); }
  if (f.flags.includes('NEW_TREND_RECLAIM')) { s += 8; sig.push('fresh EMA reclaim'); }
  if (n.aboveE50 && n.aboveE200 !== false) s += 4;

  // Distance to breakout
  if (f.distToHi20Pct !== null && !n.atHi20) { if (f.distToHi20Pct > -2) { s += 12; sig.push(`${f1(Math.abs(f.distToHi20Pct))}% below 20d high`); } else if (f.distToHi20Pct > -5) { s += 6; sig.push(`${f1(Math.abs(f.distToHi20Pct))}% below 20d high`); } }
  if (f.distToHi50Pct !== null && f.distToHi50Pct > -3 && !n.atHi50) { s += 4; sig.push('near 50d high'); }

  // Momentum improving but not stretched
  if (f.rsi !== null && f.rsiPrev5 !== null && f.rsi > f.rsiPrev5 && f.rsi >= 45 && f.rsi <= 65) { s += 6; sig.push(`RSI ${f1(f.rsiPrev5, 0)}→${f1(f.rsi, 0)}`); }
  if (f.macdHist !== null && f.macdHistPrev !== null && f.macdHist > f.macdHistPrev && Math.abs(f.macdHist) < (n.atr14 ?? 1) * 0.5) { s += 4; sig.push('MACD histogram turning up near zero'); }
  const mtf = [f.ret5, f.ret20].filter((x): x is number => x !== null); if (mtf.length === 2 && mtf.every((x) => x > 0) && f.ret1 <= 1) { s += 4; sig.push('5d/20d positive while 1d quiet'); }

  // Theme / composite
  let themeBoost: string | null = null;
  if (f.sectorEtf && ctx.sectorStrengthening.has(f.sectorEtf)) { s += 8; themeBoost = `${f.sectorEtf} newly strengthening`; sig.push(themeBoost); }
  if (f.crypto?.categories.some((c) => ctx.categoryStrengthening.has(c))) { s += 8; themeBoost = f.crypto.categories.find((c) => ctx.categoryStrengthening.has(c)) + ' category strengthening'; sig.push(themeBoost); }
  const cd = ctx.crcsDelta(f); if (cd !== null && cd >= 5) { s += 6; sig.push(`CRCS ${cd > 0 ? '+' : ''}${f1(cd, 0)} vs 24h`); }

  // Derivatives (crypto)
  if (f.crypto) {
    if (f.crypto.fundingMedianPct !== null && Math.abs(f.crypto.fundingMedianPct) <= 0.02) { s += 4; sig.push('funding neutral'); }
    if (f.crypto.oiChangePct !== null && f.crypto.oiChangePct > 5 && moveAtr < 1) { s += 8; sig.push(`OI ${f1(f.crypto.oiChangePct)}% building without price extension`); }
    if (f.crypto.fundingMedianPct !== null && Math.abs(f.crypto.fundingMedianPct) > 0.06) pen.push('funding crowded');
  }
  // Catalyst approaching
  if (f.earningsInDays !== null && f.earningsInDays >= 1 && f.earningsInDays <= 10) { s += 3; sig.push(`earnings in ${f.earningsInDays}d`); }

  // Penalties — already moved / late / poor quality
  let penalty = 0;
  const ext = f.extensionAtr ?? 0, r5 = f.ret5Atr ?? 0;
  if (ext > 3) { penalty += 30; pen.push(`${f1(ext)} ATR above EMA20`); } else if (ext > 2.5) { penalty += 15; pen.push(`${f1(ext)} ATR above EMA20`); }
  if (r5 > 4) { penalty += 25; pen.push(`5d move ${f1(r5)}× daily ATR (parabolic)`); } else if (r5 > 2.5) { penalty += 10; pen.push(`5d move ${f1(r5)}× ATR`); }
  if (moveAtr >= 1.25 || Math.abs(f.ret1) >= 5) { penalty += 20; pen.push(`already moved ${f1(moveAtr)} ATR (${f.ret1 > 0 ? '+' : ''}${f1(f.ret1)}%) overnight`); } else if (moveAtr >= 0.9) { penalty += 8; pen.push(`moved ${f1(moveAtr)} ATR overnight`); }
  if (f.rsi !== null && (f.rsi > 75 || f.rsi < 25)) { penalty += 12; pen.push(`RSI ${f1(f.rsi, 0)} extreme`); }
  if (f.crypto ? (f.crypto.volume24h ?? 0) < 5e6 : (f.dollarVol20 ?? 0) < 3e6) { penalty += 25; pen.push('poor liquidity'); }
  if (f.sectorEtf && f.rsSector5 !== null && f.rsSector5 < -3) { penalty += 6; pen.push('sector not confirming'); }
  if (n.aboveE50 === false && !f.flags.includes('NEW_TREND_RECLAIM')) { penalty += 10; pen.push('below 50d EMA'); }
  if (!f.dataQuality.fresh) { penalty += 100; pen.push('stale data'); }
  if (f.dataQuality.ohlc === 'close_only') penalty += 4;

  const score = clamp(Math.round(s - penalty), 0, 100);
  let stage: PreMoveStage;
  if (!f.dataQuality.fresh || (f.crypto ? (f.crypto.volume24h ?? 0) < 5e6 : (f.dollarVol20 ?? 0) < 3e6) || score < 25) stage = 'LOW_QUALITY';
  else if (moveAtr >= 1.25 || Math.abs(f.ret1) >= 5 || ext > 2.5 || r5 > 2.5 || n.atHi20) stage = 'ALREADY_MOVED';
  else if (score >= 55 && f.distToHi20Pct !== null && f.distToHi20Pct > -3 && (f.accumRatio ?? 1) >= 1.0) stage = 'NEAR_TRIGGER';
  else if (score >= 45) stage = 'DEVELOPING';
  else stage = 'EARLY_STAGE';
  // Invalidation must sit below the current price: EMA50 when price is above it, else the 20d low.
  const invalidation = n.aboveE50 && n.ema50 !== null ? n.ema50 : n.lo20 !== null && n.lo20 < f.price ? n.lo20 : n.ema50 !== null && n.ema50 < f.price ? n.ema50 : null;
  return { symbol: f.symbol, stage, score, signals: sig, penalties: pen, triggerLevel: n.hi20, invalidationLevel: invalidation, themeBoost };
}
