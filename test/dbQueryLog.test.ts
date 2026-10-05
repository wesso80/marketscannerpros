import { beforeEach, describe, expect, it, vi } from 'vitest';
import { q } from '@/lib/db';

const query = vi.fn();
const release = vi.fn();

beforeEach(() => {
  query.mockReset();
  release.mockReset();
  global.__pgPool = { connect: async () => ({ query, release }), totalCount: 1, idleCount: 1, waitingCount: 0 } as never;
});

describe('q() query failure log', () => {
  it('skips the error log for a caller-suppressed Postgres code and still throws', async () => {
    query.mockRejectedValue(Object.assign(new Error('relation "risk_governor_snapshots" does not exist'), { code: '42P01' }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(q('SELECT 1 FROM risk_governor_snapshots', [], { suppressCodes: ['42P01'] })).rejects.toMatchObject({ code: '42P01' });
    expect(error).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it('still logs an unsuppressed undefined-table error', async () => {
    query.mockRejectedValue(Object.assign(new Error('relation "context_state" does not exist'), { code: '42P01' }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(q('SELECT 1 FROM context_state')).rejects.toMatchObject({ code: '42P01' });
    expect(error.mock.calls.some((call) => String(call[0]).includes('[db] query failed'))).toBe(true);
    error.mockRestore();
  });
});
