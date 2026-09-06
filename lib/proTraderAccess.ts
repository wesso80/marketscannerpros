import { isFreeForAllMode, isProductionAccessBypassAllowed } from './entitlements';

export function isTemporaryProTraderBypassActive(nowMs: number = Date.now()): boolean {
  const freeForAllMode = isFreeForAllMode();
  if (freeForAllMode) return true;

  const untilRaw = process.env.PRO_TRADER_BYPASS_UNTIL || process.env.TEMP_PRO_TRADER_BYPASS_UNTIL;
  if (!untilRaw) return false;
  if (!isProductionAccessBypassAllowed()) {
    console.error('[access] Temporary Pro Trader bypass ignored in production because ALLOW_PROD_ACCESS_BYPASS is not true');
    return false;
  }

  const untilMs = Date.parse(untilRaw);
  if (!Number.isFinite(untilMs)) return false;

  return nowMs <= untilMs;
}

function getBypassExpiryIso(): string | null {
  const untilRaw = process.env.PRO_TRADER_BYPASS_UNTIL || process.env.TEMP_PRO_TRADER_BYPASS_UNTIL;
  if (!untilRaw) return null;
  const untilMs = Date.parse(untilRaw);
  if (!Number.isFinite(untilMs)) return null;
  return new Date(untilMs).toISOString();
}

function logBypassStatusOnce(): void {
  const globalKey = '__msp_pro_trader_bypass_logged__';
  const state = globalThis as typeof globalThis & { [key: string]: boolean | undefined };
  if (state[globalKey]) return;
  state[globalKey] = true;

  const freeForAllMode = isFreeForAllMode();
  const bypassActive = isTemporaryProTraderBypassActive();
  const expiresAt = getBypassExpiryIso();

  if (freeForAllMode) {
    console.log('[access] FREE_FOR_ALL_MODE is active (all Pro Trader gates bypassed)');
    return;
  }

  if (bypassActive && expiresAt) {
    console.log(`[access] Temporary Pro Trader bypass ACTIVE until ${expiresAt}`);
    return;
  }

  if (process.env.PRO_TRADER_BYPASS_UNTIL || process.env.TEMP_PRO_TRADER_BYPASS_UNTIL) {
    console.log('[access] Temporary Pro Trader bypass is configured but not active (expired or invalid timestamp)');
  } else {
    console.log('[access] Temporary Pro Trader bypass not configured');
  }
}

// 2026 pricing simplification: there is now exactly ONE paid plan (Pro).
// Old Pro and old Pro Trader access have been consolidated. This function
// keeps its historical name because ~20 API routes still import it, but it
// now returns true for BOTH `pro` and `pro_trader` (legacy) tiers. New code
// should prefer `hasProAccess()` from `lib/entitlements`.
export function hasProTraderAccess(tier: string | null | undefined): boolean {
  logBypassStatusOnce();
  if (tier === 'pro' || tier === 'pro_trader') return true;
  return isTemporaryProTraderBypassActive();
}
