/**
 * LiquidityMap — unified liquidity / magnet view for an AdminEdgePacket.
 *
 * Pulls from existing fields on AdminResearchPacket (liquidityLevels,
 * optionsIntelligence) and shapes them into a single object the
 * admin UI can render without re-deriving anything.
 *
 * Per options-data-rules.md: missing options data is shown as missing,
 * never substituted with a proxy.
 */

import type { AdminResearchPacket } from "./getAdminResearchPacket";

export interface LiquidityZone {
  price: number;
  label: string;
  /** Source so the UI can cite it: "PDH", "VWAP", "gamma:wall", etc. */
  source: string;
}

export interface LiquidityMap {
  buyStops: LiquidityZone[];           // resting buy-stop liquidity above
  sellStops: LiquidityZone[];          // resting sell-stop liquidity below
  priorHigh: LiquidityZone | null;     // PDH / weekly high
  priorLow: LiquidityZone | null;      // PDL / weekly low
  vwapMagnets: LiquidityZone[];
  gammaWalls: LiquidityZone[];
  maxPain: LiquidityZone | null;
  failedBreakouts: LiquidityZone[];
  failedReclaims: LiquidityZone[];
  /** Derived: zones where forced flow is likely (stops + gamma overlap). */
  forcedBuyerZones: LiquidityZone[];
  forcedSellerZones: LiquidityZone[];
  /** True if any options-derived map is missing. */
  optionsDataMissing: boolean;
}

const EMPTY_MAP: LiquidityMap = {
  buyStops: [], sellStops: [],
  priorHigh: null, priorLow: null,
  vwapMagnets: [], gammaWalls: [],
  maxPain: null,
  failedBreakouts: [], failedReclaims: [],
  forcedBuyerZones: [], forcedSellerZones: [],
  optionsDataMissing: false,
};

export function buildLiquidityMap(packet: AdminResearchPacket): LiquidityMap {
  const lvls = packet.liquidityLevels;
  const snap = packet.snapshot;
  const px = snap?.price ?? 0;

  if (!lvls && !snap) return EMPTY_MAP;

  const map: LiquidityMap = { ...EMPTY_MAP };

  // Prior highs/lows — sweep targets.
  if (lvls?.pdh) {
    map.priorHigh = { price: lvls.pdh, label: "PDH", source: "operator:levels" };
    if (lvls.pdh > px) {
      map.buyStops.push({ price: lvls.pdh, label: "Above PDH", source: "operator:levels" });
    }
  }
  if (lvls?.pdl) {
    map.priorLow = { price: lvls.pdl, label: "PDL", source: "operator:levels" };
    if (lvls.pdl < px) {
      map.sellStops.push({ price: lvls.pdl, label: "Below PDL", source: "operator:levels" });
    }
  }
  if (lvls?.weeklyHigh && lvls.weeklyHigh > px) {
    map.buyStops.push({ price: lvls.weeklyHigh, label: "Weekly High", source: "operator:levels" });
  }
  if (lvls?.weeklyLow && lvls.weeklyLow < px) {
    map.sellStops.push({ price: lvls.weeklyLow, label: "Weekly Low", source: "operator:levels" });
  }

  // VWAP magnet.
  if (lvls?.vwap) {
    map.vwapMagnets.push({ price: lvls.vwap, label: "Session VWAP", source: "operator:vwap" });
  }

  // Gamma walls + max pain — from options intelligence.
  const opts = packet.optionsIntelligence as
    | (typeof packet.optionsIntelligence & {
        gammaWalls?: { price: number; label?: string }[];
        maxPain?: number | null;
        available?: boolean;
      })
    | undefined;

  if (!opts || opts.available === false) {
    map.optionsDataMissing = true;
  } else {
    if (Array.isArray(opts.gammaWalls)) {
      for (const w of opts.gammaWalls) {
        if (typeof w?.price === "number") {
          map.gammaWalls.push({
            price: w.price,
            label: w.label ?? `Gamma wall @ ${w.price}`,
            source: "options:gex",
          });
        }
      }
    } else {
      map.optionsDataMissing = true;
    }

    if (typeof opts.maxPain === "number") {
      map.maxPain = { price: opts.maxPain, label: "Max Pain", source: "options:gex" };
    }
  }

  // Forced flow zones — overlap of stop liquidity and a gamma wall within 0.5% band.
  for (const wall of map.gammaWalls) {
    for (const stop of map.buyStops) {
      if (within(wall.price, stop.price, 0.005)) {
        map.forcedBuyerZones.push({
          price: stop.price,
          label: `Stops + gamma overlap (${stop.label})`,
          source: "derived:overlap",
        });
      }
    }
    for (const stop of map.sellStops) {
      if (within(wall.price, stop.price, 0.005)) {
        map.forcedSellerZones.push({
          price: stop.price,
          label: `Stops + gamma overlap (${stop.label})`,
          source: "derived:overlap",
        });
      }
    }
  }

  return map;
}

function within(a: number, b: number, tol: number): boolean {
  if (b === 0) return false;
  return Math.abs(a - b) / b <= tol;
}
