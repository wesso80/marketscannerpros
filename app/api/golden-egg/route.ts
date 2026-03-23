/**
 * Golden Egg Live Data API
 *
 * GET /api/golden-egg?symbol=AAPL
 *
 * Fetches live market data from scanner/options/time/macro/MPE sources
 * and transforms it into the GoldenEggPayload format for the decision framework.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import {
  detectAssetClass,
  fetchPrice,
  fetchIndicators,
  fetchOptionsSnapshot,
  fetchCryptoDerivatives,
  fetchMPE,
  fetchTimeConfluence,
  fetchMacroRegime,
  type Indicators,
  type OptionsSnapshot,
  type CryptoDerivatives,
  type TimeConfluenceData,
  type MacroRegime,
} from '@/lib/goldenEggFetchers';
import { computeDVE } from '@/lib/directionalVolatilityEngine';
import type { DVEInput, DVEReading } from '@/lib/directionalVolatilityEngine.types';
import { classifyBestDoctrine, type ClassifierInput } from '@/lib/doctrine/classifier';
import { recordSignal, type RecordSignalParams } from '@/lib/signalRecorder';
import type { GoldenEggPayload, Permission, Direction, Verdict } from '@/src/features/goldenEgg/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── In-memory cache (3 min) ─────────────────────────────────────────────
const cache = new Map<string, { data: GoldenEggPayload; ts: number }>();
const CACHE_TTL = 3 * 60 * 1000;

// ── Score → Grade ───────────────────────────────────────────────────────
function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

// ── Build GoldenEggPayload from live data ───────────────────────────────
function buildPayload(
  symbol: string,
  assetClass: 'equity' | 'crypto' | 'forex',
  price: { price: number; change: number; changePct: number; high: number; low: number; volume: number; avgVolume?: number; historicalCloses: number[]; historicalHighs?: number[]; historicalLows?: number[] },
  ind: Indicators | null,
  opts: OptionsSnapshot | null,
  mpe: { composite: number; time: number; volatility: number; liquidity: number; options: number } | null,
  tfLabel: string = '1D',
  cryptoDerivs: CryptoDerivatives | null = null,
  tcData: TimeConfluenceData | null = null,
  macroRegime: MacroRegime | null = null,
): GoldenEggPayload {
  const p = price.price;
  const atr = ind?.atr ?? (price.high - price.low);
  const atrPct = p > 0 ? (atr / p) * 100 : 0;

  // ── Layer 1: Decision Permission ──────────────────────────────────
  // Score breakdown: Structure (30%), Flow (25%), Momentum (20%), Risk (25%)
  const structureScore = computeStructureScore(ind, price);
  const flowScore = computeFlowScore(opts, mpe);
  const momentumScore = computeMomentumScore(ind, price);
  const riskScore = computeRiskScore(ind, price, mpe);

  const weightedScore = structureScore * 0.30 + flowScore * 0.25 + momentumScore * 0.20 + riskScore * 0.25;
  const confidence = Math.max(1, Math.min(99, Math.round(weightedScore)));
  const grade = scoreToGrade(confidence);

  // Direction from momentum indicators
  let bullish = 0; let bearish = 0;
  if (ind?.rsi != null) { if (ind.rsi > 55) bullish++; else if (ind.rsi < 45) bearish++; }
  if (ind?.macd != null) { if (ind.macd > 0) bullish++; else bearish++; }
  if (ind?.macdHist != null) { if (ind.macdHist > 0) bullish++; else bearish++; }
  if (price.changePct > 1) bullish++; else if (price.changePct < -1) bearish++;
  if (opts) { if (opts.putCallRatio < 0.8) bullish++; else if (opts.putCallRatio > 1.2) bearish++; }

  const direction: Direction = bullish > bearish + 1 ? 'LONG' : bearish > bullish + 1 ? 'SHORT' : 'NEUTRAL';

  // Permission
  let permission: Permission = 'WATCH';
  if (confidence >= 70 && direction !== 'NEUTRAL') permission = 'TRADE';
  else if (confidence < 40) permission = 'NO_TRADE';

  // Macro regime override: RISK_OFF downgrades TRADE → WATCH
  if (macroRegime?.riskState === 'risk_off' && permission === 'TRADE') {
    permission = 'WATCH';
  }

  // Flip conditions
  const flipConditions: GoldenEggPayload['layer1']['flipConditions'] = [];
  if (permission !== 'TRADE') {
    if (macroRegime?.riskState === 'risk_off') flipConditions.push({ id: 'f5', text: `Macro regime is RISK_OFF (${macroRegime.concerns.join(', ')}) — wait for macro environment to improve`, severity: 'must' });
    if (structureScore < 60) flipConditions.push({ id: 'f1', text: `Price needs to reclaim ${direction === 'SHORT' ? 'below' : 'above'} key moving averages`, severity: 'must' });
    if (flowScore < 50 && opts) flipConditions.push({ id: 'f2', text: `Options flow needs to confirm direction (P/C currently ${opts.putCallRatio.toFixed(2)})`, severity: 'should' });
    if (momentumScore < 50) flipConditions.push({ id: 'f3', text: `RSI needs to move ${direction === 'SHORT' ? 'below 45' : 'above 55'} to confirm momentum`, severity: 'must' });
    if (mpe && mpe.composite < 50) flipConditions.push({ id: 'f4', text: `Market pressure composite needs to reach 50+ (currently ${mpe.composite.toFixed(0)})`, severity: 'should' });
    if (flipConditions.length === 0) flipConditions.push({ id: 'f0', text: 'Overall score below threshold — waiting for improved confluence', severity: 'must' });
  }

  // Primary driver / blocker
  const sortedScores = [
    { key: 'Structure', val: structureScore },
    { key: 'Flow', val: flowScore },
    { key: 'Momentum', val: momentumScore },
    { key: 'Risk', val: riskScore },
  ].sort((a, b) => b.val - a.val);

  const primaryDriver = `${sortedScores[0].key} leads at ${sortedScores[0].val.toFixed(0)}/100 — ${describeScore(sortedScores[0].key, sortedScores[0].val, ind, opts, price)}`;
  const weakest = sortedScores[sortedScores.length - 1];
  const primaryBlocker = weakest.val < 55 ? `${weakest.key} holding back at ${weakest.val.toFixed(0)}/100` : undefined;

  // CTA
  const cta: GoldenEggPayload['layer1']['cta'] = permission === 'TRADE'
    ? { primary: 'OPEN_SCANNER', secondary: opts ? 'OPEN_OPTIONS' : 'OPEN_TIME' }
    : { primary: 'SET_ALERT', secondary: 'OPEN_TIME' };

  // ── Layer 2: Setup & Execution ────────────────────────────────────
  const setupType = determineSetupType(ind, price, atrPct);
  const keyLevels = buildKeyLevels(p, ind, opts, atr, tcData);

  // Entry / stop / targets
  const isLong = direction === 'LONG' || (direction === 'NEUTRAL' && bullish >= bearish);

  // Cap ATR-based distances to prevent absurd targets on volatile / low-priced assets
  const maxStopPct = 0.15; // max 15% stop distance
  const rawStopDist = atr * 1.5;
  const stopDistance = Math.min(rawStopDist, p * maxStopPct);
  const stopPrice = isLong ? p - stopDistance : p + stopDistance;

  // Use decompression target from time confluence if available and directionally aligned
  const decompTarget = tcData?.decompressionTarget;
  const decompAligned = decompTarget && decompTarget.price > 0 &&
    ((isLong && decompTarget.direction === 'up' && decompTarget.price > p) ||
     (!isLong && decompTarget.direction === 'down' && decompTarget.price < p));

  // Build targets: cap each at reasonable % from current price
  const maxTargetPct = 0.30; // max 30% from current price per target
  const capTarget = (raw: number) => {
    if (isLong) return Math.min(raw, p * (1 + maxTargetPct));
    return Math.max(raw, p * (1 - maxTargetPct));
  };
  const t1Raw = isLong ? p + stopDistance * (2 / 3) : p - stopDistance * (2 / 3);
  const t2Raw = decompAligned ? decompTarget!.price : (isLong ? p + stopDistance * (4 / 3) : p - stopDistance * (4 / 3));
  const t3Raw = isLong ? p + stopDistance * 2 : p - stopDistance * 2;
  const t1 = capTarget(t1Raw);
  const t2 = capTarget(t2Raw);
  const t3 = capTarget(t3Raw);
  const rr = stopDistance > 0 ? (Math.abs(t2 - p)) / stopDistance : 0;

  // Timeframe alignment from MPE time pressure
  const tfScore = mpe ? Math.min(4, Math.round(mpe.time / 25)) : 2;
  const tfDetails: string[] = [];
  if (ind?.sma50 != null && ind.sma20 != null) {
    if ((isLong && p > ind.sma50) || (!isLong && p < ind.sma50)) tfDetails.push('Daily structure aligned');
    else tfDetails.push('Daily structure opposing');
  }
  if (ind?.macdHist != null) {
    tfDetails.push(ind.macdHist > 0 ? 'MACD histogram positive' : 'MACD histogram negative');
  }
  if (mpe) {
    if (mpe.time >= 50) tfDetails.push('Time confluence active');
    if (mpe.volatility >= 50) tfDetails.push('Volatility pressure building');
  }

  // ── Layer 3: Evidence Stack ───────────────────────────────────────
  // Structure verdict
  const structureVerdict: Verdict = structureScore >= 65 ? 'agree' : structureScore >= 45 ? 'neutral' : 'disagree';
  const trendHTF = ind?.sma50 != null ? (p > ind.sma50 ? 'Bullish' : 'Bearish') : 'Unknown';
  const trendMTF = ind?.sma20 != null ? (p > ind.sma20 ? 'Bullish' : 'Bearish') : 'Unknown';
  const trendLTF = price.changePct > 0.5 ? 'Bullish' : price.changePct < -0.5 ? 'Bearish' : 'Consolidating';

  let volRegime: 'compression' | 'neutral' | 'transition' | 'expansion' | 'climax' =
    ind?.bbUpper && ind?.bbLower && ind?.bbMiddle
      ? ((ind.bbUpper - ind.bbLower) / ind.bbMiddle * 100 < 8 ? 'compression' : 'expansion')
      : atrPct < 2 ? 'compression' : atrPct > 5 ? 'expansion' : 'neutral';

  // DVE computation (safe — uses already-fetched data)
  let dveReading: DVEReading | null = null;
  try {
    const stochK = ind?.stochK ?? null;
    const stochD = ind?.stochD ?? null;
    const dveInput: DVEInput = {
      price: {
        closes: price.historicalCloses,
        highs: price.historicalHighs,
        lows: price.historicalLows,
        currentPrice: p,
        changePct: price.changePct,
        volume: price.volume,
        avgVolume: price.avgVolume,
      },
      indicators: ind ? {
        macd: ind.macd,
        macdHist: ind.macdHist,
        macdSignal: ind.macdSignal,
        adx: ind.adx,
        atr: ind.atr,
        sma20: ind.sma20,
        sma50: ind.sma50,
        bbUpper: ind.bbUpper,
        bbMiddle: ind.bbMiddle,
        bbLower: ind.bbLower,
        stochK,
        stochD,
        stochMomentum: (stochK != null && stochD != null) ? stochK - stochD : null,
        inSqueeze: ind.inSqueeze,
        squeezeStrength: ind.squeezeStrength,
      } : undefined,
      options: opts ? {
        putCallRatio: opts.putCallRatio,
        ivRank: opts.ivRank,
        dealerGamma: opts.dealerGamma,
        maxPain: opts.maxPain,
        highestOICallStrike: opts.highestOICallStrike,
        highestOIPutStrike: opts.highestOIPutStrike,
      } : undefined,
      mpeComposite: mpe?.composite,
    };
    dveReading = computeDVE(dveInput, symbol);
    // Use DVE engine's BBWP-based regime instead of crude BB width heuristic
    volRegime = dveReading.volatility.regime;
  } catch { /* DVE is additive — failure is non-fatal */ }

  // Options / Derivatives evidence
  let optionsEvidence: GoldenEggPayload['layer3']['options'];
  if (opts) {
    optionsEvidence = {
      enabled: true,
      verdict: opts.sentiment === 'Bullish' && isLong ? 'agree' : opts.sentiment === 'Bearish' && !isLong ? 'agree' : opts.sentiment === 'Neutral' ? 'neutral' : 'disagree',
      highlights: [
        { label: 'Put/Call OI', value: opts.putCallRatio.toFixed(2) },
        { label: 'IV Rank', value: `${opts.ivRank.toFixed(0)}%` },
        { label: 'Dealer Gamma', value: opts.dealerGamma },
        { label: 'Unusual Activity', value: opts.unusualActivity },
        { label: 'Max Pain', value: `$${opts.maxPain.toFixed(2)}` },
      ],
      notes: [
        opts.unusualActivity !== 'Normal' ? `Unusual options activity detected (${opts.unusualActivity})` : 'Options flow appears normal',
      ],
    };
  } else if (cryptoDerivs) {
    const fmtOI = cryptoDerivs.totalOpenInterest >= 1e9
      ? `$${(cryptoDerivs.totalOpenInterest / 1e9).toFixed(2)}B`
      : cryptoDerivs.totalOpenInterest >= 1e6
        ? `$${(cryptoDerivs.totalOpenInterest / 1e6).toFixed(1)}M`
        : `$${cryptoDerivs.totalOpenInterest.toLocaleString()}`;
    const fmtVol = cryptoDerivs.volume24h >= 1e9
      ? `$${(cryptoDerivs.volume24h / 1e9).toFixed(2)}B`
      : cryptoDerivs.volume24h >= 1e6
        ? `$${(cryptoDerivs.volume24h / 1e6).toFixed(1)}M`
        : `$${cryptoDerivs.volume24h.toLocaleString()}`;
    const derivVerdict: Verdict = cryptoDerivs.sentiment === 'Bullish' && isLong ? 'agree'
      : cryptoDerivs.sentiment === 'Bearish' && !isLong ? 'agree'
      : cryptoDerivs.sentiment === 'Neutral' ? 'neutral' : 'disagree';
    optionsEvidence = {
      enabled: true,
      verdict: derivVerdict,
      highlights: [
        { label: 'Funding Rate', value: `${cryptoDerivs.fundingRatePercent >= 0 ? '+' : ''}${cryptoDerivs.fundingRatePercent.toFixed(4)}%` },
        { label: 'Annualized', value: `${cryptoDerivs.annualizedFunding >= 0 ? '+' : ''}${cryptoDerivs.annualizedFunding.toFixed(1)}%` },
        { label: 'Open Interest', value: fmtOI },
        { label: 'Perp Volume 24h', value: fmtVol },
        { label: 'Exchanges', value: `${cryptoDerivs.exchanges}` },
      ],
      notes: [
        cryptoDerivs.fundingRatePercent > 0.03 ? 'Positive funding — longs paying shorts (bullish crowding)' :
        cryptoDerivs.fundingRatePercent < -0.01 ? 'Negative funding — shorts paying longs (bearish crowding)' :
        'Funding rate neutral — no significant positioning bias',
      ],
    };
  }

  // Momentum evidence
  const momentumVerdict: Verdict = momentumScore >= 65 ? 'agree' : momentumScore >= 45 ? 'neutral' : 'disagree';
  const momentumIndicators: GoldenEggPayload['layer3']['momentum']['indicators'] = [];
  if (ind?.rsi != null) momentumIndicators.push({ name: 'RSI(14)', value: ind.rsi.toFixed(1), state: ind.rsi > 55 ? 'bull' : ind.rsi < 45 ? 'bear' : 'neutral' });
  if (ind?.adx != null) momentumIndicators.push({ name: 'ADX', value: ind.adx.toFixed(0), state: ind.adx > 25 ? 'bull' : 'neutral' });
  if (ind?.macdHist != null) momentumIndicators.push({ name: 'MACD Hist', value: ind.macdHist.toFixed(3), state: ind.macdHist > 0 ? 'bull' : 'bear' });
  if (ind?.stochK != null) momentumIndicators.push({ name: 'Stochastic', value: ind.stochK.toFixed(0), state: ind.stochK > 80 ? 'bear' : ind.stochK < 20 ? 'bull' : 'neutral' });

  // Internals (MPE pressures)
  const internals: GoldenEggPayload['layer3']['internals'] = mpe ? {
    enabled: true,
    verdict: mpe.composite >= 60 ? 'agree' : mpe.composite >= 40 ? 'neutral' : 'disagree',
    items: [
      { name: 'MPE Composite', value: `${mpe.composite.toFixed(0)}/100`, state: mpe.composite >= 60 ? 'bull' : mpe.composite < 40 ? 'bear' : 'neutral' },
      { name: 'Time Pressure', value: `${mpe.time.toFixed(0)}`, state: mpe.time >= 50 ? 'bull' : 'neutral' },
      { name: 'Vol Pressure', value: `${mpe.volatility.toFixed(0)}`, state: mpe.volatility >= 50 ? 'bull' : 'neutral' },
      { name: 'Liquidity Pressure', value: `${mpe.liquidity.toFixed(0)}`, state: mpe.liquidity >= 50 ? 'bull' : 'neutral' },
    ],
  } : undefined;

  // Narrative — incorporate ALL engines: structure, options, MPE, time confluence, DVE, derivatives
  const narrativeBullets: string[] = [];
  if (permission === 'TRADE') narrativeBullets.push('Multiple factors aligned — conditions support scenario analysis.');
  if (structureScore >= 70) narrativeBullets.push('Price structure supports the directional thesis.');
  if (opts?.unusualActivity !== 'Normal' && opts) narrativeBullets.push('Options flow showing unusual activity — watch for institutional moves.');
  if (mpe && mpe.composite >= 60) narrativeBullets.push('Market pressure engine confirms building pressure.');
  // Time Confluence context
  if (tcData && tcData.signalStrength !== 'no_signal') {
    const tcDirLabel = tcData.direction === 'bullish' ? 'bullish' : tcData.direction === 'bearish' ? 'bearish' : 'neutral';
    narrativeBullets.push(`Time confluence ${tcData.signalStrength} ${tcDirLabel} — ${tcData.scoreBreakdown.activeTFs} TFs active${tcData.scoreBreakdown.hasHigherTF ? ' (higher TF confirmed)' : ''}.`);
  }
  if (tcData?.decompressionTarget && tcData.decompressionTarget.price > 0) {
    const dtDir = tcData.decompressionTarget.direction === 'up' ? 'upward' : tcData.decompressionTarget.direction === 'down' ? 'downward' : 'neutral';
    narrativeBullets.push(`Decompression target $${tcData.decompressionTarget.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${dtDir}) from ${tcData.decompressionTarget.contributingTFs.length} TF mid-50 levels.`);
  }
  if (tcData?.closeSchedule && tcData.closeSchedule.length > 0) {
    const dailyPlus = tcData.closeSchedule.filter(r => r.weight >= 10);
    if (dailyPlus.length > 0) {
      narrativeBullets.push(`${dailyPlus.length} daily+ TFs closing today (${dailyPlus.map(r => r.tf).join(', ')}) — high-weight candle closes drive price action.`);
    }
  }
  // DVE context
  if (dveReading) {
    if (dveReading.signal.type !== 'none') {
      narrativeBullets.push(`DVE ${dveReading.signal.type.replace(/_/g, ' ')} signal active at ${(dveReading.signal.strength * 100).toFixed(0)}% strength.`);
    }
    if (dveReading.volatility.regime === 'compression' && dveReading.volatility.bbwp < 20) {
      narrativeBullets.push(`Volatility compressed (BBWP ${dveReading.volatility.bbwp.toFixed(1)}) — expansion imminent.`);
    }
  }
  // Crypto derivatives context
  if (cryptoDerivs) {
    if (Math.abs(cryptoDerivs.fundingRatePercent) > 0.03) {
      narrativeBullets.push(`Funding rate ${cryptoDerivs.fundingRatePercent > 0 ? 'positive' : 'negative'} at ${cryptoDerivs.fundingRatePercent.toFixed(4)}% — ${cryptoDerivs.fundingRatePercent > 0 ? 'longs crowding' : 'shorts crowding'}.`);
    }
  }
  if (narrativeBullets.length === 0) narrativeBullets.push('Confluence is building but not yet at actionable thresholds.');

  const narrativeRisks: string[] = [];
  if (atrPct > 4) narrativeRisks.push('Elevated volatility increases stop distance and position sizing risk.');
  if (opts && opts.ivRank > 70) narrativeRisks.push('IV Rank is elevated — options premium is expensive.');
  if (mpe && mpe.composite < 40) narrativeRisks.push('Low market pressure — range-bound conditions likely.');
  if (weakest.val < 40) narrativeRisks.push(`${weakest.key} score is weak — significant blocker to thesis.`);
  // TC / DVE risks
  if (tcData && tcData.direction !== 'neutral' && direction !== 'NEUTRAL') {
    const tcIsLong = tcData.direction === 'bullish';
    if ((isLong && !tcIsLong) || (!isLong && tcIsLong)) {
      narrativeRisks.push(`Time confluence ${tcData.direction} opposes the ${direction.toLowerCase()} thesis — directional conflict.`);
    }
  }
  if (dveReading?.trap.detected) narrativeRisks.push('DVE trap detected — false breakout risk elevated.');
  if (dveReading && dveReading.exhaustion.level > 0.6) narrativeRisks.push(`Exhaustion risk ${(dveReading.exhaustion.level * 100).toFixed(0)}% — momentum may be fading.`);
  if (tcData?.candleCloseConfluence.isMonthEnd) narrativeRisks.push('Month-end rebalancing — expect irregular flows and positioning.');
  if (cryptoDerivs && cryptoDerivs.fundingRatePercent > 0.05) narrativeRisks.push('Extreme positive funding — long squeeze risk if price drops.');
  if (cryptoDerivs && cryptoDerivs.fundingRatePercent < -0.03) narrativeRisks.push('Negative funding — short squeeze risk if price rises.');
  if (narrativeRisks.length === 0) narrativeRisks.push('No major risk flags at current levels.');

  // ── Doctrine Classification ───────────────────────────────────────
  let doctrineResult: GoldenEggPayload['doctrine'] = null;
  try {
    const classifierInput: ClassifierInput = {
      dveRegime: volRegime,
      bbwp: dveReading?.volatility.bbwp ?? null,
      dveSignalType: dveReading?.signal.type !== 'none' ? dveReading?.signal.type : undefined,
      breakoutScore: dveReading?.breakout.score,
      rsi: ind?.rsi ?? null,
      macdHist: ind?.macdHist ?? null,
      adx: ind?.adx ?? null,
      stochK: ind?.stochK ?? null,
      priceVsSma20Pct: ind?.sma20 != null && p > 0 ? ((p - ind.sma20) / ind.sma20) * 100 : null,
      priceVsSma50Pct: ind?.sma50 != null && p > 0 ? ((p - ind.sma50) / ind.sma50) * 100 : null,
      volumeRatio: price.avgVolume && price.avgVolume > 0 ? price.volume / price.avgVolume : null,
      permission,
      direction,
      confidence,
      setupType,
      optionsVerdict: optionsEvidence?.verdict,
      inSqueeze: ind?.inSqueeze ?? undefined,
      structureVerdict,
      directionalBias: dveReading?.direction.bias,
      trapDetected: dveReading?.trap.detected,
      exhaustionRisk: dveReading?.exhaustion.level,
    };
    const match = classifyBestDoctrine(classifierInput);
    if (match) {
      const pb = match.playbook;
      doctrineResult = {
        id: match.doctrineId,
        label: pb.label,
        confidence: match.matchConfidence,
        regime: classifierInput.dveRegime,
        reasons: match.reasons,
        playbook: {
          description: pb.description,
          direction: pb.direction,
          category: pb.category,
          entryCriteria: pb.entryCriteria,
          riskModel: pb.riskModel,
          failureSignals: pb.failureSignals,
        },
      };
    }
  } catch { /* doctrine is additive — failure is non-fatal */ }

  return {
    meta: {
      symbol,
      assetClass,
      price: p,
      asOfTs: new Date().toISOString(),
      timeframe: tfLabel,
    },
    layer1: {
      permission,
      direction,
      confidence,
      grade,
      primaryDriver,
      primaryBlocker,
      flipConditions,
      scoreBreakdown: [
        { key: 'Structure', weight: 30, value: Math.round(structureScore), note: structureScore >= 65 ? 'Trend alignment supportive' : structureScore >= 45 ? 'Mixed structure' : 'Structure opposing' },
        { key: 'Flow', weight: 25, value: Math.round(flowScore), note: opts ? `P/C ${opts.putCallRatio.toFixed(2)}` : 'No options data' },
        { key: 'Momentum', weight: 20, value: Math.round(momentumScore), note: ind?.rsi ? `RSI ${ind.rsi.toFixed(0)}` : undefined },
        { key: 'Risk', weight: 25, value: Math.round(riskScore), note: atr ? `ATR ${atrPct.toFixed(1)}%` : undefined },
      ],
      cta,
    },
    layer2: {
      setup: {
        setupType,
        thesis: buildThesis(direction, setupType, ind, opts, mpe, symbol, tcData, dveReading),
        timeframeAlignment: { score: tfScore, max: 4, details: tfDetails },
        keyLevels,
        invalidation: `Thesis invalid if price ${isLong ? 'closes below' : 'closes above'} $${stopPrice.toFixed(2)} with volume confirmation.`,
      },
      execution: {
        entryTrigger: permission === 'TRADE'
          ? `${isLong ? 'Long scenario' : 'Short scenario'}: pullback zone near $${(isLong ? p - atr * 0.3 : p + atr * 0.3).toFixed(2)} or breakout confirmation.`
          : 'Wait for flip conditions to be met.',
        entry: { type: permission === 'TRADE' ? 'limit' : 'stop', price: permission === 'TRADE' ? p : undefined },
        stop: { price: Math.round(stopPrice * 100) / 100, logic: `${(1.5).toFixed(1)}x ATR from reference — beyond recent structure` },
        targets: [
          { price: Math.round(t1 * 100) / 100, rMultiple: stopDistance > 0 ? Math.round(Math.abs(t1 - p) / stopDistance * 10) / 10 : 1, note: 'First scale zone' },
          { price: Math.round(t2 * 100) / 100, rMultiple: stopDistance > 0 ? Math.round(Math.abs(t2 - p) / stopDistance * 10) / 10 : 2, note: decompAligned ? `Primary level — Decomp zone (${decompTarget!.contributingTFs.length} TFs)` : 'Primary level' },
          { price: Math.round(t3 * 100) / 100, rMultiple: stopDistance > 0 ? Math.round(Math.abs(t3 - p) / stopDistance * 10) / 10 : 3, note: 'Extension zone' },
        ],
        rr: { expectedR: Math.round(rr * 10) / 10, minR: 1.5 },
        sizingHint: { riskPct: confidence >= 70 ? 1.0 : confidence >= 55 ? 0.75 : 0.5 },
      },
    },
    layer3: {
      structure: {
        verdict: structureVerdict,
        trend: { htf: trendHTF, mtf: trendMTF, ltf: trendLTF },
        volatility: {
          regime: volRegime,
          atr: atr > 0 ? Math.round(atr * 100) / 100 : undefined,
          ...(dveReading ? {
            bbwp: dveReading.volatility.bbwp,
            bbwpSma5: dveReading.volatility.bbwpSma5,
            rateOfChange: dveReading.volatility.rateSmoothed,
            directionalBias: dveReading.direction.bias,
            directionalConfidence: dveReading.direction.confidence,
            contractionContinuation: dveReading.phasePersistence.contraction.continuationProbability,
            expansionContinuation: dveReading.phasePersistence.expansion.continuationProbability,
            phaseAge: dveReading.phasePersistence.contraction.active
              ? dveReading.phasePersistence.contraction.stats.currentBars
              : dveReading.phasePersistence.expansion.active
              ? dveReading.phasePersistence.expansion.stats.currentBars : undefined,
            phaseAgePercentile: dveReading.phasePersistence.contraction.active
              ? dveReading.phasePersistence.contraction.stats.agePercentile
              : dveReading.phasePersistence.expansion.active
              ? dveReading.phasePersistence.expansion.stats.agePercentile : undefined,
            signalType: dveReading.signal.type !== 'none' ? dveReading.signal.type : undefined,
            signalStrength: dveReading.signal.type !== 'none' ? dveReading.signal.strength : undefined,
            breakoutScore: dveReading.breakout.score,
            breakoutComponents: dveReading.breakout.components,
            breakoutComponentDetails: dveReading.breakout.componentDetails,
            trapDetected: dveReading.trap.detected,
            trapScore: dveReading.trap.score,
            exhaustionRisk: dveReading.exhaustion.level,
          } : {}),
        },
        liquidity: {
          overhead: ind?.bbUpper ? `BB Upper $${ind.bbUpper.toFixed(2)}` : undefined,
          below: ind?.bbLower ? `BB Lower $${ind.bbLower.toFixed(2)}` : undefined,
          note: opts?.maxPain ? `Max pain at $${opts.maxPain.toFixed(2)} — settlement gravity` : undefined,
        },
      },
      options: optionsEvidence,
      momentum: { verdict: momentumVerdict, indicators: momentumIndicators },
      internals,
      narrative: {
        enabled: true,
        summary: permission === 'TRADE'
          ? `${symbol} shows ${direction.toLowerCase()} alignment with ${confidence}/100 confluence. Multiple factors support a ${setupType} entry.${tcData?.signalStrength === 'strong' ? ` Time confluence confirms with ${tcData.direction} bias.` : ''}${dveReading?.signal.type !== 'none' && dveReading ? ` DVE ${dveReading.signal.type.replace(/_/g, ' ')} signal active.` : ''}`
          : `${symbol} is in ${permission === 'NO_TRADE' ? 'not-aligned' : 'watch'} mode. Confluence is insufficient \u2014 monitor flip conditions.${tcData && tcData.direction !== 'neutral' ? ` Time confluence leans ${tcData.direction}.` : ''}`,
        bullets: narrativeBullets,
        risks: narrativeRisks,
      },
      timeConfluence: tcData ? {
        enabled: true,
        verdict: tcData.confidence >= 65 ? 'agree' : tcData.confidence >= 40 ? 'neutral' : 'disagree',
        confidence: tcData.confidence,
        direction: tcData.direction,
        signalStrength: tcData.signalStrength,
        banners: tcData.banners,
        scoreBreakdown: tcData.scoreBreakdown,
        decompression: tcData.decompression,
        candleCloseConfluence: tcData.candleCloseConfluence,
        mid50Levels: tcData.mid50Levels,
        prediction: tcData.prediction,
        closeSchedule: tcData.closeSchedule,
        decompressionTarget: tcData.decompressionTarget,
      } : undefined,
    },
    doctrine: doctrineResult,
  };
}

// ── Scoring functions ───────────────────────────────────────────────────
function computeStructureScore(ind: Indicators | null, price: { price: number; changePct: number; historicalCloses: number[] }): number {
  let score = 50; // base
  if (!ind) return score;
  const p = price.price;
  if (ind.sma20 != null) score += p > ind.sma20 ? 10 : -10;
  if (ind.sma50 != null) score += p > ind.sma50 ? 10 : -10;
  if (ind.sma20 != null && ind.sma50 != null) score += ind.sma20 > ind.sma50 ? 8 : -8;
  if (ind.bbMiddle != null) score += p > ind.bbMiddle ? 5 : -5;
  if (ind.adx != null) score += ind.adx > 25 ? 7 : -3;
  return Math.max(0, Math.min(100, score));
}

function computeFlowScore(opts: OptionsSnapshot | null, mpe: { composite: number; time: number; volatility: number; liquidity: number; options: number } | null): number {
  let score = 50;
  if (opts) {
    if (opts.putCallRatio < 0.7) score += 15;
    else if (opts.putCallRatio < 0.9) score += 5;
    else if (opts.putCallRatio > 1.3) score -= 15;
    else if (opts.putCallRatio > 1.1) score -= 5;

    if (opts.unusualActivity === 'Very High') score += 10;
    else if (opts.unusualActivity === 'Elevated') score += 5;

    if (opts.ivRank < 30) score += 5; // cheap options = opportunity
    else if (opts.ivRank > 70) score -= 5;

    if (opts.dealerGamma.includes('Long')) score += 5;
    else if (opts.dealerGamma.includes('Short')) score -= 3;
  }
  if (mpe) {
    score += (mpe.liquidity - 50) * 0.2;
    score += (mpe.options - 50) * 0.15;
  }
  return Math.max(0, Math.min(100, score));
}

function computeMomentumScore(ind: Indicators | null, price: { changePct: number }): number {
  let score = 50;
  if (!ind) return score + (price.changePct > 0 ? 5 : -5);
  if (ind.rsi != null) {
    if (ind.rsi > 55 && ind.rsi < 70) score += 12;
    else if (ind.rsi >= 70) score += 5; // overbought is still momentum
    else if (ind.rsi < 45 && ind.rsi > 30) score -= 10;
    else if (ind.rsi <= 30) score -= 5; // oversold = potential reversal
  }
  if (ind.macd != null) score += ind.macd > 0 ? 8 : -8;
  if (ind.macdHist != null) score += ind.macdHist > 0 ? 7 : -7;
  if (ind.stochK != null) {
    if (ind.stochK > 80) score += 3;
    else if (ind.stochK < 20) score -= 3;
  }
  score += price.changePct > 2 ? 8 : price.changePct > 0 ? 3 : price.changePct < -2 ? -8 : -3;
  return Math.max(0, Math.min(100, score));
}

function computeRiskScore(ind: Indicators | null, price: { price: number; high: number; low: number }, mpe: { composite: number } | null): number {
  let score = 60; // base risk is acceptable
  const atr = ind?.atr ?? (price.high - price.low);
  const atrPct = price.price > 0 ? (atr / price.price) * 100 : 0;
  // ATR-based volatility risk
  if (atrPct > 6) score -= 20;
  else if (atrPct > 4) score -= 10;
  else if (atrPct < 1.5) score += 5;
  // ADX confirms trend = lower risk
  if (ind?.adx != null && ind.adx > 25) score += 8;
  // BB squeeze = defined risk environment
  if (ind?.bbUpper && ind?.bbLower && ind?.bbMiddle) {
    const bbW = ((ind.bbUpper - ind.bbLower) / ind.bbMiddle) * 100;
    if (bbW < 8) score += 5;
  }
  // MPE composite
  if (mpe) score += (mpe.composite - 50) * 0.15;
  return Math.max(0, Math.min(100, score));
}

// ── Helpers ─────────────────────────────────────────────────────────────
function describeScore(key: string, val: number, ind: Indicators | null, opts: OptionsSnapshot | null, price: { changePct: number }): string {
  if (key === 'Structure') return ind?.sma50 ? 'price aligned with major moving averages' : 'trend structure evaluated';
  if (key === 'Flow') return opts ? `options P/C ${opts.putCallRatio.toFixed(2)}, ${opts.unusualActivity} activity` : 'no options data available';
  if (key === 'Momentum') return ind?.rsi ? `RSI ${ind.rsi.toFixed(0)}, today ${price.changePct > 0 ? '+' : ''}${price.changePct.toFixed(1)}%` : 'momentum indicators pending';
  if (key === 'Risk') return 'risk parameters within acceptable range';
  return '';
}

function determineSetupType(ind: Indicators | null, price: { changePct: number }, atrPct: number): GoldenEggPayload['layer2']['setup']['setupType'] {
  if (ind?.bbUpper && ind?.bbLower && ind?.bbMiddle) {
    const bbW = ((ind.bbUpper - ind.bbLower) / ind.bbMiddle) * 100;
    if (bbW < 6) return 'squeeze';
  }
  if (ind?.rsi != null) {
    if (ind.rsi > 70 || ind.rsi < 30) return 'mean_reversion';
  }
  if (ind?.adx != null && ind.adx > 30 && Math.abs(price.changePct) > 2) return 'breakout';
  if (ind?.adx != null && ind.adx > 25) return 'trend';
  if (atrPct < 1.5) return 'range';
  return 'trend';
}

function buildKeyLevels(p: number, ind: Indicators | null, opts: OptionsSnapshot | null, atr: number, tcData?: TimeConfluenceData | null): GoldenEggPayload['layer2']['setup']['keyLevels'] {
  const levels: GoldenEggPayload['layer2']['setup']['keyLevels'] = [];
  if (ind?.sma20 != null) levels.push({ label: 'SMA 20', price: Math.round(ind.sma20 * 100) / 100, kind: 'pivot' });
  if (ind?.sma50 != null) levels.push({ label: 'SMA 50', price: Math.round(ind.sma50 * 100) / 100, kind: 'support' });
  if (ind?.bbUpper != null) levels.push({ label: 'BB Upper', price: Math.round(ind.bbUpper * 100) / 100, kind: 'resistance' });
  if (ind?.bbLower != null) levels.push({ label: 'BB Lower', price: Math.round(ind.bbLower * 100) / 100, kind: 'support' });
  if (opts?.maxPain) levels.push({ label: 'Max Pain', price: Math.round(opts.maxPain * 100) / 100, kind: 'value' });
  if (opts?.highestOICallStrike) levels.push({ label: 'Call Wall', price: opts.highestOICallStrike, kind: 'resistance' });
  if (opts?.highestOIPutStrike) levels.push({ label: 'Put Wall', price: opts.highestOIPutStrike, kind: 'support' });
  // Add decompression target as a value level
  if (tcData?.decompressionTarget && tcData.decompressionTarget.price > 0) {
    levels.push({ label: `Decomp Target (${tcData.decompressionTarget.contributingTFs.length} TFs)`, price: Math.round(tcData.decompressionTarget.price * 100) / 100, kind: 'value' });
  }
  // Add highest-weight close schedule mid-50 levels (daily+ only)
  if (tcData?.closeSchedule) {
    const dailyPlus = tcData.closeSchedule
      .filter(r => r.mid50Level && r.mid50Level > 0 && r.weight >= 10)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);
    for (const r of dailyPlus) {
      const kind = r.mid50Level! > p ? 'resistance' : 'support';
      levels.push({ label: `${r.tf} Mid-50`, price: Math.round(r.mid50Level! * 100) / 100, kind });
    }
  }
  // Sort by distance from current price
  levels.sort((a, b) => Math.abs(a.price - p) - Math.abs(b.price - p));
  return levels.slice(0, 7);
}

function buildThesis(dir: Direction, setup: string, ind: Indicators | null, opts: OptionsSnapshot | null, mpe: { composite: number } | null, symbol: string, tcData?: TimeConfluenceData | null, dve?: DVEReading | null): string {
  const dirWord = dir === 'LONG' ? 'bullish' : dir === 'SHORT' ? 'bearish' : 'neutral';
  const setupWord = setup === 'squeeze' ? 'volatility squeeze' : setup === 'mean_reversion' ? 'mean reversion' : setup === 'breakout' ? 'breakout' : setup === 'range' ? 'range-bound' : 'trend continuation';
  let thesis = `${symbol} shows a ${dirWord} ${setupWord} setup.`;
  if (ind?.adx != null && ind.adx > 25) thesis += ` ADX at ${ind.adx.toFixed(0)} confirms trending conditions.`;
  if (opts && opts.sentiment !== 'Neutral') thesis += ` Options flow is ${opts.sentiment.toLowerCase()} (P/C ${opts.putCallRatio.toFixed(2)}).`;
  if (mpe && mpe.composite >= 60) thesis += ` Market pressure at ${mpe.composite.toFixed(0)}/100 supports the thesis.`;
  if (tcData && tcData.signalStrength !== 'no_signal') {
    const tcDir = tcData.direction;
    thesis += ` Time confluence is ${tcDir} with ${tcData.signalStrength} signal strength.`;
  }
  if (dve && dve.signal.type !== 'none') {
    thesis += ` DVE shows ${dve.signal.type.replace(/_/g, ' ')} signal (${(dve.signal.strength * 100).toFixed(0)}% strength).`;
  }
  return thesis;
}

// ── GET handler ─────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ success: false, error: 'Please log in' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || '').trim().toUpperCase();
    if (!symbol) {
      return NextResponse.json({ success: false, error: 'Missing symbol parameter' }, { status: 400 });
    }

    const timeframe = (searchParams.get('timeframe') || 'daily').toLowerCase();
    const avIntervalMap: Record<string, string> = { '15m': '15min', '1h': '60min', 'daily': 'daily', 'weekly': 'weekly' };
    const avInterval = avIntervalMap[timeframe] || 'daily';
    const tfLabel = timeframe === '15m' ? '15m' : timeframe === '1h' ? '1H' : timeframe === 'weekly' ? '1W' : '1D';

    // Check cache (include timeframe in key)
    const cacheKey = `${symbol}_${timeframe}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ success: true, data: cached.data, cached: true });
    }

    const assetClass = detectAssetClass(symbol);

    // Fetch core data in parallel — time confluence first, then MPE uses its data
    const [priceData, tcData, macroRegime] = await Promise.all([
      fetchPrice(symbol, assetClass, { requireHistoricals: true, avInterval }),
      fetchTimeConfluence(symbol),
      fetchMacroRegime(),
    ]);

    // MPE uses tcData to avoid duplicate scanHierarchical call
    const mpeData = await fetchMPE(symbol, assetClass, tcData);

    if (!priceData) {
      return NextResponse.json({ success: false, error: `Unable to fetch price data for ${symbol}` }, { status: 404 });
    }

    // Fetch indicators (may use AV — do after price to avoid burst)
    const indData = await fetchIndicators(symbol, assetClass, priceData.historicalCloses, priceData.historicalHighs, priceData.historicalLows, avInterval);

    // Fetch options (equities) or derivatives (crypto)
    let optsData: OptionsSnapshot | null = null;
    let cryptoDerivsData: CryptoDerivatives | null = null;
    if (assetClass === 'equity') {
      optsData = await fetchOptionsSnapshot(symbol, priceData.price);
    } else if (assetClass === 'crypto') {
      cryptoDerivsData = await fetchCryptoDerivatives(symbol);
    }

    const payload = buildPayload(symbol, assetClass, priceData, indData, optsData, mpeData, tfLabel, cryptoDerivsData, tcData, macroRegime);

    // Record signal for outcome tracking (fire-and-forget)
    recordSignal({
      symbol,
      signalType: 'golden_egg',
      direction: payload.layer1.direction === 'LONG' ? 'bullish' : payload.layer1.direction === 'SHORT' ? 'bearish' : 'bullish',
      score: payload.layer1.confidence,
      priceAtSignal: priceData.price,
      timeframe: tfLabel,
      features: {
        permission: payload.layer1.permission,
        rsi: indData?.rsi ?? undefined,
        macd_hist: indData?.macdHist ?? undefined,
        adx: indData?.adx ?? undefined,
        mpe_composite: mpeData?.composite ?? undefined,
        macro_regime: macroRegime?.riskState ?? undefined,
      },
    }).catch(() => {}); // never block response

    // Cache result
    cache.set(cacheKey, { data: payload, ts: Date.now() });

    return NextResponse.json({ success: true, data: payload });
  } catch (error) {
    console.error('[Golden Egg API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
