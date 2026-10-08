import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator } from '@/lib/quant/operatorAuth';
import { withPublicAiQuota, publicAiScope } from '@/lib/publicAiQuota';
import { publicJournalAnalysis } from '@/lib/ai/publicJournalAnalysis';
import { legacyJournalAnalysis } from '@/lib/ai/legacyJournalAnalysis';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = withPublicAiQuota(async (req: NextRequest) => {
  if (publicAiScope()) return publicJournalAnalysis(req);
  const session = await getSessionFromCookie();
  if (session?.workspaceId && (session.is_admin === true || isOperator(session.cid, session.workspaceId))) {
    return legacyJournalAnalysis(req);
  }
  return NextResponse.json({ error: session?.workspaceId
    ? 'Educational Journal analysis is temporarily unavailable.' : 'Please log in' }, {
    status: session?.workspaceId ? 503 : 401, headers: { 'Cache-Control': 'private, no-store' },
  });
}, 'journal/analyze');
