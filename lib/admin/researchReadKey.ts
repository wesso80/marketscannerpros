/**
 * Read-only research key for agents (Claude, Codex) reviewing admin data.
 *
 * A request may use the key only when ALL hold:
 *   - method is GET or HEAD;
 *   - the path is on RESEARCH_READ_PATHS (or /api/admin/symbol/<one symbol>);
 *   - no `refresh` / `force` query parameter (those re-run work instead of reading);
 *   - `X-Admin-Research-Key` matches one entry of ADMIN_RESEARCH_READ_KEYS ("label:key,label:key", keys ≥ 32 chars);
 *   - ADMIN_RESEARCH_READ_EMAIL is still on ADMIN_EMAILS (removing it, or the env var, revokes every key).
 * The identity is that admin's /admin/login workspace (hashWorkspaceId(`admin_<email>`)), so reads show the same data.
 * It never authorizes writes, orders, or any path not listed here. Edge-safe: no Node imports.
 */

export const RESEARCH_READ_HEADER = 'x-admin-research-key';

/** Admin read endpoints the key may call. Each GET was checked to read stored or computed data without writing. */
export const RESEARCH_READ_PATHS: ReadonlySet<string> = new Set([
  // Scanner & Symbol analysis
  '/api/admin/scan',
  '/api/admin/scanner/live',
  '/api/admin/cross-asset',
  '/api/admin/macro-pulse',
  '/api/admin/insider',
  '/api/admin/regime-matrix',
  '/api/admin/daily-packet',
  '/api/admin/crypto-markets/context',
  '/api/admin/crypto-markets/momentum',
  '/api/admin/crypto-markets/breakout-verdicts',
  // Signal outcomes & backtests
  '/api/admin/signals',
  '/api/admin/signals/stats',
  '/api/admin/signals/scorecard',
  '/api/admin/backtest-lab',
  '/api/admin/model-diagnostics',
  '/api/admin/calibration',
  '/api/admin/rank-calibration',
  '/api/admin/edge-ledger',
  '/api/admin/crypto-markets/backtest',
  // Paper portfolio & journal (simulated records only)
  '/api/admin/portfolio-lab/summary',
  '/api/admin/portfolio-lab/positions',
  '/api/admin/portfolio-lab/orders',
  '/api/admin/portfolio-lab/trades',
  '/api/admin/portfolio-lab/performance',
  '/api/admin/portfolio-lab/risk',
  '/api/admin/portfolio-lab/analytics',
  '/api/admin/portfolio-lab/journal',
  '/api/admin/portfolio-lab/holdings',
  '/api/admin/crypto-markets/paper',
  '/api/admin/journal-learning',
  '/api/admin/mistakes',
  // Health & data sources
  '/api/admin/health',
  '/api/admin/data-health',
  '/api/admin/system/health',
  '/api/admin/diagnostics/scanners',
  '/api/admin/scanner-data-audit',
  '/api/admin/cg-usage',
  '/api/admin/brain/engine-health',
]);

const SYMBOL_PATH = /^\/api\/admin\/symbol\/[^/]{1,40}$/;
const WORK_PARAMS = ['refresh', 'force'];

export function researchReadRequestAllowed(pathname: string, method: string, searchParams?: URLSearchParams): boolean {
  const m = method.toUpperCase();
  if (m !== 'GET' && m !== 'HEAD') return false;
  if (searchParams && WORK_PARAMS.some((p) => searchParams.has(p))) return false;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return RESEARCH_READ_PATHS.has(path) || SYMBOL_PATH.test(path);
}

type KeyEntry = { label: string; key: string };

export function parseResearchKeys(raw: string | undefined | null): KeyEntry[] {
  if (!raw) return [];
  return raw.split(',').flatMap((entry) => {
    const i = entry.indexOf(':');
    if (i <= 0) return [];
    const label = entry.slice(0, i).trim().toLowerCase();
    const key = entry.slice(i + 1).trim();
    return /^[a-z0-9_-]{1,32}$/.test(label) && key.length >= 32 ? [{ label, key }] : [];
  });
}

/** Constant-time for equal lengths; always walks the longer string. */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export type ResearchReadGrant = { label: string; email: string; cid: string };

/** The key's grant for this request, or null. `adminEmails` is the current ADMIN_EMAILS list (lower-case). */
export function researchReadGrant(input: {
  pathname: string;
  method: string;
  searchParams?: URLSearchParams;
  headerValue: string | null | undefined;
  keysRaw: string | undefined;
  email: string | undefined;
  adminEmails: string[];
}): ResearchReadGrant | null {
  const provided = input.headerValue?.trim();
  if (!provided || !researchReadRequestAllowed(input.pathname, input.method, input.searchParams)) return null;
  const email = input.email?.trim().toLowerCase();
  if (!email || !input.adminEmails.includes(email)) return null;
  let label: string | null = null;
  for (const entry of parseResearchKeys(input.keysRaw)) {
    if (safeEqual(provided, entry.key) && label == null) label = entry.label;
  }
  return label ? { label, email, cid: `admin_${email}` } : null;
}

export function adminEmailList(raw: string | undefined): string[] {
  return (raw || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}
