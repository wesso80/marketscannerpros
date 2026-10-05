/** Display-only labels. Never pass these back to lifecycle or outcome APIs. */
const LABELS: Record<string, string> = {
  GOOD: 'Complete data', LIVE: 'Live at capture', DEGRADED: 'Limited data',
  STALE: 'Older observation', MISSING: 'Missing data',
  ARMED: 'Criteria met', MANAGE: 'Follow-up', STALK: 'Developing', WATCH: 'Under review',
  BLOCKED: 'Criteria not met', COOLDOWN: 'Paused', NO_SETUP: 'No matching setup',
  pending: 'Outcome pending', confirmed: 'Confirmed', invalidated: 'Invalidated',
  expired: 'Expired', reviewed: 'Reviewed',
};
export function savedCaseLabel(value: string | null | undefined): string {
  return value ? LABELS[value] || 'Not supplied' : 'Not supplied';
}
