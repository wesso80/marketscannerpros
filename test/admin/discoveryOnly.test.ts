import { afterEach, expect, it, vi } from 'vitest';
import { adminDiscoveryOnly, discoveryOnlyAction } from '@/lib/admin/discoveryOnly';
afterEach(() => vi.unstubAllEnvs());
it('defaults to the owner-requested discovery-only scope and can be explicitly restored', () => {
  vi.stubEnv('ADMIN_DISCOVERY_ONLY', undefined);
  expect(adminDiscoveryOnly()).toBe(true);
  vi.stubEnv('ADMIN_DISCOVERY_ONLY', 'false');
  expect(discoveryOnlyAction('/api/cron/arca-cycle')).toBe('allow');
  expect(discoveryOnlyAction('/api/admin/live-scanner')).toBe('allow');
});
it.each(['/api/admin/crypto-markets/backtest', '/api/admin/crypto-markets/rotation', '/api/admin/crypto-markets/market-data', '/api/admin/crypto-markets/new-listings', '/api/admin/crypto-markets/history', '/api/admin/crypto-markets/harness', '/api/admin/crypto-markets/early-momentum', '/api/admin/crypto-markets/setup-email', '/api/cron/arca-cycle', '/api/admin/crypto-markets/paper', '/api/admin/crypto-markets/bases', '/api/admin/crypto-markets/momentum', '/api/admin/crypto-markets/volume', '/api/admin/crypto-markets/context', '/api/admin/verify', '/api/admin/crypto-discovery', '/api/admin/crypto-discovery/analyze', '/admin/crypto-markets', '/admin/crypto-discovery', '/admin/paused'])('allows auth and discovery: %s', path => {
  expect(discoveryOnlyAction(path)).toBe('allow');
});
it.each(['/api/admin/live-scanner', '/api/admin/portfolio-lab/cycle', '/api/admin/macro-pulse', '/api/admin/crypto-discovery/other', '/api/operator/engine/scan'])('blocks other admin APIs before handler work: %s', path => {
  expect(discoveryOnlyAction(path)).toBe('pause_api');
});
it.each(['/api/cron/admin-scan', '/api/cron/persist-edge-packets', '/api/cron/arca-daily-report', '/api/cron/edge-label-outcomes', '/api/cron/edge-rebuild-matrix', '/api/cron/evening-packet', '/api/jobs/email-morning-brief', '/api/jobs/email-daily-review', '/api/jobs/email-best-opportunities', '/api/operator/engine/auto-scan/'])('makes private jobs explicit no-ops: %s', path => {
  expect(discoveryOnlyAction(path)).toBe('skip_job');
});
it.each(['/api/cron/macro-ingest', '/api/cron/global-m2-ingest', '/api/cron/refresh-fundamentals', '/api/cron/label-ai-outcomes', '/api/jobs/scan-universe', '/api/jobs/scan-daily', '/api/scanner/run', '/api/alerts/check', '/tools/scanner', '/api/stripe/webhook'])('preserves public/shared workloads: %s', path => {
  expect(discoveryOnlyAction(path)).toBe('allow');
});
it.each(['/admin', '/admin/live-scanner', '/admin/portfolio-lab/positions'])('replaces inactive pages before their data fetches: %s', path => {
  expect(discoveryOnlyAction(path)).toBe('pause_page');
});
