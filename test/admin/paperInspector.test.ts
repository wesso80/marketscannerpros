import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/db', () => ({ q: vi.fn() }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => ({ ok: true, workspaceId: 'w' })) }));
vi.mock('@/lib/admin/edgePacketSnapshots', () => ({ loadEdgePackets: vi.fn() }));
vi.mock('@/lib/admin/portfolio-lab/portfolioStore', () => ({ getDefaultPortfolio: vi.fn(async () => null) }));
import { loadEdgePackets } from '@/lib/admin/edgePacketSnapshots';
import { GET } from '@/app/api/admin/portfolio-lab/edge-packets/route';
const now = Date.parse('2026-09-28T14:00:00Z');
beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(now); vi.mocked(loadEdgePackets).mockReset(); });
function row() { return { packetId: 'p', symbol: 'BTC', market: 'CRYPTO', assetClass: 'crypto', generatedAt: new Date(now-1000).toISOString(),
  adminState: 'PRIME', thesisStatus: 'alive', freshness: 'fresh', opportunityRankScore: 90, evidenceQualityScore: 90, trapRiskScore: 1,
  packetJson: { bias: 'LONG', price: 100, priceAt: new Date(now-1000).toISOString(), generatedAt: new Date(now-1000).toISOString(), staleAfter: new Date(now+600000).toISOString(),
    entry: { trigger: 777 }, stopLoss: { level: 666 }, takeProfit: { tp1: 999 },
    positionLevels: { status: 'ok', timeframe: '1W/1D', direction: 'LONG', entryStatus: 'in_zone', entryTrigger: 100, stop: 90, tp1: 120,
      entryZoneLow: 99, entryZoneHigh: 101, minRewardR: 1.5, belowMinR: false, dailyAsOf: '2026-09-27' } } }; }
it('inspects latest-per-symbol position levels and actual packet price', async () => {
  vi.mocked(loadEdgePackets).mockResolvedValue([row()] as never);
  const body = await (await GET(new NextRequest('https://test/api'))).json();
  expect(loadEdgePackets).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w', latestPerSymbol: true }));
  expect(body.data.packets[0]).toMatchObject({ entry: 100, stop: 90, tp1: 120, currentPrice: 100, rrToTp1: 2, gatePassed: true, levelsTimeframe: '1W/1D' });
});
it('cannot show pass for stale prices even when intraday gates pass', async () => {
  const r = row(); r.packetJson.priceAt = '2026-09-27T14:00:00Z';
  vi.mocked(loadEdgePackets).mockResolvedValue([r] as never);
  const body = await (await GET(new NextRequest('https://test/api'))).json();
  expect(body.data.packets[0]).toMatchObject({ gatePassed: false, gateReasons: ['current_price_missing_or_stale'] });
  expect(body.data.summary.positionReview.ready).toBe(0);
});
