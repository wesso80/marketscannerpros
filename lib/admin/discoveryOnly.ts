/** Temporary owner-requested admin scope. Public/shared ingestion is deliberately excluded. */
export function adminDiscoveryOnly(): boolean {
  return !['false', '0', 'off', 'no'].includes((process.env.ADMIN_DISCOVERY_ONLY ?? 'true').trim().toLowerCase());
}
export const ADMIN_DISCOVERY_ONLY_MESSAGE = 'Other admin workflows are paused while Crypto Markets is developed. Public services continue normally.';
const background = new Set([
  '/api/cron/admin-scan', '/api/cron/persist-edge-packets',
  '/api/cron/arca-daily-report', '/api/cron/edge-label-outcomes', '/api/cron/edge-rebuild-matrix',
  '/api/cron/evening-packet', '/api/jobs/email-morning-brief', '/api/jobs/email-daily-review',
  '/api/jobs/email-best-opportunities', '/api/operator/engine/auto-scan',
]);
/** Crypto Markets surfaces that stay live while everything else is paused. Add a route here when it ships under /admin/crypto-markets. */
const cryptoScope = new Set([
  '/api/admin/crypto-markets/setup-email', '/api/admin/crypto-markets/backtest', '/api/admin/crypto-markets/rotation',
  '/api/admin/crypto-markets/market-data', '/api/admin/crypto-markets/new-listings', '/api/admin/crypto-markets/history',
  '/api/admin/crypto-markets/harness', '/api/cron/arca-cycle', '/api/admin/crypto-markets/paper',
  '/api/admin/crypto-markets/early-momentum', '/api/admin/crypto-markets/momentum', '/api/admin/crypto-markets/bases',
  '/api/admin/crypto-markets/volume', '/api/admin/crypto-markets/context', '/api/admin/verify',
  '/api/admin/crypto-discovery', '/api/admin/crypto-discovery/analyze',
  '/api/admin/crypto-markets/forward-score', '/api/admin/crypto-markets/recommendations',
  '/api/admin/crypto-markets/calibration', '/api/admin/crypto-markets/learning',
  '/api/admin/crypto-markets/jev',
]);
/** Owner-approved exceptions: the two Jev evidence pages (news verification, transcript audit) and only the routes they call. */
const jevEquityScope = new Set([
  '/admin/equity-research', '/api/admin/equity-research', '/api/admin/equity-news-jev',
  '/admin/transcripts', '/api/admin/transcripts',
]);
export function discoveryOnlyAction(path: string): 'allow' | 'pause_api' | 'skip_job' | 'pause_page' {
  if (!adminDiscoveryOnly()) return 'allow';
  path = path.replace(/\/+$/, '') || '/';
  if (background.has(path)) return 'skip_job';
  if (cryptoScope.has(path) || jevEquityScope.has(path)) return 'allow';
  if (path === '/api/admin' || path.startsWith('/api/admin/') || path.startsWith('/api/operator/engine/')) return 'pause_api';
  if (path === '/admin/crypto-markets' || path === '/admin/crypto-discovery' || path === '/admin/paused') return 'allow';
  if (path === '/admin' || path.startsWith('/admin/')) return 'pause_page';
  return 'allow';
}
