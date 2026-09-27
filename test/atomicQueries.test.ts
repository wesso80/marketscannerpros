import { beforeEach, describe, expect, it, vi } from 'vitest';
import { atomicQueries, q } from '@/lib/db';

const query = vi.fn();
const release = vi.fn();
beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [{ ok: true }] });
  release.mockReset();
  global.__pgPool = { connect: async () => ({ query, release }) } as never;
});

describe('atomic engine queries', () => {
  it('commits all engine queries on one connection', async () => {
    await atomicQueries(async () => { await q('INSERT ledger'); await q('INSERT snapshot'); });
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN', "SET LOCAL statement_timeout = '15s'", "SET LOCAL idle_in_transaction_session_timeout = '20s'",
      'INSERT ledger', 'INSERT snapshot', 'COMMIT',
    ]);
    expect(release).toHaveBeenCalledOnce();
  });
  it('rolls back even if optional code swallows a SQL failure', async () => {
    query.mockImplementation(async (sql) => { if (sql === 'BROKEN') throw new Error('db failed'); return { rows: [] }; });
    await expect(atomicQueries(async () => { await q('INSERT ledger'); await q('BROKEN').catch(() => {}); })).rejects.toThrow('db failed');
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(query).not.toHaveBeenCalledWith('COMMIT');
  });
  it('prevents writes after the budget expires and rolls back', async () => {
    await expect(atomicQueries(async () => { await q('INSERT ledger'); }, -1)).rejects.toThrow('budget');
    expect(query).not.toHaveBeenCalledWith('INSERT ledger', []);
    expect(query).toHaveBeenCalledWith('ROLLBACK');
  });
});
