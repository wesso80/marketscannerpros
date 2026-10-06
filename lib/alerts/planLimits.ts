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

/** Same 403 body for every user-initiated create and re-activation path. */
export function alertLimitReachedPayload(tier: AlertPlanTier, current: number) {
  const maxAlerts = ALERT_LIMITS[tier];
  const message = tier === 'pro'
    ? `You have ${current} active alerts. Pro allows ${maxAlerts}. Pause or delete one to add a new one.`
    : `Your ${tier} plan allows ${maxAlerts} active alerts. Upgrade to create more.`;
  return {
    error: 'Alert limit reached' as const,
    message,
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
