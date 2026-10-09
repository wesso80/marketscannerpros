/**
 * Scanner expectancy uses measured 24h moves from fixed-labeller verdicts (not ±1R per verdict, not old-method
 * labels), and only nudges a hit's elite score from 30 measured outcomes, shrunk for small samples.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LABELLER_FIX_AT } from '@/lib/admin/signalStats';

const m = vi.hoisted(() => ({ sql: [] as string[], params: [] as unknown[][], sym: [] as unknown[], pb: [] as unknown[] }));
vi.mock('@/lib/db', () => ({ q: vi.fn(async (sql: string, params: unknown[]) => { m.sql.push(sql); m.params.push(params); return /GROUP BY symbol/.test(sql) ? m.sym : m.pb; }) }));
import { MIN_SAMPLE_FOR_BOOST, enrichHitsWithExpectancy, expectancyScoreBoost, profileFromRow } from '@/lib/admin/expectancy';

beforeEach(() => { m.sql = []; m.params = []; m.sym = []; m.pb = []; });

describe('expectancy on measured moves', () => {
  it('queries fixed-labeller verdicts only and sums signed 24h moves', async () => {
    await enrichHitsWithExpectancy([{ symbol: 'aapl', playbook: 'Breakout', eliteScore: 60 } as never]);
    for (const sql of m.sql) {
      expect(sql).toMatch(/outcome_measured_at >= \$2::timestamptz/);
      expect(sql).toMatch(/CASE WHEN UPPER\(trade_bias\) = 'SHORT' THEN -pct_move_24h ELSE pct_move_24h END/);
      expect(sql).not.toMatch(/THEN 1\s+WHEN outcome = 'wrong' THEN -1/);
    }
    expect(m.params.map((p) => p[1])).toEqual([LABELLER_FIX_AT, LABELLER_FIX_AT]);
  });

  it('profile reports win rate without neutral and average move in %', () => {
    const p = profileFromRow({ sample: 40, wins: 18, losses: 12, total_move: 20, gross_win: 50, gross_loss: -30 });
    expect(p).toMatchObject({ sample: 40, winRate: 0.6, avgMovePct: 0.5, totalMovePct: 20 });
    expect(p.profitFactor).toBeCloseTo(50 / 30);
    expect(p.note).toMatch(/\+0\.50% avg 24h move over 40 measured signals \(before costs\)/);
  });

  it('no score nudge under the minimum sample; shrunk and capped above it', () => {
    expect(expectancyScoreBoost(5, MIN_SAMPLE_FOR_BOOST - 1)).toBe(0);
    expect(expectancyScoreBoost(1.2, 30)).toBeCloseTo((1.2 - 0.2) * 4 * 0.5);
    expect(expectancyScoreBoost(50, 1000)).toBe(8);
    expect(expectancyScoreBoost(-50, 1000)).toBe(-8);
  });

  it('a small track record leaves the elite score unchanged; overlap does not inflate the sample', async () => {
    m.sym = [{ symbol: 'AAPL', sample: 20, wins: 15, losses: 2, total_move: 60, gross_win: 70, gross_loss: -10 }];
    m.pb = [{ playbook: 'Breakout', sample: 20, wins: 15, losses: 2, total_move: 60, gross_win: 70, gross_loss: -10 }];
    const [hit] = await enrichHitsWithExpectancy([{ symbol: 'AAPL', playbook: 'Breakout', eliteScore: 60 } as never]) as any[];
    expect(hit.expectancy.scoreBoost).toBe(0); // 20 + 20 overlapping is not 40
    expect(hit.eliteScore).toBe(60);
  });
});
