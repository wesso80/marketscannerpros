import { beforeEach, describe, expect, it, vi } from 'vitest';
import { q } from '@/lib/db';
import { equityHistoryNotes } from '@/lib/admin/equityHistoryHealth';
vi.mock('@/lib/db', () => ({ q: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
describe('account history diagnosis', () => {
  it('identifies missing capital and legacy history in the authenticated workspace', async () => {
    vi.mocked(q).mockResolvedValueOnce([{ clean: 0, legacy: 20, latest_clean: null }]).mockResolvedValueOnce([{ starting_rows: 0 }]);
    const notes = (await equityHistoryNotes('workspace-a')).join(' ');
    expect(notes).toContain('0 account-equity observations, 20 legacy');
    expect(notes).toContain('No starting-capital entry');
    expect(vi.mocked(q).mock.calls.every(call => JSON.stringify(call[1]) === '["workspace-a"]')).toBe(true);
    expect(vi.mocked(q).mock.calls.every(call => call[0].trim().startsWith('SELECT'))).toBe(true);
  });
  it('keeps an unavailable ledger distinct from an empty ledger', async () => {
    vi.mocked(q).mockResolvedValueOnce([{ clean: 1, legacy: 0, latest_clean: '2026-09-27' }]).mockRejectedValueOnce(new Error('offline'));
    expect((await equityHistoryNotes('workspace-a')).join(' ')).toContain('ledger could not be read');
  });
});
