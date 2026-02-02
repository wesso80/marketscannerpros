// =====================================================
// MSP AI CONTEXT API - Build unified context
// GET /api/ai/context
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { buildUnifiedContext } from '@/lib/ai/context';
import type { PageContext } from '@/lib/ai/types';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { pageContext, pageData } = body as { 
      pageContext: PageContext; 
      pageData?: Record<string, unknown>;
    };

    if (!pageContext?.name) {
      return NextResponse.json({ error: 'Page context required' }, { status: 400 });
    }

    const tier = (session.tier || 'free') as 'free' | 'pro' | 'pro_trader';

    const context = await buildUnifiedContext(
      session.workspaceId,
      tier,
      pageContext,
      pageData || {}
    );

    return NextResponse.json({ success: true, context });

  } catch (error) {
    console.error('Error building AI context:', error);
    return NextResponse.json({ error: 'Failed to build context' }, { status: 500 });
  }
}
