import { afterEach, describe, expect, it, vi } from 'vitest';
import { pausedAdminRequest, pausedAdminAvRequest } from '@/lib/admin/adminEquities';
afterEach(() => vi.unstubAllEnvs());
describe('admin-only equity pause', () => {
  it('does not change public requests', () => {
    vi.stubEnv('ADMIN_EQUITIES_PAUSED', 'true');
    expect(pausedAdminRequest('/api/scanner/run', { market: 'EQUITIES' })).toBe(false);
    expect(pausedAdminRequest('/api/options', {})).toBe(false);
    expect(pausedAdminRequest('/api/admin/scanner/live', { market: 'CRYPTO' })).toBe(false);
  });
  it('blocks admin equity and options research', () => {
    vi.stubEnv('ADMIN_EQUITIES_PAUSED', 'true');
    expect(pausedAdminRequest('/api/admin/scanner/live', { market: 'EQUITIES' })).toBe(true);
    expect(pausedAdminRequest('/api/admin/options-architect', {})).toBe(true);
  });
  it('blocks equity functions only on the admin AV boundary', () => {
    vi.stubEnv('ADMIN_EQUITIES_PAUSED', 'true');
    const url = (fn: string) => 'https://www.alphavantage.co/query?function=' + fn;
    expect(pausedAdminAvRequest(url('TIME_SERIES_DAILY_ADJUSTED'))).toBe(true);
    expect(pausedAdminAvRequest(url('OVERVIEW'))).toBe(true);
    expect(pausedAdminAvRequest(url('CRYPTO_INTRADAY'))).toBe(false);
    expect(pausedAdminAvRequest(url('TREASURY_YIELD'))).toBe(false);
  });
  it('is reversible', () => {
    vi.stubEnv('ADMIN_EQUITIES_PAUSED', 'false');
    expect(pausedAdminRequest('/api/admin/options-architect', {})).toBe(false);
  });
});
