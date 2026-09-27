import { describe, expect, it } from 'vitest';
import { buildLiquidityMap } from '@/lib/admin/liquidityMap';
import type { AdminResearchPacket } from '@/lib/admin/getAdminResearchPacket';
const packet = (price: number) => ({ snapshot: { price }, liquidityLevels: {
  pdh: price + 1, pdl: price - 1, weeklyHigh: price + 2, weeklyLow: price - 2, vwap: price,
}, optionsIntelligence: { available: true, gammaWalls: [{ price: price + 1 }], maxPain: price } } as unknown as AdminResearchPacket);

describe('symbol-local liquidity maps', () => {
  it('never mutates a previous symbol while processing another symbol', () => {
    const first = buildLiquidityMap(packet(100));
    const before = JSON.stringify(first);
    for (let i = 0; i < 1000; i++) {
      const next = buildLiquidityMap(packet(200 + i));
      expect(next.buyStops).toHaveLength(2);
      expect(next.gammaWalls).toHaveLength(1);
      expect(next.forcedBuyerZones.length).toBeLessThanOrEqual(2);
      expect(next.forcedBuyerZones.every(z => z.price === 201 + i || z.price === 202 + i)).toBe(true);
      expect(next.buyStops).not.toBe(first.buyStops);
    }
    expect(JSON.stringify(first)).toBe(before);
    expect(first.integrity).toBe('symbol_local_v1');
  });
  it('returns independently owned empty arrays even without data', () => {
    const a = buildLiquidityMap({} as AdminResearchPacket);
    const b = buildLiquidityMap({} as AdminResearchPacket);
    a.buyStops.push({ price: 1, label: 'test', source: 'test' });
    expect(b.buyStops).toEqual([]);
    expect(buildLiquidityMap({} as AdminResearchPacket).buyStops).toEqual([]);
  });
});
