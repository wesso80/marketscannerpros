export type AppTier = "free" | "pro" | "pro_trader";

export const AI_DAILY_LIMITS: Record<AppTier, number> = {
  free: 10,
  pro: 50,
  pro_trader: 200,
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