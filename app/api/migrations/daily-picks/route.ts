import { retiredRouteResponse } from '@/lib/api/retiredRoute';

// Retired: this web route ran schema DDL behind a secret that could be sent in the URL. The schema now lives in
// migrations/008_daily_picks.sql, applied with the other SQL migrations.
export async function GET() {
  return retiredRouteResponse();
}
