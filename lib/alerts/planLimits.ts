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

/** Plain sentence shown when an automatic create path skips at the cap. */
export function alertCapSkipReason(tier: AlertPlanTier, _current?: number): string {
  const maxAlerts = ALERT_LIMITS[tier];
  return `Alert not created: you're at your plan's limit of ${maxAlerts} active alerts.`;
}

/** Window event so the page that posted the create can show `alertCapSkipReason`. */
export const ALERT_CAP_NOTICE_EVENT = 'msp-alert-cap-notice';

export function publishAlertCapNotice(message: string) {
  if (typeof window === 'undefined' || !message.trim()) return;
  window.dispatchEvent(new CustomEvent(ALERT_CAP_NOTICE_EVENT, { detail: message }));
}
