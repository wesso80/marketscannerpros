import { currentAvBudget, runWithAvBudget } from '@/lib/avLimiter';
import { retiredRouteResponse } from '@/lib/api/retiredRoute';

// Retired: Market Focus is no longer generated (nothing external called it and its only reader was optional input
// to the admin Morning Brief). The daily_market_focus tables and their data are left in place.
export async function GET(): Promise<Response> {
  if (!currentAvBudget()) return runWithAvBudget({ lane: 'scheduled', feature: 'job-generate-market-focus' }, () => GET());
  return retiredRouteResponse();
}
export async function POST(): Promise<Response> {
  if (!currentAvBudget()) return runWithAvBudget({ lane: 'scheduled', feature: 'job-generate-market-focus' }, () => POST());
  return retiredRouteResponse();
}
