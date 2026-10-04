import { FREE_COPY } from '@/components/free/copy';
export function friendlyStatus(value: string | null | undefined, loading = false): string {
  if (loading) return FREE_COPY.loading;
  if (!value || /unknown|awaiting|pending|missing|unavailable/i.test(value)) return FREE_COPY.unavailable;
  if (/degraded|data health|stale|delayed/i.test(value)) return FREE_COPY.olderData;
  return value;
}
