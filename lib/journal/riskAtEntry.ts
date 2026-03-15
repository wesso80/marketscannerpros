import { q } from '@/lib/db';

export const NORMALIZED_RISK_PER_TRADE = 0.01;
const DEFAULT_DYNAMIC_RISK_PER_TRADE = 0.005;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeRiskFraction(value: unknown, fallback: number): number {
  const parsed = toFiniteNumber(value);
  if (parsed == null || parsed <= 0) return fallback;

  if (parsed > 1 && parsed <= 100) {
    return parsed / 100;
  }

  if (parsed > 0 && parsed <= 1) {
    return parsed;
  }

  return fallback;
}

export async function getLatestPortfolioEquity(workspaceId: string): Promise<number | null> {
  const rows = await q<{ total_value: string | number }>(
    `SELECT total_value
       FROM portfolio_performance
      WHERE workspace_id = $1
        AND total_value > 0
      ORDER BY snapshot_date DESC, created_at DESC
      LIMIT 1`,
    [workspaceId]
  );

  const equity = toFiniteNumber(rows[0]?.total_value);
  return equity != null && equity > 0 ? equity : null;
}

const DEFAULT_EQUITY_FALLBACK = 10_000;

/**
 * Resolve account equity for a workspace.
 * Priority: 1) user-set account_equity in user_subscriptions
 *           2) latest portfolio_performance snapshot
 *           3) $10,000 fallback
 */
export async function getUserAccountEquity(workspaceId: string): Promise<number> {
  // 1. Check user-set account equity
  try {
    const rows = await q<{ account_equity: string | number | null }>(
      `SELECT account_equity FROM user_subscriptions WHERE workspace_id = $1 LIMIT 1`,
      [workspaceId]
    );
    const userSet = toFiniteNumber(rows[0]?.account_equity);
    if (userSet != null && userSet > 0) return userSet;
  } catch {
    // Column may not exist yet — fall through
  }

  // 2. Check latest portfolio snapshot
  const portfolioEquity = await getLatestPortfolioEquity(workspaceId);
  if (portfolioEquity != null) return portfolioEquity;

  // 3. Fallback
  return DEFAULT_EQUITY_FALLBACK;
}

export function computeEntryRiskMetrics(input: {
  pl?: unknown;
  equityAtEntry?: unknown;
  dynamicRiskPerTrade?: unknown;
  normalizedR?: unknown;
  dynamicR?: unknown;
}): {
  riskPerTradeAtEntry: number;
  equityAtEntry: number | null;
  normalizedR: number | null;
  dynamicR: number | null;
} {
  const pl = toFiniteNumber(input.pl);
  const equityAtEntry = toFiniteNumber(input.equityAtEntry);
  const dynamicRiskPerTrade = normalizeRiskFraction(input.dynamicRiskPerTrade, DEFAULT_DYNAMIC_RISK_PER_TRADE);

  const computedNormalizedR =
    equityAtEntry != null && equityAtEntry > 0 && pl != null
      ? pl / (equityAtEntry * NORMALIZED_RISK_PER_TRADE)
      : null;

  const computedDynamicR =
    equityAtEntry != null && equityAtEntry > 0 && pl != null && dynamicRiskPerTrade > 0
      ? pl / (equityAtEntry * dynamicRiskPerTrade)
      : null;

  const providedNormalizedR = toFiniteNumber(input.normalizedR);
  const providedDynamicR = toFiniteNumber(input.dynamicR);

  return {
    riskPerTradeAtEntry: dynamicRiskPerTrade,
    equityAtEntry: equityAtEntry != null && equityAtEntry > 0 ? equityAtEntry : null,
    normalizedR: providedNormalizedR ?? computedNormalizedR,
    dynamicR: providedDynamicR ?? computedDynamicR,
  };
}
