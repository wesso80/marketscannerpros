"use client";

import { useUserTierContext } from "./UserTierProvider";
import { isPaidTier } from "./tiers";

export type UserTier = "free" | "pro" | "pro_trader" | "anonymous";

interface TierInfo {
  tier: UserTier;
  isLoading: boolean;
  isLoggedIn: boolean;
  isAdmin: boolean;
  email: string | null;
}

/**
 * Tier info for the current user. Delegates to the app-wide UserTierProvider so the
 * whole page shares ONE /api/me request instead of one per consuming component.
 */
export function useUserTier(): TierInfo {
  const { tier, isLoading, isLoggedIn, isAdmin, email } = useUserTierContext();
  return { tier, isLoading, isLoggedIn, isAdmin, email };
}

// 2026 pricing simplification: there is ONE paid plan (Pro). The legacy
// `pro_trader` tier is retained here only so existing subscribers whose DB
// row still reads `pro_trader` keep full access. Every gate below treats
// `pro` and `pro_trader` identically (`hasProAccess`). Free/anonymous stay
// gated as before. Do not add new `pro_trader`-only gates.
const isPaid = (tier: UserTier) => isPaidTier(tier);

// Feature access helpers
export const canAccessBacktest = (tier: UserTier) => isPaid(tier);
export const canAccessBrain = (tier: UserTier) => isPaid(tier);
export const canAccessScanner = (tier: UserTier) => tier === "anonymous" || tier === "free" || isPaid(tier);
export const canAccessUnlimitedScanning = (tier: UserTier) => isPaid(tier);
export const FREE_DAILY_SCAN_LIMIT = 5;
export const ANONYMOUS_DAILY_SCAN_LIMIT = 3;
export const canExportCSV = (tier: UserTier) => isPaid(tier);
export const canAccessAdvancedJournal = (tier: UserTier) => isPaid(tier);
export const canAccessJournal = (tier: UserTier) => isPaid(tier);
export const canAccessJournalIntelligence = (tier: UserTier) => isPaid(tier);
export const canAccessPortfolioInsights = (tier: UserTier) => isPaid(tier);
export const canAccessCryptoCommandCenter = (tier: UserTier) => isPaid(tier);
export const canAccessCatalystStudy = (tier: UserTier) => isPaid(tier);
export const canAccessOptionsTerminal = (tier: UserTier) => isPaid(tier);
export const canAccessTimeScanner = (tier: UserTier) => isPaid(tier);
export const canAccessDeepAnalysis = (tier: UserTier) => isPaid(tier);
export const canAccessGoldenEgg = (tier: UserTier) => isPaid(tier);
export const canAccessOptionsConfluence = (tier: UserTier) => isPaid(tier);
export const canAccessConfluenceScanner = (tier: UserTier) => isPaid(tier);
export const canAccessVolatilityEngine = (tier: UserTier) => isPaid(tier);
export const canAccessScalper = (tier: UserTier) => isPaid(tier);
export const canAccessSuggestions = (tier: UserTier) => isPaid(tier);
export const getPortfolioLimit = (tier: UserTier) => tier === "anonymous" || tier === "free" ? 3 : Infinity;
export const getAILimit = (tier: UserTier) => (isPaid(tier) ? 50 : 10);
