/**
 * Time Gravity Map (TGM) Engine
 * 
 * The most advanced feature: models price as a gravitational field
 * where each timeframe midpoint acts as a mass that pulls price.
 * 
 * Formula:
 * gravity = (tf_weight × decompression_multiplier) / distance
 * 
 * This creates a dynamic "pull map" showing where price is most likely to move.
 * 
 * Integrates:
 * 1. Decompression timing (boosts gravity when window active)
 * 2. Midpoint debt (unresolved midpoints have stronger pull)
 * 3. Multi-TF clustering (combined gravity creates AOI zones)
 */

import {
  calculateDecompressionState,
  getCurrentCandleBoundaries,
  type DecompressionState,
  type DecompressionStatus,
} from './decompressionTiming';

import {
  analyzeMidpointDebt,
  clusterMidpoints,
  type MidpointRecord,
  type MidpointCluster,
  type MidpointDebtAnalysis,
  TF_WEIGHTS,
} from './midpointDebt';

import {
  computeMomentumOverride,
  type MomentumOverrideInput,
  type MomentumOverrideState,
  type ExpansionTarget,
} from './momentumOverride';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface GravityPoint {
  timeframe: string;
  midpoint: number;              // 50% level (target — strongest pull)
  retrace30High: number;         // 30% from high — shallow entry zone top
  retrace30Low: number;          // 30% from low  — shallow entry zone bottom
  zoneLow: number;               // Lower edge of relevant 30-50% zone
  zoneHigh: number;              // Upper edge of relevant 30-50% zone
  weight: number;
  distance: number;              // Distance from current price to midpoint (%)
  distanceAbs: number;           // Absolute distance
  decompressionState: DecompressionState;
  decompressionMultiplier: number; // 1x-5x boost when window active
  isDebt: boolean;               // Unresolved midpoint = stronger pull
  debtMultiplier: number;        // 2x boost for debt
  rawGravity: number;            // weight / distance
  adjustedGravity: number;       // rawGravity × decompression × debt
  visualStrength: number;        // 0-100 for heatmap
  label: string;
}

export interface GravityZone {
  minPrice: number;
  maxPrice: number;
  centerPrice: number;
  spread: number;
  spreadBps: number;
  points: GravityPoint[];
  totalGravity: number;
  averageGravity: number;
  dominantTimeframes: string[];
  debtCount: number;
  activeDecompressionCount: number;
  rank: number;                  // 1 = strongest zone
  confidence: number;            // 0-100
  visualIntensity: number;       // 0-100 for heatmap
  label: string;
}

/** Target lifecycle state */
export type TargetStatus =
  | 'ACTIVE'            // Target is live, price approaching
  | 'TARGET_HIT'        // Price tagged the target zone
  | 'OVERSHOT'          // Price blew through the target by >0.2%
  | 'RECOMPUTING'       // Previous target invalidated, calculating next
  | 'EXPANSION'         // Momentum override — expansion targets replace magnets
  | 'NO_TARGET';        // No viable gravity zones found

export interface TimeGravityMap {
  timestamp: Date;
  currentPrice: number;
  allPoints: GravityPoint[];
  zones: GravityZone[];
  topZone: GravityZone | null;
  strongestPull: GravityPoint | null;
  targetPrice: number | null;
  targetRange: [number, number] | null;
  targetStatus: TargetStatus;
  confidence: number;             // 0-100
  debtAnalysis: MidpointDebtAnalysis;
  momentumOverride: MomentumOverrideState | null;
  expansionTargets: ExpansionTarget[];
  heatmap: number[];             // Array of gravity values for visualization
  heatmapPrices: number[];       // Corresponding prices
  summary: string;
  alert: string | null;

  /** Stats from pre-computation tagging pass */
  taggingStats: {
    taggedThisCycle: number;      // Midpoints tagged in this computation
    overshotTagged: number;       // Auto-tagged because price blew past
    remainingUntagged: number;    // Still active
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DECOMPRESSION MULTIPLIERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate decompression multiplier based on window status
 */
function getDecompressionMultiplier(status: DecompressionStatus): number {
  switch (status) {
    case 'ACTIVE':
      return 5.0;  // 5x boost when in decompression window
    case 'PRE_WINDOW':
      return 2.0;  // 2x boost when approaching
    case 'COMPRESSION':
      return 1.0;  // Normal gravity
    case 'POST_WINDOW':
      return 0.5;  // Reduced (window passed)
    case 'TAGGED':
      return 0.1;  // Minimal (already hit)
    default:
      return 1.0;
  }
}

/**
 * Calculate debt multiplier
 */
function getDebtMultiplier(isDebt: boolean): number {
  return isDebt ? 2.0 : 1.0;
}

// ═══════════════════════════════════════════════════════════════════════════
// GRAVITY CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate gravity for a single midpoint with 30-50% zone.
 *
 * The gravity zone is directional:
 * - If price is ABOVE the midpoint → zone runs from retrace30High (30%) down to midpoint (50%)
 * - If price is BELOW the midpoint → zone runs from midpoint (50%) up to retrace30Low (30%)
 *
 * Gravity is strongest at the 50% midpoint and fades towards the 30% edge.
 */
export function calculateGravityPoint(
  midpoint: MidpointRecord,
  decompressionState: DecompressionState,
  currentPrice: number
): GravityPoint {
  const distance = Math.abs(midpoint.distanceFromPrice);
  const distanceAbs = Math.abs(midpoint.midpoint - currentPrice);
  const weight = midpoint.weight;
  
  // Directional zone: which 30% edge is relevant?
  const isAbove = currentPrice > midpoint.midpoint;
  const zoneLow  = isAbove ? midpoint.midpoint : midpoint.midpoint;
  const zoneHigh = isAbove ? midpoint.retrace30High : midpoint.retrace30Low;
  // Ensure zoneLow <= zoneHigh
  const zoneLowFinal = Math.min(zoneLow, zoneHigh);
  const zoneHighFinal = Math.max(zoneLow, zoneHigh);
  
  // Graduated gravity: peak at 50% midpoint, tapering to 60% at the 30% edge
  // If price is between 30% and 50%, boost gravity proportionally
  let zoneProximityBoost = 1.0;
  if (currentPrice >= zoneLowFinal && currentPrice <= zoneHighFinal) {
    // Inside the zone — interpolate: 1.0 at 30% edge → 1.5 at 50% midpoint
    const zoneWidth = zoneHighFinal - zoneLowFinal;
    const distToMidpoint = Math.abs(currentPrice - midpoint.midpoint);
    const pctToTarget = zoneWidth > 0 ? 1 - (distToMidpoint / zoneWidth) : 1;
    zoneProximityBoost = 1.0 + pctToTarget * 0.5;  // 1.0 → 1.5
  }
  
  // Base gravity = weight / distance
  const rawGravity = distance > 0 ? weight / (distance + 0.01) : weight * 100;
  
  // Apply multipliers
  const decompressionMultiplier = getDecompressionMultiplier(decompressionState.status);
  const debtMultiplier = getDebtMultiplier(!midpoint.tagged);
  
  const adjustedGravity = rawGravity * decompressionMultiplier * debtMultiplier * zoneProximityBoost;
  
  // Visual strength (0-100 for UI)
  const maxGravity = 1000;
  const visualStrength = Math.min(100, (adjustedGravity / maxGravity) * 100);
  
  const label = `${midpoint.timeframe} ${decompressionState.visualIndicator} ${midpoint.midpoint.toFixed(2)}`;
  
  return {
    timeframe: midpoint.timeframe,
    midpoint: midpoint.midpoint,
    retrace30High: midpoint.retrace30High,
    retrace30Low: midpoint.retrace30Low,
    zoneLow: zoneLowFinal,
    zoneHigh: zoneHighFinal,
    weight,
    distance,
    distanceAbs,
    decompressionState,
    decompressionMultiplier,
    isDebt: !midpoint.tagged,
    debtMultiplier,
    rawGravity,
    adjustedGravity,
    visualStrength,
    label,
  };
}

/**
 * Create gravity zones from gravity points
 */
export function createGravityZones(
  points: GravityPoint[],
  clusterThreshold: number = 0.5
): GravityZone[] {
  if (points.length === 0) return [];
  
  // Sort by price
  const sorted = [...points].sort((a, b) => a.midpoint - b.midpoint);
  
  const zones: GravityZone[] = [];
  let currentZone: GravityPoint[] = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    
    // Calculate distance between midpoints
    const distancePct = Math.abs(((curr.midpoint - prev.midpoint) / prev.midpoint) * 100);
    
    if (distancePct <= clusterThreshold) {
      currentZone.push(curr);
    } else {
      if (currentZone.length > 0) {
        zones.push(buildGravityZone(currentZone));
      }
      currentZone = [curr];
    }
  }
  
  // Add final zone
  if (currentZone.length > 0) {
    zones.push(buildGravityZone(currentZone));
  }
  
  // Rank zones by total gravity
  const ranked = zones.sort((a, b) => b.totalGravity - a.totalGravity);
  ranked.forEach((zone, index) => {
    zone.rank = index + 1;
  });
  
  return ranked;
}

/**
 * Build a gravity zone from a group of points
 */
function buildGravityZone(points: GravityPoint[]): GravityZone {
  const prices = points.map(p => p.midpoint);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const centerPrice = (minPrice + maxPrice) / 2;
  const spread = ((maxPrice - minPrice) / centerPrice) * 100;
  const spreadBps = spread * 100;
  
  const totalGravity = points.reduce((sum, p) => sum + p.adjustedGravity, 0);
  const averageGravity = totalGravity / points.length;
  
  const debtCount = points.filter(p => p.isDebt).length;
  const activeDecompressionCount = points.filter(p => p.decompressionState.status === 'ACTIVE').length;
  
  // Get dominant timeframes (highest weight)
  const dominantTimeframes = points
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(p => p.timeframe);
  
  // Calculate confidence (0-100)
  let confidence = 50; // Base
  confidence += Math.min(30, points.length * 10);  // More TFs = more confidence
  confidence += Math.min(20, debtCount * 10);      // Debt adds confidence
  confidence += Math.min(20, activeDecompressionCount * 10); // Active windows add confidence
  confidence = Math.min(100, confidence);
  
  // Visual intensity for heatmap
  const maxGravity = 500;
  const visualIntensity = Math.min(100, (totalGravity / maxGravity) * 100);
  
  const tfs = points.map(p => p.timeframe).join(' • ');
  const label = `${minPrice.toFixed(2)}–${maxPrice.toFixed(2)} (${tfs})`;
  
  return {
    minPrice,
    maxPrice,
    centerPrice,
    spread,
    spreadBps,
    points,
    totalGravity,
    averageGravity,
    dominantTimeframes,
    debtCount,
    activeDecompressionCount,
    rank: 0, // Will be set later
    confidence,
    visualIntensity,
    label,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TIME GRAVITY MAP ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options for the gravity engine.
 * When OHLC bars are provided the momentum override module runs.
 */
export interface ComputeTGMOptions {
  /** Recent OHLC bars for momentum override (oldest → newest, min 6).
   *  If omitted, momentum override is skipped. */
  ohlcBars?: { open: number; high: number; low: number; close: number }[];
  /** Prior swing references for break-hold detection */
  priorSwingHigh?: number;
  priorSwingLow?: number;
  /** Overshoot threshold to auto-tag midpoints (default 0.2%) */
  overshootPct?: number;
}

/**
 * Compute complete Time Gravity Map
 *
 * CHANGES from previous version:
 * 1. Pre-computation TAGGING — midpoints where price has overshot are
 *    filtered out before gravity calculation. This prevents stale targets.
 * 2. TARGET STATE MACHINE — returns a `targetStatus` indicating TARGET_HIT,
 *    OVERSHOT, EXPANSION, etc. so the UI can show the correct state.
 * 3. MOMENTUM OVERRIDE — when OHLC data is provided, impulse expansion
 *    dampens gravity by 0.25× and switches to expansion targets.
 */
export function computeTimeGravityMap(
  midpoints: MidpointRecord[],
  currentPrice: number,
  currentTime: Date = new Date(),
  options: ComputeTGMOptions = {}
): TimeGravityMap {
  const {
    ohlcBars,
    priorSwingHigh,
    priorSwingLow,
    overshootPct = 0.002,  // 0.2%
  } = options;

  // ─── 0. PRE-COMPUTATION TAGGING ────────────────────────────────────
  // Tag midpoints that the current price has already passed through.
  // This is done IN-MEMORY — the DB tagging is the API route's job.
  let taggedThisCycle = 0;
  let overshotTagged = 0;

  const liveMidpoints = midpoints.map(mp => {
    if (mp.tagged) return mp;  // Already tagged

    const distance = Math.abs(mp.midpoint - currentPrice) / mp.midpoint;

    // Overshoot: price is >overshootPct away from midpoint.
    // Since the midpoint was created from a candle AT that level,
    // price must have crossed through it to be this far away.
    if (distance > overshootPct) {
      overshotTagged++;
      taggedThisCycle++;
      return { ...mp, tagged: true, taggedAt: currentTime };
    }

    // Direct touch: current price is within the midpoint range
    if (currentPrice >= mp.low && currentPrice <= mp.high) {
      taggedThisCycle++;
      return { ...mp, tagged: true, taggedAt: currentTime };
    }

    return mp;
  });

  // Separate active (untagged) from tagged
  const activeMidpoints = liveMidpoints.filter(mp => !mp.tagged);
  const remainingUntagged = activeMidpoints.length;

  // ─── 1. GRAVITY POINTS ──────────────────────────────────────────────
  // Compute gravity for active (untagged) midpoints only.
  const allPoints: GravityPoint[] = activeMidpoints.map(midpoint => {
    const { open, close } = getCurrentCandleBoundaries(midpoint.timeframe, currentTime);
    const decompressionState = calculateDecompressionState(
      midpoint.timeframe,
      open,
      close,
      currentTime,
      midpoint.tagged
    );
    
    return calculateGravityPoint(midpoint, decompressionState, currentPrice);
  });

  // ─── 2. MOMENTUM OVERRIDE ──────────────────────────────────────────
  let momentumOverride: MomentumOverrideState | null = null;
  let expansionTargets: ExpansionTarget[] = [];

  if (ohlcBars && ohlcBars.length >= 6) {
    const closes = ohlcBars.map(b => b.close);
    const highs = ohlcBars.map(b => b.high);
    const lows = ohlcBars.map(b => b.low);

    // Compute ATR(14) and avgRange(20) from provided bars
    const { computeATR, computeAvgRange } = require('./momentumOverride');
    const atr14 = computeATR(highs, lows, closes, 14);
    const avgRangeN = computeAvgRange(highs, lows, 20);

    const overrideInput: MomentumOverrideInput = {
      closes,
      highs,
      lows,
      atr14,
      avgRangeN,
      priorSwingHigh,
      priorSwingLow,
    };

    momentumOverride = computeMomentumOverride(overrideInput);

    // If override active, dampen gravity
    if (momentumOverride.isOverride) {
      allPoints.forEach(p => {
        p.adjustedGravity *= momentumOverride!.gravityMultiplier; // 0.25
        p.visualStrength = Math.min(100, (p.adjustedGravity / 1000) * 100);
      });

      // Compute expansion targets (fib extensions from the impulse)
      const impulseStart = Math.min(...lows.slice(-6));
      const impulseEnd = currentPrice;
      const { computeExpansionTargets } = require('./momentumOverride');
      expansionTargets = computeExpansionTargets(impulseStart, impulseEnd);
    }
  }

  // ─── 3. GRAVITY ZONES ──────────────────────────────────────────────
  const zones = createGravityZones(allPoints, 0.5);
  const topZone = zones.length > 0 ? zones[0] : null;

  // ─── 4. STRONGEST PULL ──────────────────────────────────────────────
  const strongestPull = allPoints.length > 0
    ? allPoints.reduce((max, point) => point.adjustedGravity > max.adjustedGravity ? point : max, allPoints[0])
    : null;

  // ─── 5. TARGET + STATE MACHINE ──────────────────────────────────────
  let targetPrice: number | null = null;
  let targetRange: [number, number] | null = null;
  let targetStatus: TargetStatus = 'NO_TARGET';

  if (momentumOverride?.isOverride) {
    // Expansion mode — use extension targets instead of midpoint magnets
    targetStatus = 'EXPANSION';
    if (expansionTargets.length > 0) {
      targetPrice = expansionTargets[0].price;
      targetRange = [
        expansionTargets[0].price * 0.998,
        expansionTargets[0].price * 1.002,
      ];
    }
  } else if (taggedThisCycle > 0 && remainingUntagged === 0) {
    // All midpoints just got tagged — nothing left
    targetStatus = overshotTagged > 0 ? 'OVERSHOT' : 'TARGET_HIT';
  } else if (taggedThisCycle > 0 && remainingUntagged > 0) {
    // Some tagged, more remain — recomputed to next target
    targetStatus = 'RECOMPUTING';
    if (topZone) {
      targetPrice = topZone.centerPrice;
      targetRange = [topZone.minPrice, topZone.maxPrice];
      targetStatus = 'ACTIVE';  // New target is live
    }
  } else if (topZone) {
    // Normal operation — active target
    targetPrice = topZone.centerPrice;
    targetRange = [topZone.minPrice, topZone.maxPrice];
    targetStatus = 'ACTIVE';
  }

  // ─── 6. CONFIDENCE ─────────────────────────────────────────────────
  let confidence = topZone?.confidence || 0;
  if (momentumOverride?.isOverride) {
    // Reduce confidence for midpoint targets during expansion
    confidence = Math.round(confidence * momentumOverride.gravityMultiplier);
  }

  // ─── 7. DEBT ANALYSIS ──────────────────────────────────────────────
  const debtAnalysis = analyzeMidpointDebt(activeMidpoints, currentPrice);

  // ─── 8. HEATMAP ────────────────────────────────────────────────────
  const { heatmap, heatmapPrices } = generateHeatmap(allPoints, currentPrice);

  // ─── 9. SUMMARY ────────────────────────────────────────────────────
  let summary = '';
  if (momentumOverride?.isOverride) {
    summary = `⚡ MOMENTUM OVERRIDE: ${momentumOverride.reasons.join(' + ')}. Midpoint magnets dampened. Expansion targets active.`;
  } else if (targetStatus === 'TARGET_HIT') {
    summary = `✅ TARGET HIT — All ${taggedThisCycle} midpoint(s) tagged this cycle. Awaiting new midpoints.`;
  } else if (targetStatus === 'OVERSHOT') {
    summary = `🚀 TARGET OVERSHOT — Price blew past ${overshotTagged} midpoint(s). ${remainingUntagged > 0 ? `${remainingUntagged} still active.` : 'No active targets remain.'}`;
  } else if (zones.length === 0) {
    summary = 'No significant gravity zones detected.';
  } else if (topZone) {
    const direction = topZone.centerPrice > currentPrice ? 'above' : 'below';
    summary = `Strongest gravity ${direction} at ${topZone.centerPrice.toFixed(2)} (${topZone.dominantTimeframes.join(', ')}). ${topZone.activeDecompressionCount} active decompression windows.`;
  }

  // ─── 10. ALERT ──────────────────────────────────────────────────────
  let alert: string | null = null;
  if (momentumOverride?.isOverride) {
    alert = `⚡ MOMENTUM OVERRIDE: ${momentumOverride.reasons.join(' + ')} | Mode: EXPANSION | Gravity dampened to ${Math.round(momentumOverride.gravityMultiplier * 100)}%`;
  } else if (targetStatus === 'TARGET_HIT' || targetStatus === 'OVERSHOT') {
    alert = `✅ TARGET ${targetStatus === 'TARGET_HIT' ? 'HIT' : 'OVERSHOT'} — ${taggedThisCycle} midpoint(s) cleared | ${remainingUntagged} remaining`;
  } else if (topZone && topZone.confidence >= 80) {
    const decompActive = topZone.activeDecompressionCount;
    const debt = topZone.debtCount;
    alert = `🎯 HIGH PROBABILITY TARGET: ${topZone.centerPrice.toFixed(2)} | ${decompActive} active decompression windows | ${debt} unresolved debt midpoints | Confidence: ${topZone.confidence}%`;
  } else if (topZone && topZone.confidence >= 60) {
    alert = `⚠️ Moderate gravity zone at ${topZone.centerPrice.toFixed(2)} | Confidence: ${topZone.confidence}%`;
  }

  return {
    timestamp: currentTime,
    currentPrice,
    allPoints,
    zones,
    topZone,
    strongestPull,
    targetPrice,
    targetRange,
    targetStatus,
    confidence,
    debtAnalysis,
    momentumOverride,
    expansionTargets,
    heatmap,
    heatmapPrices,
    summary,
    alert,
    taggingStats: {
      taggedThisCycle,
      overshotTagged,
      remainingUntagged,
    },
  };
}

/**
 * Generate heatmap data for visualization.
 * Gravity is spread across the 30-50% zone band for each point,
 * giving the heatmap a "zone" appearance rather than single spikes.
 */
function generateHeatmap(
  points: GravityPoint[],
  currentPrice: number,
  resolution: number = 20
): { heatmap: number[], heatmapPrices: number[] } {
  if (points.length === 0) {
    return { heatmap: [], heatmapPrices: [] };
  }
  
  // Find price range — include zone edges, not just midpoints
  const allPrices = points.flatMap(p => [p.midpoint, p.zoneLow, p.zoneHigh]);
  const minPrice = Math.min(...allPrices, currentPrice * 0.98);
  const maxPrice = Math.max(...allPrices, currentPrice * 1.02);
  
  const priceStep = (maxPrice - minPrice) / resolution;
  const heatmap: number[] = [];
  const heatmapPrices: number[] = [];
  
  for (let i = 0; i <= resolution; i++) {
    const price = minPrice + (i * priceStep);
    heatmapPrices.push(price);
    
    // Calculate total gravity at this price level
    const gravity = points.reduce((sum, point) => {
      // Inside the 30-50% zone? Gravity is boosted and flatter (zone pull)
      if (price >= point.zoneLow && price <= point.zoneHigh) {
        // Graduated: full gravity at midpoint, 60% at the 30% edge
        const zoneWidth = point.zoneHigh - point.zoneLow;
        const distToMid = Math.abs(price - point.midpoint);
        const pctToTarget = zoneWidth > 0 ? 1 - (distToMid / zoneWidth) : 1;
        const zoneFactor = 0.6 + pctToTarget * 0.4;  // 0.6 → 1.0
        return sum + point.adjustedGravity * zoneFactor;
      }
      
      // Outside zone — decay by distance
      const distance = Math.abs(((price - point.midpoint) / point.midpoint) * 100);
      const localGravity = distance > 0 ? point.adjustedGravity / (distance + 0.1) : point.adjustedGravity * 10;
      return sum + localGravity;
    }, 0);
    
    heatmap.push(gravity);
  }
  
  return { heatmap, heatmapPrices };
}

/**
 * Format gravity zone for display
 */
export function formatGravityZone(zone: GravityZone): string {
  const range = `${zone.minPrice.toFixed(2)}–${zone.maxPrice.toFixed(2)}`;
  const tfs = zone.dominantTimeframes.join(' • ');
  const confidence = `${zone.confidence}%`;
  return `${range} (${tfs}) - Confidence: ${confidence}`;
}

/**
 * Generate ASCII heatmap for terminal display
 */
export function generateASCIIHeatmap(
  heatmap: number[],
  heatmapPrices: number[],
  height: number = 10
): string[] {
  const maxGravity = Math.max(...heatmap);
  const lines: string[] = [];
  
  for (let i = heatmap.length - 1; i >= 0; i--) {
    const gravity = heatmap[i];
    const price = heatmapPrices[i];
    const normalizedGravity = maxGravity > 0 ? gravity / maxGravity : 0;
    const barWidth = Math.round(normalizedGravity * 20);
    const bar = '█'.repeat(barWidth) + '░'.repeat(20 - barWidth);
    const line = `${price.toFixed(2).padStart(10)}  ${bar}`;
    lines.push(line);
  }
  
  return lines;
}

/**
 * Example usage
 */
export function exampleTimeGravityMap() {
  const currentPrice = 68075;
  const now = new Date();
  
  // Create sample midpoints (in real usage, these come from candle data)
  const midpoints: MidpointRecord[] = [
    {
      timeframe: '1H',
      midpoint: 68462,
      high: 68500,
      low: 68424,
      range: 76,
      retrace30High: 68500 - 76 * 0.3,
      retrace30Low: 68424 + 76 * 0.3,
      createdAt: now,
      candleOpenTime: new Date(now.getTime() - 60 * 60 * 1000),
      candleCloseTime: now,
      tagged: false,
      taggedAt: null,
      distanceFromPrice: ((68462 - currentPrice) / currentPrice) * 100,
      ageMinutes: 0,
      weight: TF_WEIGHTS['1H'],
      isAbovePrice: true,
    },
    {
      timeframe: '4H',
      midpoint: 68510,
      high: 68550,
      low: 68470,
      range: 80,
      retrace30High: 68550 - 80 * 0.3,
      retrace30Low: 68470 + 80 * 0.3,
      createdAt: now,
      candleOpenTime: new Date(now.getTime() - 4 * 60 * 60 * 1000),
      candleCloseTime: now,
      tagged: false,
      taggedAt: null,
      distanceFromPrice: ((68510 - currentPrice) / currentPrice) * 100,
      ageMinutes: 0,
      weight: TF_WEIGHTS['4H'],
      isAbovePrice: true,
    },
    {
      timeframe: '1D',
      midpoint: 68495,
      high: 68540,
      low: 68450,
      range: 90,
      retrace30High: 68540 - 90 * 0.3,
      retrace30Low: 68450 + 90 * 0.3,
      createdAt: now,
      candleOpenTime: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      candleCloseTime: now,
      tagged: false,
      taggedAt: null,
      distanceFromPrice: ((68495 - currentPrice) / currentPrice) * 100,
      ageMinutes: 0,
      weight: TF_WEIGHTS['1D'],
      isAbovePrice: true,
    },
  ];
  
  const tgm = computeTimeGravityMap(midpoints, currentPrice, now);
  
  console.log('═══════════════════════════════════════════');
  console.log('TIME GRAVITY MAP');
  console.log('═══════════════════════════════════════════\n');
  console.log(`Current Price: ${currentPrice}`);
  console.log(`Target: ${tgm.targetPrice?.toFixed(2) || 'N/A'}`);
  console.log(`Target Status: ${tgm.targetStatus}`);
  console.log(`Confidence: ${tgm.confidence}%`);
  console.log(`Tagged this cycle: ${tgm.taggingStats.taggedThisCycle}`);
  console.log(`Remaining active: ${tgm.taggingStats.remainingUntagged}\n`);
  
  if (tgm.topZone) {
    console.log('Top Gravity Zone:');
    console.log(formatGravityZone(tgm.topZone));
    console.log(`  Active Decompression: ${tgm.topZone.activeDecompressionCount}`);
    console.log(`  Unresolved Debt: ${tgm.topZone.debtCount}\n`);
  }
  
  console.log('Gravity Heatmap:');
  const heatmapLines = generateASCIIHeatmap(tgm.heatmap, tgm.heatmapPrices, 10);
  heatmapLines.forEach(line => console.log(line));
  
  console.log(`\n${tgm.summary}`);
  if (tgm.alert) {
    console.log(`\n${tgm.alert}`);
  }
  
  return tgm;
}
