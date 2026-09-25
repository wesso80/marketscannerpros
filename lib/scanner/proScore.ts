/** Same versioned scoring boundary for Pro snapshots, including incomplete ones. */
import { deriveFactorSignals, type UniverseContext } from '@/lib/analysis/scannerFactorSignals';
import type { ScoreRegime } from '@/lib/analysis/scannerScoreV2';
import { evaluateDataTrust, type TrustAssetClass } from './dataTrust';
import { buildScannerScore, dollarVolume, scoreFreshness, type ScoreReason } from './scoreContract';

/** `gated`: independent gate failures (preferred: reason list) — never pass a block derived from this pick's own score. */
export function scoreProSnapshot(pick: any, asset: TrustAssetClass, timeframe: string, universe: UniverseContext = {}, gated: boolean | ScoreReason[] = false) {
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
    derivativesExpected: asset === 'crypto', dollarVolume: dollarVolume(price, ind.volume, asset),
  }, universe);
  const atrPct = Number.isFinite(ind.atr) && price > 0 ? ind.atr / price * 100 : undefined;
  const regime: ScoreRegime = Number.isFinite(ind.adx) && ind.adx >= 25 ? 'trending'
    : atrPct !== undefined && atrPct > 4 ? 'expansion' : atrPct !== undefined && atrPct < 1 ? 'compression'
    : Number.isFinite(ind.adx) && ind.adx < 20 ? 'ranging' : 'neutral';
  const compositeV2 = buildScannerScore({factors: signals.factors, regime, freshness: scoreFreshness(dataTrust.freshness),
    trustLevel: dataTrust.level, trustReasons: dataTrust.reasons, criticalBlockers: dataTrust.eligibilityBlockers,
    liquidityMultiplier: signals.liquidityMultiplier, catalyst: signals.catalyst,
    ...(Array.isArray(gated) ? {gateBlocks: gated} : {regimeGated: gated})});
  return {dataTrust, compositeV2};
}
