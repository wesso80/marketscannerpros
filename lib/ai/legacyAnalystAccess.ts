import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator } from '@/lib/quant/operatorAuth';

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' };

/** The retired public Analyst may only run for a verified private session.
 * This gate must wrap quota admission, so rejected calls cannot reserve credits,
 * replay old public answers, run migrations or reach the legacy model prompt. */
export function privateAnalystHandler(handler: (request: NextRequest) => Promise<Response>) {
  return async (request: NextRequest): Promise<Response> => {
    let allowed = false;
    try {
      const session = await getSessionFromCookie();
      if (!session?.workspaceId) return NextResponse.json({ error: 'Please log in' }, { status: 401, headers });
      allowed = session.is_admin === true || isOperator(session.cid, session.workspaceId);
    } catch {
      return NextResponse.json({ error: 'Access could not be verified.' }, { status: 503, headers });
    }
    if (!allowed) return NextResponse.json({
      code: 'LEGACY_ANALYST_PRIVATE',
      error: 'This legacy assistant is restricted to administrators. Use MSP Copilot on your research page.',
      replacement: '/tools/golden-egg',
    }, { status: 403, headers });
    return handler(request);
  };
}
