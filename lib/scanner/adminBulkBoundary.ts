import { NextRequest, NextResponse } from 'next/server';

const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, Authorization, X-Admin-Secret' };

/** Bulk ranking is retained for operators, not the public Find symbols view. */
export function adminBulkHandler(
  authorize: (req: NextRequest) => Promise<{ ok: boolean }>,
  run: (req: NextRequest) => Promise<Response>,
) {
  return async (req: NextRequest): Promise<Response> => {
    let allowed = false;
    try { allowed = (await authorize(req)).ok; }
    catch { return NextResponse.json({ error: 'Access could not be verified.' }, { status: 503, headers: privateHeaders }); }
    if (!allowed) {
      return NextResponse.json({ error: 'This scanner is restricted to administrators.', replacement: '/tools/golden-egg?view=find' }, { status: 403, headers: privateHeaders });
    }
    const response = await run(req);
    for (const [name, value] of Object.entries(privateHeaders)) response.headers.set(name, value);
    return response;
  };
}
