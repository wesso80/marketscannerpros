import { retiredRouteResponse } from '@/lib/api/retiredRoute';

// Retired: Market Focus is no longer generated (nothing external called it and its only reader was optional input
// to the admin Morning Brief). The daily_market_focus tables and their data are left in place.
export async function POST() {
  return retiredRouteResponse();
}
