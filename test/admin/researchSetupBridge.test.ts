import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.query, tx: mocks.transaction }));
import { projectResearchSetup, captureResearchSetups } from '@/lib/admin/researchSetupBridge';
import type { AdminEdgePacket } from '@/lib/admin/edgePacket';
import { positionLevelView } from '@/lib/admin/positionLevels';

function packet(overrides: Partial<AdminEdgePacket> = {}): AdminEdgePacket {
  return {
    packetId: 'saved-source-1', symbol: 'AAPL', assetClass: 'equity', market: 'EQUITIES', timeframe: '15m',
    generatedAt: '2026-09-25T20:15:00Z', staleAfter: '2026-09-28T14:00:00Z',
    bias: 'LONG', setupType: 'SQUEEZE_EXPANSION', adminState: 'READY', doNothing: null,
    freshness: 'delayed', evidenceQualityScore: 80, opportunityRankScore: 70, missingFields: [], price: 101,
    positionLevels: { ...positionLevelView(null, 'LONG'), status: 'ok', direction: 'LONG',
      entryStatus: 'in_zone', entryTrigger: 100, stop: 95, tp1: 110, tp1R: 2, belowMinR: false },
    ...overrides,
  } as AdminEdgePacket;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({ rows: [{ id: 7 }] });
  mocks.transaction.mockImplementation(async work => work({ query: mocks.query }));
});

describe('position research to immutable ledger', () => {
  it('preserves weekly/daily levels, source identity and market in the captured plan', () => {
    const result = projectResearchSetup('workspace-a', packet());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('fixture should qualify');
    expect(result.setup).toMatchObject({ market: 'equity', entryPrice: 100, stopPrice: 95, targetPrice: 110, direction: 'long' });
    expect(result.setup.featureVector).toMatchObject({ sourcePacketId: 'saved-source-1', levelsTimeframe: '1W/1D', sourceScanTimeframe: '15m' });
    expect(result.packet.id).toBe(result.setup.packetId);
    expect(result.packet.packetType).toBe('position-setup');
  });

  it('deduplicates the same plan across rescans and days without sharing workspace packet IDs', () => {
    const first = projectResearchSetup('workspace-a', packet(), Date.parse('2026-09-26T12:00:00Z'));
    const repeat = projectResearchSetup('workspace-a', packet({ packetId: 'new-scan', price: 102 }), Date.parse('2026-09-27T12:00:00Z'));
    const other = projectResearchSetup('workspace-b', packet());
    if (!first.ok || !repeat.ok || !other.ok) throw new Error('fixture should qualify');
    expect(first.setup.setupKey).toBe(repeat.setup.setupKey);
    expect(first.packet.id).toBe(repeat.packet.id);
    expect(other.packet.id).not.toBe(first.packet.id);
  });

  it.each(['waiting', 'past_zone', 'beyond_stop'] as const)('does not capture an unconfirmed or expired entry (%s)', status => {
    const p = packet(); p.positionLevels!.entryStatus = status;
    expect(projectResearchSetup('workspace-a', p)).toEqual({ ok: false, reason: 'daily_entry_not_confirmed_in_zone' });
  });

  it('does not substitute intraday levels or invent a distant target to meet 1.5R', () => {
    const p = packet(); p.positionLevels!.tp1 = 103;
    expect(projectResearchSetup('workspace-a', p).ok).toBe(false);
    p.positionLevels = undefined;
    expect(projectResearchSetup('workspace-a', p).ok).toBe(false);
    expect(projectResearchSetup('workspace-a', packet({ freshness: 'stale' })).ok).toBe(false);
    expect(projectResearchSetup('', packet()).ok).toBe(false);
  });

  it('keeps equity and crypto identities distinct and supports mirrored short plans', () => {
    const long = projectResearchSetup('workspace-a', packet());
    const p = packet({ assetClass: 'crypto', market: 'CRYPTO', bias: 'SHORT' });
    p.positionLevels = { ...p.positionLevels!, direction: 'SHORT', stop: 105, tp1: 90 };
    const short = projectResearchSetup('workspace-a', p);
    if (!short.ok || !long.ok) throw new Error('fixture should qualify');
    expect(short.setup.market).toBe('crypto');
    expect(short.setup.direction).toBe('short');
    expect(short.setup.setupKey).not.toBe(long.setup.setupKey);
  });

  it('writes the packet and surfaced setup in one transaction and reports failures honestly', async () => {
    const result = await captureResearchSetups('workspace-a', [packet()]);
    expect(result).toMatchObject({ eligible: 1, linked: 1, failed: 0 });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0][0]).toContain('INSERT INTO admin_market_packets');
    expect(mocks.query.mock.calls[1][0]).toContain("'surfaced'");
    expect(mocks.query.mock.calls[1][1][0]).toBe('workspace-a');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.transaction.mockRejectedValueOnce(new Error('transaction rolled back'));
    expect(await captureResearchSetups('workspace-a', [packet()])).toMatchObject({ linked: 0, failed: 1 });
    vi.restoreAllMocks();
  });
});
