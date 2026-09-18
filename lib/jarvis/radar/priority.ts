/**
 * Research-priority engine. NOT a trading score — it ranks what deserves a human look.
 * Every classification carries reasons. Bad/stale data can never create a candidate.
 */
import type { Features, OpportunityType, RejectionReason, ResearchStatus, Scored } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const f1 = (n: number | null | undefined, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : n.toFixed(d));
const sgn = (n: number) => (n > 0 ? '+' : '');

export interface MarketContext { cryptoBreadth24h: number | null; altMedian24h: number | null; equityBreadthPct: number | null; spyRet1: number | null }

export function scoreAsset(f: Features, ctx?: MarketContext): Scored {
  const comp: Record<string, number> = {};
  const reasons: string[] = [], confirming: string[] = [], conflicting: string[] = [];
  const up = f.ret1 >= 0;
  const moveAtr = f.moveAtr ?? (f.atrPct ? f.ret1 / f.atrPct : 0);
  const bigMove = Math.abs(moveAtr) >= 1.5 || Math.abs(f.ret1) >= 4;

  // 1. Change significance (0-20): move in ATR units + count of NEW_* flags
  const flagN = f.flags.filter((x) => x.startsWith('NEW_')).length;
  comp.change = clamp(Math.abs(moveAtr) * 6, 0, 12) + clamp(flagN * 3, 0, 8);
  if (Math.abs(moveAtr) >= 1) reasons.push(`${sgn(f.ret1)}${f1(f.ret1, 2)}% = ${f1(Math.abs(moveAtr))} ATR move`);
  if (flagN) reasons.push(`flags: ${f.flags.join(', ')}`);

  // 2. Volume confirmation (0-18)
  if (f.volRatio === null) { comp.volume = 0; conflicting.push('volume history unavailable — cannot confirm participation'); }
  else {
    comp.volume = clamp((f.volRatio - 0.8) * 10, 0, 18);
    if (f.volRatio >= 1.8) confirming.push(`volume ${f1(f.volRatio)}× 20d avg (${f1(f.volPctile60, 0)}th pct of 60d)`);
    else if (f.volRatio < 0.8) conflicting.push(`volume only ${f1(f.volRatio)}× 20d avg — move not confirmed by participation`);
  }

  // 3. Technical structure (0-18)
  let s = 0;
  const n = f.now;
  if (n.aboveE20 && n.aboveE50) s += 6; else if (n.aboveE50) s += 3;
  if (n.e20AboveE50) s += 3;
  if (n.aboveE200) s += 3;
  if (n.atHi20 || (f.distToHi20Pct !== null && f.distToHi20Pct > -2)) s += 4;
  if (f.flags.includes('NEW_TREND_RECLAIM') || f.flags.includes('NEW_BREAKOUT')) s += 2;
  if (!up) { // for down moves, structure score reflects breakdown quality (for DETERIORATING classification)
    s = 0;
    if (n.aboveE50 === false) s += 6; if (n.e20AboveE50 === false) s += 3; if (n.atLo20) s += 4; if (f.flags.includes('NEW_TREND_LOSS')) s += 3;
  }
  comp.structure = clamp(s, 0, 18);
  if (up && n.aboveE20 && n.aboveE50 && n.e20AboveE50) confirming.push('daily structure aligned (close > EMA20 > EMA50)');
  if (up && n.aboveE50 === false) conflicting.push(`still below 50d EMA (${f1(n.ema50, 2)}) — move inside a downtrend`);
  if (up && n.aboveE200 === false && n.ema200 !== null) conflicting.push('below 200d EMA');

  // 4. Relative strength (0-14)
  let r = 0;
  if (f.rsBench5 !== null) {
    r += clamp(f.rsBench5 * 1.5 * (up ? 1 : -1), 0, 8);
    if (f.rsBenchDelta !== null && (up ? f.rsBenchDelta > 0 : f.rsBenchDelta < 0)) r += clamp(Math.abs(f.rsBenchDelta), 0, 6);
    if (up && f.rsBench5 > 2) confirming.push(`RS vs ${f.benchmark} 5d ${sgn(f.rsBench5)}${f1(f.rsBench5)}pp${f.rsBenchDelta !== null ? ` (Δ ${sgn(f.rsBenchDelta)}${f1(f.rsBenchDelta)})` : ''}`);
    if (up && f.rsBench5 < -1) conflicting.push(`lagging ${f.benchmark} over 5d (${f1(f.rsBench5)}pp)`);
  }
  comp.relativeStrength = clamp(r, 0, 14);

  // 5. Sector / theme confirmation (0-8)
  if (f.sectorEtf && f.rsSector5 !== null) {
    comp.sector = up ? (f.rsSector5 > 0 ? 5 : 1) : (f.rsSector5 < 0 ? 5 : 1);
    if (f.crypto) comp.sector = 0;
  } else if (f.crypto) {
    const cat = f.crypto.categories.length ? 4 : 0; comp.sector = cat;
  } else { comp.sector = 0; conflicting.push('sector unmapped — sector confirmation unavailable'); }

  // 6. Multi-timeframe alignment (0-8)
  const signs = [f.ret1, f.ret5, f.ret20].filter((x): x is number => x !== null).map(Math.sign);
  const aligned = signs.length === 3 && signs.every((x) => x === signs[0]);
  comp.mtf = aligned ? 8 : signs.length >= 2 && signs[0] === signs[1] ? 4 : 0;
  if (aligned) confirming.push(`1d/5d/20d all ${up ? 'positive' : 'negative'} (${f1(f.ret5)}% / ${f1(f.ret20)}%)`);
  else if (f.ret20 !== null && Math.sign(f.ret20) !== Math.sign(f.ret1)) conflicting.push(`20d trend (${sgn(f.ret20)}${f1(f.ret20)}%) opposes the overnight move`);

  // 7. Catalyst quality (0-8)
  const news = f.catalysts.filter((c) => c.type === 'NEWS'), filings = f.catalysts.filter((c) => c.type === 'SEC_FILING');
  comp.catalyst = clamp(news.length * 3 + filings.length * 1 + (f.earningsInDays !== null && f.earningsInDays <= 7 && f.earningsInDays >= -1 ? 2 : 0), 0, 8);
  if (news.length) confirming.push(`${news.length} news catalyst(s) in window: "${news[0].headline.slice(0, 90)}"`);
  if (f.earningsInDays !== null && f.earningsInDays >= 0 && f.earningsInDays <= 7) conflicting.push(`earnings in ${f.earningsInDays}d (${f.earningsDate}) — event risk`);

  // 8. Liquidity (0-6)
  if (f.crypto) comp.liquidity = f.crypto.volume24h !== null ? (f.crypto.volume24h > 50e6 ? 6 : f.crypto.volume24h > 10e6 ? 3 : 0) : 0;
  else comp.liquidity = f.dollarVol20 === null ? 2 : f.dollarVol20 > 50e6 ? 6 : f.dollarVol20 > 10e6 ? 4 : f.dollarVol20 > 2e6 ? 2 : 0;
  if (!f.crypto && f.dollarVol20 !== null && f.dollarVol20 < 5e6) conflicting.push(`thin: ~$${(f.dollarVol20 / 1e6).toFixed(1)}M/day average`);
  if (f.crypto && f.crypto.volume24h !== null && f.crypto.volume24h < 10e6) conflicting.push(`thin: $${(f.crypto.volume24h / 1e6).toFixed(1)}M 24h volume`);

  // 9. Derivatives (crypto only, 0-5)
  comp.derivatives = 0;
  if (f.crypto) {
    const fr = f.crypto.fundingMedianPct;
    if (fr !== null) { if (Math.abs(fr) <= 0.03) { comp.derivatives = 4; confirming.push(`funding neutral (${fr.toFixed(4)}%/interval, ${f.crypto.fundingVenues} venues)`); } else if (Math.abs(fr) > 0.08) conflicting.push(`funding crowded (${fr.toFixed(4)}%/interval)`); else comp.derivatives = 2; }
    if (f.crypto.oiChangePct !== null && Math.abs(f.crypto.oiChangePct) > 5) { comp.derivatives += 1; confirming.push(`OI ${sgn(f.crypto.oiChangePct)}${f1(f.crypto.oiChangePct)}% vs prior snapshot`); }
  }

  // 10. Signal freshness (0-5): the change happened on the last bar, not days ago
  comp.freshness = flagN ? 5 : Math.abs(moveAtr) >= 1 ? 3 : 0;

  // Penalties
  let penalty = 0;
  // Broad-rally beta: when most of the class is up, a move that merely tracks the median is not new information.
  if (up && f.crypto && ctx && (ctx.cryptoBreadth24h ?? 0) >= 75 && ctx.altMedian24h !== null && ctx.altMedian24h > 2 && f.ret1 < ctx.altMedian24h * 2.5) { penalty += 10; conflicting.push(`in line with a broad alt rally (${f1(ctx.cryptoBreadth24h, 0)}% up, median ${sgn(ctx.altMedian24h)}${f1(ctx.altMedian24h)}%) — beta, not alpha`); }
  if (up && !f.crypto && ctx && (ctx.equityBreadthPct ?? 0) >= 70 && ctx.spyRet1 !== null && ctx.spyRet1 > 0.8 && f.ret1 < ctx.spyRet1 * 2.5) { penalty += 8; conflicting.push(`in line with a broad market up-day (${f1(ctx.equityBreadthPct, 0)}% up, SPY ${sgn(ctx.spyRet1)}${f1(ctx.spyRet1, 2)}%)`); }
  const parabolic = Math.abs(moveAtr) >= 5 || Math.abs(f.ret1) >= 30;
  if (parabolic) { penalty += 25; conflicting.push(`parabolic: ${sgn(f.ret1)}${f1(f.ret1)}% in one session (${f1(Math.abs(moveAtr))} ATR) — late, not early`); }
  if (f.extensionAtr !== null && up && f.extensionAtr > 3) { penalty += 10; conflicting.push(`extended: ${f1(f.extensionAtr)} ATR above EMA20`); }
  if (f.ret5Atr !== null && up && f.ret5Atr > 4) { penalty += 6; conflicting.push(`5d move already ${f1(f.ret5Atr)}× daily ATR%`); }
  if (f.rsi !== null && up && f.rsi > 80) { penalty += 5; conflicting.push(`RSI ${f1(f.rsi, 0)} — overbought`); }
  if (f.flags.includes('NEW_MOMENTUM_DIVERGENCE')) { penalty += 5; conflicting.push('new high with falling RSI — momentum divergence'); }
  if (!f.dataQuality.fresh) penalty += 100;
  if (f.dataQuality.ohlc === 'close_only') penalty += 4;
  if (f.barCount < 60) penalty += 5;
  comp.penalty = -penalty;

  const raw = Object.values(comp).reduce((a, b) => a + b, 0);
  const score = clamp(Math.round(raw), 0, 100);

  // Setup score (has NOT moved much yet, but is coiling / improving)
  let setup = 0;
  const quiet = Math.abs(moveAtr) < 1 && Math.abs(f.ret1) < 3 && (f.ret5Atr === null || Math.abs(f.ret5Atr) < 2.5) && (f.ret5 === null || Math.abs(f.ret5) < 8);
  if (quiet && f.dataQuality.fresh) {
    if (f.squeeze) setup += 22;
    if (f.consolidationTight) setup += 10;
    if (f.rsBenchDelta !== null && f.rsBenchDelta > 0.5) setup += 12;
    if (f.rsBench5 !== null && f.rsBench5 > 0) setup += 6;
    if (f.accumRatio !== null && f.accumRatio > 1.2) setup += 14;
    if (f.flags.includes('NEW_TREND_RECLAIM')) setup += 12;
    if (f.distToHi20Pct !== null && f.distToHi20Pct > -3 && !n.atHi20) setup += 12;
    if (f.adx !== null && f.adxPrev5 !== null && f.adx < 25 && f.adx > f.adxPrev5 + 2) setup += 8;
    if (f.rsi !== null && f.rsiPrev5 !== null && f.rsi > f.rsiPrev5 && f.rsi >= 45 && f.rsi <= 65) setup += 6;
    if (n.aboveE50) setup += 6;
    if (f.macdHist !== null && f.macdHistPrev !== null && f.macdHist > f.macdHistPrev && f.macdHist < 0) setup += 5;
    if (f.dataQuality.volume === 'unavailable') setup -= 10;
    if (f.dataQuality.ohlc === 'close_only') setup -= 8;
  }
  const setupScore = clamp(Math.round(setup), 0, 100);

  // Classification
  const illiquid = f.crypto ? (f.crypto.volume24h ?? 0) < 5e6 || (f.crypto.marketCap ?? 0) < 50e6 : f.dollarVol20 !== null && f.dollarVol20 < 5e6;
  if (illiquid) conflicting.push('below liquidity floor — capped at WATCH');
  const weakFlags = f.flags.filter((x) => ['NEW_TREND_LOSS', 'NEW_BREAKDOWN', 'NEW_RELATIVE_WEAKNESS', 'NEW_LOW', 'MACD_FLIP_DOWN', 'RSI_REGIME_DOWN'].includes(x));
  const priorStrong = (f.prev.ret20 !== null && f.prev.ret20 > 8) || (f.prev.aboveE50 === true && f.prev.e20AboveE50 === true);
  const weakening = weakFlags.length > 0 || (f.ret5Atr !== null && f.ret5Atr < -1.5);
  let status: ResearchStatus;
  if (!f.dataQuality.fresh) { status = 'IGNORE'; reasons.push('stale bar — excluded by data-quality rule'); }
  else if (!up && ((priorStrong && weakening) || (weakFlags.length >= 2 && score >= 50) || (weakFlags.length >= 1 && score >= 65 && (f.volRatio ?? 0) >= 1.3))) { status = 'DETERIORATING'; reasons.push(priorStrong ? `former leader (20d ${sgn(f.prev.ret20 ?? 0)}${f1(f.prev.ret20)}%) now ${weakFlags.join('/') || 'fading'}` : `structural weakness: ${weakFlags.join('/')}`); }
  else if (bigMove && (parabolic || score < 45 || (f.volRatio !== null && f.volRatio < 1.0) || (up && n.aboveE50 === false && !f.flags.includes('NEW_TREND_RECLAIM')))) { status = 'LOW_QUALITY_MOVE'; reasons.push(parabolic ? 'parabolic move — already extended' : 'large move without quality confirmation'); }
  else if (up && score >= 68 && confirming.length >= 2 && !illiquid) status = 'HIGH_RESEARCH_PRIORITY';
  else if (up && score >= 54 && !illiquid) status = 'INVESTIGATE';
  else if (up && (score >= 40 || setupScore >= 45)) status = 'WATCH';
  else if (!up && bigMove) { status = 'LOW_QUALITY_MOVE'; reasons.push('down move without prior leadership — not a rotation signal'); }
  else status = 'IGNORE';

  const rejection: RejectionReason[] = [];
  if (status === 'LOW_QUALITY_MOVE' || status === 'IGNORE') {
    if (!f.dataQuality.fresh) rejection.push('STALE_PRINT');
    if (parabolic) rejection.push('PARABOLIC');
    else if ((f.extensionAtr ?? 0) > 3 || (f.ret5Atr ?? 0) > 4) rejection.push('TOO_EXTENDED');
    if (illiquid) rejection.push('THIN_LIQUIDITY');
    if (f.volRatio !== null && f.volRatio < 1.0) rejection.push('NO_VOLUME_CONFIRMATION');
    if (up && n.aboveE50 === false && !f.flags.includes('NEW_TREND_RECLAIM')) rejection.push('DOWNTREND_RALLY');
    if (up && f.rsBench5 !== null && f.rsBench5 < -1) rejection.push('WEAK_RELATIVE_STRENGTH');
    if (f.sectorEtf && f.rsSector5 !== null && (up ? f.rsSector5 < -2 : f.rsSector5 > 2)) rejection.push('SECTOR_NOT_CONFIRMING');
    if (f.crypto?.fundingMedianPct !== null && f.crypto?.fundingMedianPct !== undefined && Math.abs(f.crypto.fundingMedianPct) > 0.08) rejection.push('CROWDED_DERIVATIVES');
    if (conflicting.some((c) => c.startsWith('in line with a broad'))) rejection.push('BETA_ONLY');
    if (!up && bigMove && !priorStrong) rejection.push('NO_PRIOR_LEADERSHIP');
    if (f.dataQuality.ohlc === 'close_only' && f.barCount < 60) rejection.push('DATA_QUALITY');
    if (bigMove && !f.catalysts.some((c) => c.type !== 'SEC_FILING') && !rejection.length) rejection.push('NO_CATALYST');
    if (!rejection.length) rejection.push(bigMove ? 'NO_CATALYST' : 'WEAK_RELATIVE_STRENGTH');
  }

  return { f, score, setupScore, status, opportunityType: classifyType(f, status, bigMove), reasons, confirming, conflicting, components: comp, bigMove, rejection };
}

function classifyType(f: Features, status: ResearchStatus, bigMove: boolean): OpportunityType | null {
  const n = f.now, fl = f.flags;
  if (status === 'DETERIORATING') return fl.includes('NEW_BREAKDOWN') ? 'BREAKDOWN' : 'DETERIORATING_LEADER';
  if (f.prev.atHi20 && f.ret1 < 0 && n.hi20 !== null && f.price < n.hi20) return 'FAILED_BREAKOUT';
  if (status === 'IGNORE' || status === 'LOW_QUALITY_MOVE') return null;
  if (fl.includes('NEW_SQUEEZE_RELEASE')) return 'SQUEEZE_RELEASE';
  if (fl.includes('NEW_BREAKOUT') && (f.volRatio ?? 0) >= 1.5) return 'BREAKOUT_CONFIRMATION';
  if (fl.includes('NEW_BREAKOUT') || fl.includes('NEW_HIGH')) return 'EARLY_BREAKOUT';
  if (fl.includes('NEW_TREND_RECLAIM')) return 'TREND_RECLAIM';
  if (f.catalysts.some((c) => c.type === 'NEWS') && bigMove) return 'CATALYST_MOVE';
  if (fl.includes('NEW_VOLATILITY_EXPANSION') && bigMove) return 'VOLATILITY_EXPANSION';
  if (f.rsi !== null && f.rsiPrev5 !== null && f.rsiPrev5 < 32 && f.rsi > f.rsiPrev5 + 5 && f.ret1 > 0) return 'OVERSOLD_RECOVERY';
  if (fl.includes('NEW_RELATIVE_STRENGTH') || (f.rsBench5 !== null && f.rsBench5 > 3 && f.rsBench20 !== null && f.rsBench20 > 3)) return 'RELATIVE_STRENGTH_LEADER';
  if (f.crypto && f.crypto.categories.length && f.ret1 > 2) return 'CRYPTO_ROTATION';
  if (fl.includes('NEW_MOMENTUM_ACCELERATION') && n.aboveE20 && n.aboveE50) return 'MOMENTUM_CONTINUATION';
  if (f.ret1 < 0 && f.ret20 !== null && f.ret20 < -10 && f.rsi !== null && f.rsi < 35) return 'REVERSAL_WATCH';
  return null;
}
