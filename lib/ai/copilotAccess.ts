import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator } from '@/lib/quant/operatorAuth';
import { publicAiScope } from '@/lib/publicAiQuota';
import { publicCopilot } from './publicCopilot';

const unavailable = () => NextResponse.json({
  code: 'PUBLIC_COPILOT_UNAVAILABLE',
  error: 'Educational Copilot is temporarily unavailable. Your page evidence remains available.',
}, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });

/** Public execution requires the server-created, paid quota scope. A disabled
 * rollout never reopens legacy advice. Keep the legacy handler for signed private access. */
export async function routeCopilotRequest(
  request: NextRequest,
  legacyHandler: (request: NextRequest) => Promise<Response>,
): Promise<Response> {
  if (publicAiScope()) return publicCopilot(request);
  let privateAccess = false;
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) return NextResponse.json({ error: 'Please log in' }, {
      status: 401, headers: { 'Cache-Control': 'private, no-store' },
    });
    privateAccess = session.is_admin === true || isOperator(session.cid, session.workspaceId);
  } catch {
    return unavailable();
  }
  return privateAccess ? legacyHandler(request) : unavailable();
}
