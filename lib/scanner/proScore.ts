/** Same versioned scoring boundary for Pro snapshots, including incomplete ones. */
import { deriveFactorSignals, type UniverseContext } from '@/lib/analysis/scannerFactorSignals';
import type { ScoreRegime } from '@/lib/analysis/scannerScoreV2';
import { evaluateDataTrust, type TrustAssetClass } from './dataTrust';
import { cryptoPositioningExpected } from './derivativeSnapshot';
import { buildScannerScore, dollarVolume, scoreFreshness, type ScoreReason } from './scoreContract';
import { barsPerDay, evaluateHardBlocks, macroEventFlags } from './hardBlocks';

export interface ProHardBlockContext {
  /** Upcoming earnings map (symbol → YYYY-MM-DD). Omitted/empty → earnings UNKNOWN (flag, not block). */
  earningsMap?: Map<string, string>;
  /** Symbols whose calendar row could not be read → earnings UNKNOWN for them (flag), never "none in horizon". */
  earningsUnreadable?: Set<string>;
  macroFlags?: ScoreReason[];
  nowMs?: number;
}

/** `gated`: independent gate failures (preferred: reason list) — never pass a block derived from this pick's own score. */
export function scoreProSnapshot(pick: any, asset: TrustAssetClass, timeframe: string, universe: UniverseContext = {}, gated: boolean | ScoreReason[] = false, hardCtx: ProHardBlockContext = {}) {
  const ind = pick.indicators ?? {};
  const basis = pick.dataBasis;
  const price = ind.price ?? pick.price;
  const dataTrust = evaluateDataTrust({
    assetClass: asset, timeframe, lastBarAt: basis?.lastCompletedBarAt ?? null,
    barInterval: basis?.barInterval ?? null, historyBars: basis?.historyBars ?? null, price,
    indicators: {atr: Number.isFinite(ind.atr) && ind.atr > 0, rsi: Number.isFinite(ind.rsi), adx: Number.isFinite(ind.adx),
      ema200: Number.isFinite(ind.ema200) && ind.ema200 > 0, macd: Number.isFinite(ind.macd)},
    volumeAvailable: asset === 'forex' ? null : Number.isFinite(ind.volume) && ind.volume > 0,
    priceDiscontinuity: basis?.priceDiscontinuity ?? null,
  });
  const signals = deriveFactorSignals({
    price, ema200: ind.ema200, macdHist: Number.isFinite(ind.macd) && Number.isFinite(ind.macdSignal) ? ind.macd - ind.macdSignal : ind.macd_hist,
    adx: ind.adx, aroonUp: ind.aroonUp ?? ind.aroon_up, aroonDown: ind.aroonDown ?? ind.aroon_down,
    rsi: ind.rsi, stochK: ind.stochK, cci: ind.cci, mfi: ind.mfi,
    vwapPct: Number.isFinite(ind.vwap) && ind.vwap > 0 && Number.isFinite(price) ? (price / ind.vwap - 1) * 100 : undefined,
    relativeVolume: basis?.volumeRatio ?? undefined, rsIndexRatio: ind.rsIndexRatio, rsSectorRatio: ind.rsSectorRatio,
    bbwp: ind.bbwp, volatilityObserved: typeof ind.squeeze === 'boolean',
    // Being in a squeeze is not evidence that a squeeze has fired.
    dveFlags: ind.dveFlags, fundingRate: pick.fundingRate ?? ind.fundingRate,
    derivativesExpected: cryptoPositioningExpected(asset, pick.fundingRate ?? ind.fundingRate), dollarVolume: dollarVolume(price, ind.volume, asset),
  }, universe);
  const atrPct = Number.isFinite(ind.atr) && price > 0 ? ind.atr / price * 100 : undefined;
  const regime: ScoreRegime = Number.isFinite(ind.adx) && ind.adx >= 25 ? 'trending'
    : atrPct !== undefined && atrPct > 4 ? 'expansion' : atrPct !== undefined && atrPct < 1 ? 'compression'
    : Number.isFinite(ind.adx) && ind.adx < 20 ? 'ranging' : 'neutral';
  const dv = dollarVolume(price, ind.volume, asset);
  // Equity liquidity = price × 20-session average daily volume (completed sessions) when the scan supplies it. The live
  // quote volume is only the session so far — mid-morning it is a fraction of a normal day and wrongly failed liquid
  // stocks — so it is used only when no average is available.
  const adv = asset === 'equity' ? dollarVolume(price, basis?.avgDailyVolume20, asset) : undefined;
  const volume24h = Number(pick.marketSnapshot?.volume24hUsd);
  const hard = evaluateHardBlocks({
    asset, timeframe, freshness: dataTrust.freshness, lastBarAt: basis?.lastCompletedBarAt ?? null,
    price, referencePrice: pick.referenceClose ?? null, referenceSource: pick.referenceSource ?? null, referenceIndependent: false,
    atrPct: atrPct ?? null,
    earningsDate: asset === 'equity' ? hardCtx.earningsMap?.get(String(pick.symbol ?? '').toUpperCase()) ?? null : null,
    earningsCalendarLoaded: Boolean(hardCtx.earningsMap && hardCtx.earningsMap.size > 0)
      && !hardCtx.earningsUnreadable?.has(String(pick.symbol ?? '').toUpperCase()),
    dollarVolumeDaily: asset === 'crypto' && Number.isFinite(volume24h) && volume24h > 0 ? volume24h
      : adv != null ? adv : dv != null ? dv * barsPerDay(timeframe, asset) : null,
    nowMs: hardCtx.nowMs,
  }, hardCtx.macroFlags ?? macroEventFlags(hardCtx.nowMs));
  const compositeV2 = buildScannerScore({factors: signals.factors, regime, hardBlocks: hard.blocks, flags: hard.flags, freshness: scoreFreshness(dataTrust.freshness),
    trustLevel: dataTrust.level, trustReasons: dataTrust.reasons, criticalBlockers: dataTrust.eligibilityBlockers,
    trustQualityIssues: dataTrust.qualityIssues, missingInputs: dataTrust.missingInputs,
    liquidityMultiplier: signals.liquidityMultiplier, catalyst: signals.catalyst,
    ...(Array.isArray(gated) ? {gateBlocks: gated} : {regimeGated: gated})});
  return {dataTrust, compositeV2, hardBlockDetail: {earnings: hard.earnings, priceCheck: hard.priceCheck, liquidity: hard.liquidity}};
}
