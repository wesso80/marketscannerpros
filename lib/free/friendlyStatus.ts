import { FREE_COPY } from '@/components/free/copy';
export function friendlyStatus(value: string | null | undefined, loading = false): string {
  if (loading) return FREE_COPY.loading;
  if (value === 'HISTORICAL_OPTIONS') return 'Historical options data';
  if (value === 'CHECKING') return FREE_COPY.loading;
  if (value === 'MOCK') return 'Example data';
  if (value === 'NOT ENABLED') return 'Not enabled';
  if (value === 'Unknown') return 'Unknown';
  if (value === 'LIVE') return 'Live data';
  if (value?.startsWith('LIVE ·')) return 'Partial data';
  if (!value || /^(?:N\/A|—+|\$0\.00|0\.00x)$/i.test(value.trim()) || /unknown|unverified|awaiting|pending|missing|unavailable/i.test(value)) return FREE_COPY.unavailable;
  if (/degraded|data health|stale|delayed/i.test(value)) return FREE_COPY.olderData;
  return value;
}
