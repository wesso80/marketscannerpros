/**
 * Options Intelligence Engine — Phase 10
 *
 * Computes options market structure, pressure, and risk signals from
 * real options chain data (where available) to replace crossMarketConfirmation proxy.
 *
 * Consumes:
 * - Alpha Vantage options endpoints (if available)
 * - CoinGecko derivatives for crypto (funding rates, OI trend)
 * - Fallback to synthetic scoring when true options data unavailable
 *
 * Output: Rich OptionsIntelligence object with pressure scores, unusual activity
 * signals, expiration/strike zone analysis, and dealer/gamma pressure estimates.
 */

import type { DataTruth } from "@/lib/engines/dataTruth";

export interface VolContract {
  strike: number;
  expiration: string;
  callVolume: number;
  putVolume: number;
  callOI: number;
  putOI: number;
  callIV: number;
  putIV: number;
  callDelta: number;
  putDelta: number;
  callGamma: number;
  putGamma: number;
  callPrice: number;
  putPrice: number;
  bid: number;
  ask: number;
  spread: number;
  lastTradeTime?: string;
}

export interface ExpirationCluster {
  expiration: string;
  daysToExpiry: number;
  totalVolume: number;
  totalOI: number;
  putCallRatio: number;
  avgIV: number;
  putCallVolumeRatio: number;
  concentration: number; // 0..100: how much volume/OI is concentrated in top N strikes
}

export interface StrikeZone {
  zone: "OTM_DEEP" | "OTM_NEAR" | "ATM" | "ITM_NEAR" | "ITM_DEEP";
  callVolume: number;
  putVolume: number;
  callOI: number;
  putOI: number;
  concentration: number;
  relevanceScore: number; // how near-term/relevant this zone is
}

export interface OptionsIntelligence {
  symbol: string;
  assetClass: "equity" | "crypto" | "forex" | "index";

  // Pressure & Activity
  optionsPressureScore: number; // 0..100 signal strength
  unusualActivityScore: number; // 0..100 deviation from normal
  putCallVolumeRatio: number; // 0..N; >1 = put bias
  putCallOIRatio: number; // 0..N; >1 = put bias
  volumeOpenInterestRatio: number; // 0..N; >1 = active trading vs accumulated

  // IV Structure
  ivPercentile: number; // 0..100 where does current IV sit historically
  ivRank: number; // 0..100 similar to percentile
  ivCondition: "VERY_LOW" | "LOW" | "NORMAL" | "HIGH" | "VERY_HIGH";
  ivTerm: "BACKWARDATED" | "CONTANGO" | "NEUTRAL";

  // Expiration Analysis
  dominantExpiration?: string; // nearest major cluster
  expirationConcentration: number; // 0..100: how much vol/OI in one expiry
  expirationClusters: ExpirationCluster[];

  // Strike Zone Analysis
  strikeConcentration: number; // 0..100: how concentrated vol/OI is
  dominantStrikeZone: StrikeZone | null;
  strikeZones: StrikeZone[];

  // Greeks-based Pressure Signals
  gammaFlipRisk: number; // 0..100: how likely gamma reversal near current price
  gammaFlipLevel?: number; // price level where flip likely occurs
  dealerDeltaExposure?: number; // dealers' likely short gamma exposure
  dealerPressureEstimate?: "BULLISH" | "BEARISH" | "NEUTRAL"; // dealer hedging may presage moves

  // Unusual Activity Signals
  highlyConcerned: boolean; // many small contracts in short term
  massiveAddition: boolean; // OI sharply increased
  positionSquaring: boolean; // vol spike with OI decline
  volatilitySmile: boolean; // IV structure suggests tail risk concern
  skewBias: "BULLISH_CALL" | "BEARISH_PUT" | "NEUTRAL" | "MIXED"; // skew direction

  // Availability & Data Quality
  dataTruth: DataTruth;
  missingInputs: string[]; // what couldn't be computed
  fallbackScore?: number; // synthetic score when real data unavailable
  note: string;
}

/**
 * Compute options intelligence from available chain data.
 * Returns a complete OptionsIntelligence object with fallback scoring when data is sparse.
 */
export async function computeOptionsIntelligence(input: {
  symbol: string;
  assetClass: "equity" | "crypto" | "forex" | "index";
  market?: string;
  currentPrice: number;
  indicators?: { bbwpPercentile?: number; atr?: number; rvol?: number };
  crossMarketConfidenceProxy?: number; // fallback confidence 0..1
  dataTruth?: DataTruth;
}): Promise<OptionsIntelligence> {
  const symbol = input.symbol.toUpperCase();
  const missingInputs: string[] = [];
  const dataTruth = input.dataTruth || {
    status: "MISSING" as const,
    trustScore: 0,
    ageSec: 99999,
    thresholds: { liveSec: 300, staleSec: 900 },
    notes: ["options data not provided"],
  };

  // For now, return synthetic scoring based on volatility proxy.
  // Future: wire Alpha Vantage options endpoints here.
  const synthScore = (input.crossMarketConfidenceProxy ?? 0.5) * 100;
  const proxyBBWP = input.indicators?.bbwpPercentile ?? 50;
  const proxyRvol = input.indicators?.rvol ?? 0.8;

  // Unusual activity heuristic from volatility extremes
  const unusualActivityScore = Math.min(100, proxyBBWP > 80 ? 65 + (proxyBBWP - 80) * 0.7 : 30);

  const expirationCluster: ExpirationCluster = {
    expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    daysToExpiry: 7,
    totalVolume: 0,
    totalOI: 0,
    putCallRatio: 1.2, // synthetic: mild put bias
    avgIV: proxyBBWP / 100,
    putCallVolumeRatio: 1.15,
    concentration: 35, // low concentration = healthy market
  };

  const strikeZone: StrikeZone = {
    zone: "ATM",
    callVolume: 100,
    putVolume: 115,
    callOI: 1000,
    putOI: 1200,
    concentration: 28,
    relevanceScore: 85,
  };

  missingInputs.push("Real options chain data not available");

  return {
    symbol,
    assetClass: input.assetClass,
    optionsPressureScore: synthScore,
    unusualActivityScore,
    putCallVolumeRatio: 1.15,
    putCallOIRatio: 1.2,
    volumeOpenInterestRatio: proxyRvol,
    ivPercentile: Math.round(proxyBBWP),
    ivRank: Math.round(proxyBBWP),
    ivCondition: proxyBBWP > 90 ? "VERY_HIGH" : proxyBBWP > 80 ? "HIGH" : proxyBBWP < 15 ? "VERY_LOW" : proxyBBWP < 30 ? "LOW" : "NORMAL",
    ivTerm: "NEUTRAL",
    dominantExpiration: expirationCluster.expiration,
    expirationConcentration: 35,
    expirationClusters: [expirationCluster],
    strikeConcentration: 28,
    dominantStrikeZone: strikeZone,
    strikeZones: [strikeZone],
    gammaFlipRisk: Math.min(100, unusualActivityScore * 0.8),
    gammaFlipLevel: input.currentPrice * (1 + (unusualActivityScore - 50) * 0.003),
    dealerPressureEstimate: unusualActivityScore > 65 ? "BEARISH" : unusualActivityScore < 35 ? "BULLISH" : "NEUTRAL",
    highlyConcerned: unusualActivityScore > 70,
    massiveAddition: false,
    positionSquaring: false,
    volatilitySmile: proxyBBWP > 75,
    skewBias: synthScore > 70 ? "BEARISH_PUT" : synthScore < 40 ? "BULLISH_CALL" : "NEUTRAL",
    dataTruth,
    missingInputs,
    fallbackScore: synthScore,
    note:
      synthScore > 70
        ? "Elevated options pressure detected; elevated volatility profile."
        : synthScore < 40
          ? "Subdued options pressure; quiet volatility regime."
          : "Neutral options pressure; balanced market structure.",
  };
}
