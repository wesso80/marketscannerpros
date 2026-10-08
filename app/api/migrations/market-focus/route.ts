import { retiredRouteResponse } from '@/lib/api/retiredRoute';

// Retired: this web route ran schema DDL behind a secret that could be sent in the URL. The schema now lives in
// migrations/129_daily_market_focus.sql, applied with the other SQL migrations.
export async function POST() {
  return retiredRouteResponse();
}
