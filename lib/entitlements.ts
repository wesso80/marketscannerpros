export type AppTier = "free" | "pro" | "pro_trader";

export const AI_DAILY_LIMITS: Record<AppTier, number> = {
  free: 10,
  pro: 50,
  pro_trader: 50,
};

/** Model selection per tier — Pro Trader gets GPT-4.1 for superior analysis */
export const AI_MODEL_BY_TIER: Record<AppTier, string> = {
  free: 'gpt-4o-mini',
  pro: 'gpt-4o-mini',
  pro_trader: 'gpt-4.1',
};

export function isFreeForAllMode(): boolean {
  return process.env.FREE_FOR_ALL_MODE === "true";
}

export function normalizeTier(tier: string | null | undefined): AppTier {
  if (tier === "pro_trader") return "pro_trader";
  if (tier === "pro") return "pro";
  return "free";
}

export function getDailyAiLimit(tier: string | null | undefined): number {
  return AI_DAILY_LIMITS[normalizeTier(tier)];
}

export function hasProAccess(tier: string | null | undefined): boolean {
  return normalizeTier(tier) !== "free";
}