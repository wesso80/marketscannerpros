/**
 * Catalyst Gate — Earnings & Event Proximity Checker
 * @internal — NEVER import into user-facing components.
 *
 * Checks whether a symbol has an upcoming catalyst (earnings, ex-dividend, etc.)
 * that would make it unsafe to enter a position. Used as a hard gate in the
 * Permission Engine — symbols with earnings within N days are blocked.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CatalystProximity {
  hasEarnings: boolean;
  daysToEarnings: number | null;
  catalystType?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
}

interface EarningsEntry {
  symbol: string;
  reportDate: string;
  fiscalDateEnding?: string;
  estimate?: string;
  currency?: string;
}

// ─── In-memory cache (per pipeline run) ─────────────────────────────────────

let earningsCache: Map<string, CatalystProximity> | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Fetch upcoming earnings from Alpha Vantage EARNINGS endpoint.
 * Caches for 4 hours to avoid repeated AV calls.
 */
async function fetchEarningsCalendar(): Promise<Map<string, EarningsEntry>> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return new Map();

  const url = `https://www.alphavantage.co/query?function=EARNINGS&horizon=3month&apikey=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: 14400 } });
  if (!res.ok) return new Map();

  const data = await res.json();
  const entries: EarningsEntry[] = data?.data ?? [];

  const map = new Map<string, EarningsEntry>();
  for (const e of entries) {
    if (e.symbol && e.reportDate) {
      // Keep the nearest earnings date per symbol
      const existing = map.get(e.symbol);
      if (!existing || e.reportDate < existing.reportDate) {
        map.set(e.symbol, e);
      }
    }
  }
  return map;
}

// ─── Main Function ──────────────────────────────────────────────────────────

/**
 * Check catalyst proximity for a batch of symbols.
 * Returns a Map<symbol, CatalystProximity>.
 *
 * Earnings within 2 days = EXTREME (hard gate should block)
 * Earnings within 5 days = HIGH
 * Earnings within 14 days = MEDIUM
 * No earnings = LOW
 */
export async function checkCatalystProximity(
  symbols: string[],
): Promise<Map<string, CatalystProximity>> {
  // Return from cache if fresh
  if (earningsCache && Date.now() < cacheExpiry) {
    const result = new Map<string, CatalystProximity>();
    for (const s of symbols) {
      result.set(s, earningsCache.get(s) ?? { hasEarnings: false, daysToEarnings: null, severity: 'LOW' });
    }
    return result;
  }

  // Fetch fresh earnings calendar
  let earningsMap: Map<string, EarningsEntry>;
  try {
    earningsMap = await fetchEarningsCalendar();
  } catch {
    // If fetch fails, return safe defaults (no block)
    const result = new Map<string, CatalystProximity>();
    for (const s of symbols) {
      result.set(s, { hasEarnings: false, daysToEarnings: null });
    }
    return result;
  }

  const now = new Date();
  const fullCache = new Map<string, CatalystProximity>();

  for (const [symbol, entry] of earningsMap) {
    const reportDate = new Date(entry.reportDate);
    const diffMs = reportDate.getTime() - now.getTime();
    const daysTo = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysTo < 0) {
      // Earnings already passed
      fullCache.set(symbol, { hasEarnings: false, daysToEarnings: null, severity: 'LOW' });
    } else {
      let severity: CatalystProximity['severity'] = 'LOW';
      if (daysTo <= 2) severity = 'EXTREME';
      else if (daysTo <= 5) severity = 'HIGH';
      else if (daysTo <= 14) severity = 'MEDIUM';

      fullCache.set(symbol, {
        hasEarnings: true,
        daysToEarnings: daysTo,
        catalystType: 'earnings',
        severity,
      });
    }
  }

  // Update cache
  earningsCache = fullCache;
  cacheExpiry = Date.now() + CACHE_TTL_MS;

  // Build result for requested symbols
  const result = new Map<string, CatalystProximity>();
  for (const s of symbols) {
    result.set(s, fullCache.get(s) ?? { hasEarnings: false, daysToEarnings: null, severity: 'LOW' });
  }
  return result;
}

/**
 * Quick check for a single symbol. Returns true if earnings are within `blockDays`.
 */
export function shouldBlockForCatalyst(
  proximity: { hasEarnings: boolean; daysToEarnings: number | null } | undefined,
  blockDays = 2,
): boolean {
  if (!proximity?.hasEarnings || proximity.daysToEarnings == null) return false;
  return proximity.daysToEarnings <= blockDays;
}
