import { describe, expect, it, vi } from 'vitest';

// M1: data age from the newest bar's CLOSE (AV timestamps are bar starts), forming bars not counted as fresh.

vi.mock('@/lib/db', () => ({ q: vi.fn(async () => []) }));
vi.mock('@/lib/operator/orchestrator', async (orig) => {
  const actual = await orig<typeof import('@/lib/operator/orchestrator')>();
  return {
    ...actual,
    runScan: vi.fn(async (req: { symbols: string[] }, _c: unknown, provider: { getBars: (s: string, m: string, t: string) => Promise<unknown[]> }) => {
      await provider.getBars(req.symbols[0], 'EQUITIES', '15m');
      return { requestId: 'r', timestamp: new Date().toISOString(), environmentMode: 'RESEARCH', engineVersions: {}, symbolsScanned: 1, radar: [], pipelines: [], snapshots: [], errors: [] };
    }),
  };
});

import { barAgeFromClose, barWindowMs } from '@/lib/admin/barAge';
import { buildAdminResearchScan } from '@/lib/admin/getAdminResearchPacket';
import { DEFAULT_ADMIN_SCAN_CONTEXT } from '@/lib/admin/scan-context';
import { memoizeProvider } from '@/lib/operator/market-data';
import type { Bar } from '@/types/operator';
import { readFileSync } from 'node:fs';

const MIN = 60_000;

describe('barAgeFromClose', () => {
  it('a just-closed 15m bar is 0 s old (it used to read 900 s: DELAYED at best)', () => {
    const now = Date.parse('2026-09-25T19:45:00Z'); // 15:45 ET
    const a = barAgeFromClose('2026-09-25T19:30:00.000Z', '15m', 'EQUITIES', now);
    expect(a.ageSec).toBe(0);
    expect(a.forming).toBe(false);
  });

  it('a forming bar is flagged and aged from the last completed bar (its open)', () => {
    const now = Date.parse('2026-09-25T19:35:00Z');
    const a = barAgeFromClose('2026-09-25T19:30:00.000Z', '15m', 'EQUITIES', now);
    expect(a.forming).toBe(true);
    expect(a.ageSec).toBe(300);
  });

  it('equity intraday bars are capped at the session close; daily bars close at the session close', () => {
    expect(barWindowMs('2026-09-25T19:30:00.000Z', '1h', 'EQUITIES')?.closeMs).toBe(Date.parse('2026-09-25T20:00:00Z'));
    const d = barAgeFromClose('2026-09-25', '1d', 'EQUITIES', Date.parse('2026-09-25T20:10:00Z'));
    expect(d.ageSec).toBe(600);
    // Day after Thanksgiving 2026 (27 Nov) closes early at 13:00 ET = 18:00Z.
    expect(barWindowMs('2026-11-27', '1d', 'EQUITIES')?.closeMs).toBe(Date.parse('2026-11-27T18:00:00Z'));
  });

  it('crypto: open + timeframe; daily closes at the next 00:00 UTC', () => {
    expect(barWindowMs('2026-09-26T10:00:00.000Z', '1h', 'CRYPTO')?.closeMs).toBe(Date.parse('2026-09-26T11:00:00Z'));
    expect(barWindowMs('2026-09-26', '1d', 'CRYPTO')?.closeMs).toBe(Date.parse('2026-09-27T00:00:00Z'));
  });

  it('unknown timestamps give no age', () => {
    expect(barAgeFromClose(null, '15m').ageSec).toBeNull();
    expect(barAgeFromClose('garbage', '15m').ageSec).toBeNull();
  });
});

describe('research packet data truth uses the close', () => {
  function bars(lastOpenMs: number, n = 80): Bar[] {
    return Array.from({ length: n }, (_, i) => ({
      symbol: 'AAPL', market: 'EQUITIES', timeframe: '15m',
      timestamp: new Date(lastOpenMs - (n - 1 - i) * 15 * MIN).toISOString(),
      open: 100 + (i % 3), high: 102 + (i % 3), low: 99 + (i % 3), close: 101 + (i % 3), volume: 1000,
    }));
  }
  const provider = (series: Bar[]) => memoizeProvider({
    getBars: vi.fn(async () => series),
    getKeyLevels: vi.fn(async () => []),
    getCrossMarketState: vi.fn(async () => ({ vixState: 'unknown', dxyState: 'neutral', breadthState: 'neutral' })),
    getEventWindow: vi.fn(async () => ({ isActive: false, severity: null, nextEventAt: null })),
  } as never);

  it('bar closed 60 s ago on 15m → LIVE (was DELAYED at 960 s)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-09-25T19:46:00Z'));
    const scan = await buildAdminResearchScan({
      symbol: 'AAPL', market: 'EQUITIES', timeframe: '15m', scanContext: { ...DEFAULT_ADMIN_SCAN_CONTEXT },
      provider: provider(bars(Date.parse('2026-09-25T19:30:00Z'))),
    });
    vi.useRealTimers();
    expect(scan.packet.dataTruth.ageSec).toBe(60);
    expect(scan.packet.dataTruth.status).toBe('LIVE');
  });

  it('forming last bar → noted as forming', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-09-25T19:33:00Z'));
    const scan = await buildAdminResearchScan({
      symbol: 'AAPL', market: 'EQUITIES', timeframe: '15m', scanContext: { ...DEFAULT_ADMIN_SCAN_CONTEXT },
      provider: provider(bars(Date.parse('2026-09-25T19:30:00Z'))),
    });
    vi.useRealTimers();
    expect(scan.packet.dataTruth.notes.join(' ')).toContain('Forming bar');
    expect(scan.packet.dataTruth.ageSec).toBe(180);
  });

  it('source: the packet no longer ages from the bar open', () => {
    const src = readFileSync('lib/admin/getAdminResearchPacket.ts', 'utf8');
    expect(src).toContain('barAgeFromClose(lastBar?.timestamp, timeframe, market)');
    expect(src).not.toContain('(Date.now() - lastBarMs) / 1000');
  });
});
