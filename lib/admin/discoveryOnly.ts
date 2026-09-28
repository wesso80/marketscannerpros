/** Temporary owner-requested admin scope. Public/shared ingestion is deliberately excluded. */
export function adminDiscoveryOnly(): boolean {
  return !['false', '0', 'off', 'no'].includes((process.env.ADMIN_DISCOVERY_ONLY ?? 'true').trim().toLowerCase());
}
export const ADMIN_DISCOVERY_ONLY_MESSAGE = 'Other admin workflows are paused while Crypto Markets is developed. Public services continue normally.';
const background = new Set([
  '/api/cron/admin-scan', '/api/cron/persist-edge-packets', '/api/cron/arca-cycle',
  '/api/cron/arca-daily-report', '/api/cron/edge-label-outcomes', '/api/cron/edge-rebuild-matrix',
  '/api/cron/evening-packet', '/api/jobs/email-morning-brief', '/api/jobs/email-daily-review',
  '/api/jobs/email-best-opportunities', '/api/operator/engine/auto-scan',
]);
export function discoveryOnlyAction(path: string): 'allow' | 'pause_api' | 'skip_job' | 'pause_page' {
  if (!adminDiscoveryOnly()) return 'allow';
  path = path.replace(/\/+$/, '') || '/';
  if (background.has(path)) return 'skip_job';
  if (path === '/api/admin/crypto-markets/bases' || path === '/api/admin/crypto-markets/volume' || path === '/api/admin/crypto-markets/context' || path === '/api/admin/verify' || path === '/api/admin/crypto-discovery' || path === '/api/admin/crypto-discovery/analyze') return 'allow';
  if (path === '/api/admin' || path.startsWith('/api/admin/') || path.startsWith('/api/operator/engine/')) return 'pause_api';
  if (path === '/admin/crypto-markets' || path === '/admin/crypto-discovery' || path === '/admin/paused') return 'allow';
  if (path === '/admin' || path.startsWith('/admin/')) return 'pause_page';
  return 'allow';
}
