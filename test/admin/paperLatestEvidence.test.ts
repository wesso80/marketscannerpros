import { describe, expect, it } from 'vitest';
import { gateRow, latestPaperPackets, runDecisionEngine } from '@/lib/admin/portfolio-lab/decisionEngine';
import { ARCA_DEFAULT_SETTINGS } from '@/lib/admin/portfolio-lab/constants';
import type { EdgePacketRow } from '@/lib/admin/edgePacketSnapshots';
import type { ArcaPortfolio } from '@/lib/admin/portfolio-lab/types';
const portfolio = { workspaceId: 'w', settings: ARCA_DEFAULT_SETTINGS } as ArcaPortfolio;
function row(symbol: string, id: number, extra: Partial<EdgePacketRow> = {}): EdgePacketRow {
  return { id, symbol, market: 'CRYPTO', assetClass: 'crypto', packetId: `${symbol}-${id}`,
    generatedAt: new Date(Date.now() - (1000 - id) * 1000).toISOString(),
    doNothing: true, adminState: 'IGNORE', thesisStatus: 'stale', freshness: 'stale',
    opportunityRankScore: 0, evidenceQualityScore: 0, trapRiskScore: 0,
    packetJson: {}, ...extra } as EdgePacketRow;
}
describe('latest paper evidence', () => {
  it('deduplicates before limiting and retains symbols behind repeated snapshots', () => {
    const input = [...Array.from({length: 200}, (_, i) => row('A', i)), row('B', 1), row('C', 1)];
    expect(latestPaperPackets(input, 3).map(r => r.symbol)).toEqual(['A', 'B', 'C']);
    expect(input).toHaveLength(202);
  });
  it('keeps markets separate and breaks timestamp ties by newest row ID', () => {
    const a = row('ABC', 1); const b = row('ABC', 2, { generatedAt: a.generatedAt });
    expect(latestPaperPackets([a, b, row('ABC', 3, { market: 'EQUITIES' })]).map(r => r.id)).toEqual([3, 2]);
  });
  it('a newer blocked row supersedes an older attractive row before gating', async () => {
    const old = row('A', 1, { doNothing: false, adminState: 'PRIME', thesisStatus: 'alive', freshness: 'real-time', opportunityRankScore: 99, evidenceQualityScore: 99 });
    const current = row('A', 2);
    const result = await runDecisionEngine({ portfolio, rows: [old, current] });
    expect(result.scannedPackets).toBe(1);
    expect(result.selected).toEqual([]);
    expect(result.rejected.map(r => r.packetId)).toEqual(['A-2']);
  });
  it('a five-idea cap still evaluates the whole unique universe', async () => {
    const result = await runDecisionEngine({ portfolio, maxNewIdeas: 5, rows: Array.from({length: 300}, (_, i) => row(`S${i}`, i)) });
    expect(result.scannedPackets).toBe(300);
    expect(result.rejected).toHaveLength(300);
  });
});
it('selects a valid latest position candidate while ignoring an older higher score', async () => {
  const now = Date.now();
  const current = row('BTC', 10, { doNothing: true, adminState: 'PRIME', thesisStatus: 'alive', freshness: 'real-time', opportunityRankScore: 90, evidenceQualityScore: 90,
    packetJson: { doNothing: { code: 'POOR_RR' }, positionDoNothing: { version: 'position-rr.v1', verdict: null }, bias: 'BULLISH_RESEARCH', price: 100, priceAt: new Date(now - 1000).toISOString(), generatedAt: new Date(now - 1000).toISOString(), staleAfter: new Date(now + 600000).toISOString(),
      positionLevels: { status: 'ok', timeframe: '1W/1D', direction: 'LONG', entryStatus: 'in_zone', entryTrigger: 100, entryZoneLow: 100, entryZoneHigh: 101, stop: 90, tp1: 120, minRewardR: 1.5, belowMinR: false, dailyAsOf: new Date(now - 86400000).toISOString() },
    } as EdgePacketRow['packetJson'] });
  const old = row('BTC', 1, { opportunityRankScore: 99 });
  const result = await runDecisionEngine({ portfolio, rows: [old, current], maxNewIdeas: 5 });
  expect(result.scannedPackets).toBe(1);
  expect(result.selected).toHaveLength(1);
  expect(result.selected[0]).toMatchObject({ entry: 100, stop: 90, tp1: 120, row: { packetId: 'BTC-10' } });
  current.packetJson.price = 120;
  const chased = await runDecisionEngine({ portfolio, rows: [current] });
  expect(chased.selected).toHaveLength(0);
  expect(chased.rejected[0].reasons).toContain('current_price_outside_entry_zone');
});


it("uses a newly evaluated position verdict but preserves legacy and independent blocks", () => {
  const r = row('BTC', 1, { doNothing: true, adminState: 'PRIME', thesisStatus: 'weakening', freshness: 'real-time', opportunityRankScore: 90, evidenceQualityScore: 90,
    packetJson: { doNothing: { code: 'POOR_RR' }, positionDoNothing: { version: 'position-rr.v1', verdict: null } } as EdgePacketRow['packetJson'] });
  expect(gateRow(r, portfolio)).toEqual([]);
  r.packetJson.positionDoNothing!.verdict = { code: 'MACRO_RISK', headline: 'Macro risk', detail: [], severity: 2 };
  expect(gateRow(r, portfolio)).toContain('do_nothing_reason:MACRO_RISK');
  delete r.packetJson.positionDoNothing;
  expect(gateRow(r, portfolio)).toContain('do_nothing_reason:POOR_RR');
  r.packetJson.positionDoNothing = { version: 'position-rr.v1', verdict: null };
  r.adminState = 'INVALIDATED'; r.freshness = 'stale';
  expect(gateRow(r, portfolio)).toEqual(expect.arrayContaining(['admin_state_INVALIDATED', 'freshness_stale']));
});
