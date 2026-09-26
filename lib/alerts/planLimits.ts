/**
 * Active price-alert limits per plan. Shared by POST /api/alerts (enforcement) and the
 * Alerts page "Plan & Limits" panel so the page shows the cap that is enforced (TR-25:
 * it used to show Pro as "∞" while the API stopped at 999).
 */
export const ALERT_LIMITS = {
  free: 3,
  pro: 999,
} as const;
