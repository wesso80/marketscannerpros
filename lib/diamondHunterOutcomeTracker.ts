import { getPoolWithVolumeBreakdown } from '@/lib/coingecko';
import {
  getDiamondPriceExtremes,
  getDueDiamondOutcomes,
  saveDiamondOutcome,
} from '@/lib/diamondHunterHistory';

function n(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function pct(current: number, initial: number): number | null {
  if (!(initial > 0) || !Number.isFinite(current)) return null;
  return Math.round((((current / initial) - 1) * 100) * 100) / 100;
}

export async function updateDiamondHunterOutcomes(limit = 6): Promise<{
  checked: number;
  saved: number;
  failed: number;
}> {
  const due = await getDueDiamondOutcomes(limit);
  let saved = 0;
  let failed = 0;

  for (const item of due) {
    try {
      const pool = await getPoolWithVolumeBreakdown(item.network, item.poolAddress);
      if (!pool?.attributes) {
        failed += 1;
        continue;
      }

      const observedAt = new Date();
      const observedPrice = n(pool.attributes.base_token_price_usd);
      if (!(observedPrice > 0)) {
        failed += 1;
        continue;
      }

      const currentLiquidity = n(pool.attributes.reserve_in_usd);
      const extremes = await getDiamondPriceExtremes(item.poolId, item.firstDetectedAt);
      const maxPrice = Math.max(extremes.max, observedPrice, item.startPriceUsd);
      const minPrice = Math.min(
        ...[extremes.min, observedPrice, item.startPriceUsd].filter((value) => value > 0),
      );

      await saveDiamondOutcome({
        poolId: item.poolId,
        horizon: item.horizon,
        targetAt: item.targetAt,
        observedAt,
        startPriceUsd: item.startPriceUsd,
        observedPriceUsd: observedPrice,
        returnPct: pct(observedPrice, item.startPriceUsd),
        mfePct: pct(maxPrice, item.startPriceUsd),
        maePct: pct(minPrice, item.startPriceUsd),
        liquidityChangePct: pct(currentLiquidity, item.firstLiquidityUsd),
        discoveryLeadMinutes: item.firstTrendingAt
          ? Math.round(((item.firstTrendingAt.getTime() - item.firstDetectedAt.getTime()) / 60_000) * 10) / 10
          : null,
      });
      saved += 1;
    } catch (error) {
      failed += 1;
      console.warn('[DiamondHunter] outcome update failed', item.poolId, item.horizon, error);
    }
  }

  return { checked: due.length, saved, failed };
}
