import { retiredRouteResponse } from '@/lib/api/retiredRoute';

// Retired: the old options endpoint answered with a 301 JSON pointer to /api/options-scan and has no caller in the app.
export async function POST() {
  return retiredRouteResponse();
}

export async function GET() {
  return retiredRouteResponse();
}
