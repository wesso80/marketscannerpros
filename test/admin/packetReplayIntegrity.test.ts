import { beforeEach, describe, expect, it, vi } from 'vitest';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: query }));
import { buildPacketReplayReport } from '@/lib/admin/packetReplay';

beforeEach(() => vi.clearAllMocks());

describe('packet outcome trace', () => {
  it('counts mature observations only and preserves the source-to-setup trace', async () => {
    query.mockResolvedValueOnce([{ packet_type: 'position-setup', n: 2 }])
      .mockResolvedValueOnce([
        { packet_type: 'position-setup', status: 'surfaced', has_outcome: true, realised_r_5d: '1.5', evidence_quality: '80', opportunity_score: '70' },
        { packet_type: 'position-setup', status: 'surfaced', has_outcome: false, realised_r_5d: '2', evidence_quality: '80', opportunity_score: '70' },
      ])
      .mockResolvedValueOnce([{ id: 42, symbol: 'AAPL', market: 'equity', packet_id: 'immutable-packet', source_packet_id: 'scan-packet',
        model_version: 'position-levels-v2-forward-bars-v1', levels_timeframe: '1W/1D', status: 'surfaced',
        surfaced_at: '2026-09-21T12:00:00Z', outcome_status: 'partial', bars_used: 4, realised_r_5d: '2', realised_r_20d: '2' }]);
    const report = await buildPacketReplayReport('workspace-a', 30);
    expect(report.totals).toEqual({ packetsBuilt: 2, setupsLinked: 2, setupsResolved: 1, winsR5d: 1 });
    expect(report.buckets[0].avgRealisedR5d).toBe(1.5);
    expect(report.traces[0]).toMatchObject({ setupId: 42, packetId: 'immutable-packet', sourcePacketId: 'scan-packet', status: 'surfaced',
      barsUsed: 4, forwardR5d: null, forwardR20d: null, levelsTimeframe: '1W/1D' });
    expect(query.mock.calls.every(call => call[1][0] === 'workspace-a')).toBe(true);
  });

  it('leaves an empty learning cohort empty', async () => {
    query.mockResolvedValue([]);
    const report = await buildPacketReplayReport('workspace-a');
    expect(report.totals.setupsResolved).toBe(0);
    expect(report.traces).toEqual([]);
  });
});
