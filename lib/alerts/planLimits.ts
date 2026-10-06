/**
 * Active alert limits per plan. Shared by the create paths and the Alerts page
 * "Plan & Limits" panel so the page shows the cap that is enforced.
 * Pro is 100 active alerts. Free stays at 3. Price alerts with no level are
 * excluded by countActiveAlertsForCap. Smart alerts that store 0 still count.
 */
export const ALERT_LIMITS = {
  free: 3,
  pro: 100,
} as const;

export type AlertPlanTier = keyof typeof ALERT_LIMITS;

/** Same 403 body for every user-initiated create path. */
export function alertLimitReachedPayload(tier: AlertPlanTier, current: number) {
  const maxAlerts = ALERT_LIMITS[tier];
  return {
    error: 'Alert limit reached' as const,
    message: `Your ${tier} plan allows ${maxAlerts} active alerts. Upgrade to create more.`,
    limit: maxAlerts,
    current,
  };
}

/** Reason returned when an automatic create path skips instead of throwing. */
export function alertCapSkipReason(tier: AlertPlanTier, current: number): string {
  const maxAlerts = ALERT_LIMITS[tier];
  return `Active alert limit reached (${current} of ${maxAlerts}). No new alert was created.`;
}
