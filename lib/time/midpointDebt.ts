/**
 * Midpoint Debt Tracker
 * 
 * Tracks unresolved 50% midpoints across all timeframes.
 * 
 * "Midpoint Debt" = when a candle closes and its 50% level remains untested.
 * These become latent magnets that remain structural references.
 * 
 * Key Concept:
 * - Resolved midpoint = price traded through it
 * - Unresolved midpoint = debt exists
 * - Debt midpoints often act as stronger magnets when aligned
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MidpointRecord {
  timeframe: string;
  midpoint: number;             // 50% retracement (target — strongest pull)
  high: number;
  low: number;
  range: number;                // high - low
  retrace30High: number;        // 30% retrace from high = high - range * 0.3
  retrace30Low: number;         // 30% retrace from low  = low  + range * 0.3
  createdAt: Date;
  candleOpenTime: Date;
  candleCloseTime: Date;
  tagged: boolean;              // Has price touched this midpoint?
  taggedAt: Date | null;        // When was it tagged?
  distanceFromPrice: number;    // Current distance (%)
  ageMinutes: number;           // How old is this midpoint?
  weight: number;               // Timeframe importance weight
  isAbovePrice: boolean;        // Direction
}

export interface MidpointCluster {
  minPrice: number;
  maxPrice: number;
  centerPrice: number;
  spread: number;               // Spread as percentage
  spreadBps: number;            // Spread in basis points
  midpoints: MidpointRecord[];
  totalWeight: number;
  gravityStrength: number;      // Combined pull strength
  timeframes: string[];
  unresolvedCount: number;
  resolvedCount: number;
}

export interface MidpointDebtAnalysis {
  timestamp: Date;
  currentPrice: number;
  allMidpoints: MidpointRecord[];
  unresolvedMidpoints: MidpointRecord[];
  resolvedMidpoints: MidpointRecord[];
  clusters: MidpointCluster[];
  topCluster: MidpointCluster | null;
  totalDebtCount: number;
  nearestDebt: MidpointRecord | null;
  summary: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMEFRAME WEIGHTS (for gravity calculation)
// ═══════════════════════════════════════════════════════════════════════════

export const TF_WEIGHTS: Record<string, number> = {
  '1m': 0.5,
  '3m': 0.5,
  '5m': 0.5,
  '15m': 1,
  '30m': 1.5,
  '1H': 2,
  '2H': 2.5,
  '3H': 3,
  '4H': 3.5,
  '6H': 4,
  '8H': 4.5,
  '1D': 6,
  '2D': 7,
  '3D': 8,
  '4D': 8.5 ,
  '5D': 9,
  '1W': 10,
  '2W': 11,
  '1M': 12,
  '2M': 13,
  '3M': 14,
  '6M': 15,
  '1Y': 18,
  '2Y': 20,
  '4Y': 22,
  '5Y': 24,
};

// ═══════════════════════════════════════════════════════════════════════════
// MIDPOINT CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate 50% midpoint from high and low
 */
export function calculate50Midpoint(high: number, low: number): number {
  return (high + low) / 2;
}

/**
 * Calculate 30% retracement levels from high and low.
 * retrace30High = 30% retrace from high (entry zone when approaching from above)
 * retrace30Low  = 30% retrace from low  (entry zone when approaching from below)
 */
export function calculateRetrace30(
  high: number,
  low: number
): { range: number; retrace30High: number; retrace30Low: number } {
  const range = high - low;
  return {
    range,
    retrace30High: high - range * 0.3,
    retrace30Low: low + range * 0.3,
  };
}

/**
 * Check if price has tagged a midpoint
 * Uses a small tolerance for floating point comparison
 */
export function hasPriceTaggedMidpoint(
  midpoint: number,
  priceHigh: number,
  priceLow: number,
  tolerance: number = 0.0001
): boolean {
  // Price range
  const rangeHigh = Math.max(priceHigh, priceLow);
  const rangeLow = Math.min(priceHigh, priceLow);
  
  // Check if midpoint is within the price range (with tolerance)
  return midpoint >= (rangeLow * (1 - tolerance)) && midpoint <= (rangeHigh * (1 + tolerance));
}

/**
 * Calculate distance from current price to midpoint (as percentage)
 */
export function calculateDistance(price: number, midpoint: number): number {
  return ((midpoint - price) / price) * 100;
}

/**
 * Create a midpoint record
 */
export function createMidpointRecord(
  timeframe: string,
  high: number,
  low: number,
  candleOpenTime: Date,
  candleCloseTime: Date,
  currentPrice: number,
  priceHigh: number,
  priceLow: number,
  currentTime: Date = new Date()
): MidpointRecord {
  const midpoint = calculate50Midpoint(high, low);
  const { range, retrace30High, retrace30Low } = calculateRetrace30(high, low);
  const tagged = hasPriceTaggedMidpoint(midpoint, priceHigh, priceLow);
  const distance = calculateDistance(currentPrice, midpoint);
  const ageMs = currentTime.getTime() - candleCloseTime.getTime();
  const ageMinutes = Math.max(0, ageMs / (1000 * 60));
  const weight = TF_WEIGHTS[timeframe] || 1;
  const isAbovePrice = midpoint > currentPrice;
  
  return {
    timeframe,
    midpoint,
    high,
    low,
    range,
    retrace30High,
    retrace30Low,
    createdAt: candleCloseTime,
    candleOpenTime,
    candleCloseTime,
    tagged,
    taggedAt: tagged ? currentTime : null,
    distanceFromPrice: distance,
    ageMinutes,
    weight,
    isAbovePrice,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLUSTERING LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Group midpoints into clusters based on proximity
 */
export function clusterMidpoints(
  midpoints: MidpointRecord[],
  clusterThreshold: number = 0.5 // % threshold for clustering
): MidpointCluster[] {
  if (midpoints.length === 0) return [];
  
  // Sort by price
  const sorted = [...midpoints].sort((a, b) => a.midpoint - b.midpoint);
  
  const clusters: MidpointCluster[] = [];
  let currentCluster: MidpointRecord[] = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    
    // Calculate distance between this midpoint and previous
    const distancePct = Math.abs(calculateDistance(prev.midpoint, curr.midpoint));
    
    if (distancePct <= clusterThreshold) {
      // Add to current cluster
      currentCluster.push(curr);
    } else {
      // Start new cluster
      if (currentCluster.length > 0) {
        clusters.push(buildCluster(currentCluster));
      }
      currentCluster = [curr];
    }
  }
  
  // Add final cluster
  if (currentCluster.length > 0) {
    clusters.push(buildCluster(currentCluster));
  }
  
  return clusters;
}

/**
 * Build a cluster object from a group of midpoints
 */
function buildCluster(midpoints: MidpointRecord[]): MidpointCluster {
  const prices = midpoints.map(m => m.midpoint);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const centerPrice = (minPrice + maxPrice) / 2;
  const spread = ((maxPrice - minPrice) / centerPrice) * 100;
  const spreadBps = spread * 100;
  
  const totalWeight = midpoints.reduce((sum, m) => sum + m.weight, 0);
  const unresolvedCount = midpoints.filter(m => !m.tagged).length;
  const resolvedCount = midpoints.filter(m => m.tagged).length;
  
  // Calculate gravity strength (weight / average distance)
  const avgDistance = midpoints.reduce((sum, m) => sum + Math.abs(m.distanceFromPrice), 0) / midpoints.length;
  const gravityStrength = avgDistance > 0 ? totalWeight / avgDistance : 0;
  
  const timeframes = midpoints.map(m => m.timeframe);
  
  return {
    minPrice,
    maxPrice,
    centerPrice,
    spread,
    spreadBps,
    midpoints,
    totalWeight,
    gravityStrength,
    timeframes,
    unresolvedCount,
    resolvedCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DEBT ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze all midpoint debt across timeframes
 */
export function analyzeMidpointDebt(
  midpoints: MidpointRecord[],
  currentPrice: number
): MidpointDebtAnalysis {
  const unresolvedMidpoints = midpoints.filter(m => !m.tagged);
  const resolvedMidpoints = midpoints.filter(m => m.tagged);
  
  // Cluster all unresolved midpoints
  const clusters = clusterMidpoints(unresolvedMidpoints, 0.5);
  
  // Find top cluster by gravity strength
  const topCluster = clusters.length > 0
    ? clusters.reduce((max, cluster) => cluster.gravityStrength > max.gravityStrength ? cluster : max, clusters[0])
    : null;
  
  // Find nearest debt midpoint
  const nearestDebt = unresolvedMidpoints.length > 0
    ? unresolvedMidpoints.reduce((nearest, m) => 
        Math.abs(m.distanceFromPrice) < Math.abs(nearest.distanceFromPrice) ? m : nearest,
        unresolvedMidpoints[0]
      )
    : null;
  
  // Generate summary
  let summary = '';
  if (unresolvedMidpoints.length === 0) {
    summary = 'No unresolved midpoint debt detected.';
  } else if (topCluster && topCluster.unresolvedCount >= 3) {
    summary = `${unresolvedMidpoints.length} unresolved midpoints. Strong cluster detected at ${topCluster.centerPrice.toFixed(2)} (${topCluster.timeframes.join(', ')})`;
  } else {
    summary = `${unresolvedMidpoints.length} unresolved midpoints across ${new Set(unresolvedMidpoints.map(m => m.timeframe)).size} timeframes`;
  }
  
  return {
    timestamp: new Date(),
    currentPrice,
    allMidpoints: midpoints,
    unresolvedMidpoints,
    resolvedMidpoints,
    clusters,
    topCluster,
    totalDebtCount: unresolvedMidpoints.length,
    nearestDebt,
    summary,
  };
}

/**
 * Filter midpoints by age (remove very old debt)
 */
export function filterMidpointsByAge(
  midpoints: MidpointRecord[],
  maxAgeMinutes: number
): MidpointRecord[] {
  return midpoints.filter(m => m.ageMinutes <= maxAgeMinutes);
}

/**
 * Get top N clusters by gravity strength
 */
export function getTopClusters(clusters: MidpointCluster[], n: number = 3): MidpointCluster[] {
  return [...clusters]
    .sort((a, b) => b.gravityStrength - a.gravityStrength)
    .slice(0, n);
}

/**
 * Format cluster for display
 */
export function formatCluster(cluster: MidpointCluster): string {
  const range = `${cluster.minPrice.toFixed(2)} – ${cluster.maxPrice.toFixed(2)}`;
  const tfs = cluster.timeframes.join(' • ');
  return `${range} (${tfs})`;
}

/**
 * Example usage
 */
export function exampleMidpointDebt() {
  const currentPrice = 68075;
  
  const midpoints: MidpointRecord[] = [
    createMidpointRecord('1H', 68500, 68400, new Date(), new Date(), currentPrice, 68100, 68050, new Date()),
    createMidpointRecord('4H', 68520, 68420, new Date(), new Date(), currentPrice, 68100, 68050, new Date()),
    createMidpointRecord('1D', 68510, 68410, new Date(), new Date(), currentPrice, 68100, 68050, new Date()),
    createMidpointRecord('1M', 68490, 68390, new Date(), new Date(), currentPrice, 68100, 68050, new Date()),
  ];
  
  const analysis = analyzeMidpointDebt(midpoints, currentPrice);
  
  console.log('=== MIDPOINT DEBT ANALYSIS ===');
  console.log(`Current Price: ${currentPrice}`);
  console.log(`Total Midpoints: ${analysis.allMidpoints.length}`);
  console.log(`Unresolved Debt: ${analysis.totalDebtCount}`);
  console.log(`Summary: ${analysis.summary}`);
  
  if (analysis.topCluster) {
    console.log('\nTop Cluster (AOI):');
    console.log(formatCluster(analysis.topCluster));
    console.log(`Gravity Strength: ${analysis.topCluster.gravityStrength.toFixed(2)}`);
  }
  
  return analysis;
}
