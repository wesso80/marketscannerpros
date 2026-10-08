/**
 * Retired (2026-10-08, pre-launch sweep): GET /api/scanner/candidates served the top daily picks with entry, stop,
 * LONG/SHORT, confidence and the canonical verdict, with no sign-in and no rate limit. Its only caller
 * (components/home/TradePermissionDashboard) is not mounted. Admin views read daily picks through admin routes.
 */
import { retiredRouteResponse } from '@/lib/api/retiredRoute';

export async function GET() {
  return retiredRouteResponse();
}
