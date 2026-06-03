/**
 * Arca marketing sweep — drafts marketing posts from current admin signals.
 *
 * GET/POST /api/jobs/arca-marketing-sweep
 * Auth:    cron secret OR admin secret
 *
 * Behaviour:
 *  - Pulls top opportunities + recent change tape via internal admin GETs.
 *  - Drafts ONE post per channel listed in ?channels= (default: discord).
 *  - Drafts are inserted as 'pending' for human approval. Nothing publishes.
 *
 * Cron suggestion: every 4 hours during US market hours.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth, verifyCronAuth } from '@/lib/adminAuth';
import { insertDraft, MARKETING_CHANNELS, type MarketingChannel } from '@/lib/arcaMarketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function fetchInternal(req: NextRequest, path: string): Promise<any> {
  try {
    const url = `${req.nextUrl.origin}${path}`;
    const headers: Record<string, string> = { accept: 'application/json' };
    const cookie = req.headers.get('cookie');
    if (cookie) headers.cookie = cookie;
    const adminSecret = process.env.ADMIN_SECRET;
    if (adminSecret) headers['x-admin-secret'] = adminSecret;
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function handler(req: NextRequest) {
  if (!verifyCronAuth(req) && !verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl;
  const channelsParam = (url.searchParams.get('channels') || 'discord')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => MARKETING_CHANNELS.includes(s as any)) as MarketingChannel[];

  if (channelsParam.length === 0) {
    return NextResponse.json({ error: 'no valid channels' }, { status: 400 });
  }

  // Observe — pull live admin context
  const [opps, tape, brief] = await Promise.all([
    fetchInternal(req, '/api/admin/opportunities'),
    fetchInternal(req, '/api/admin/change-tape'),
    fetchInternal(req, '/api/admin/morning-brief'),
  ]);

  const groundingData = {
    top_opportunities: Array.isArray(opps?.opportunities)
      ? opps.opportunities.slice(0, 5)
      : Array.isArray(opps)
      ? opps.slice(0, 5)
      : opps,
    change_tape: Array.isArray(tape?.events) ? tape.events.slice(0, 8) : tape,
    morning_brief: brief,
    generated_at: new Date().toISOString(),
  };

  const created: any[] = [];
  const errors: any[] = [];

  for (const ch of channelsParam) {
    try {
      const draft = await insertDraft({
        channel: ch,
        topic: 'sweep: top opportunities + change tape',
        data: groundingData,
        source: 'cron',
      });
      created.push({ id: draft.id, channel: ch });
    } catch (e: any) {
      errors.push({ channel: ch, error: e?.message || 'failed' });
    }
  }

  return NextResponse.json({
    ok: true,
    created,
    errors,
    channels: channelsParam,
    grounding_keys: Object.keys(groundingData),
  });
}

export const GET = handler;
export const POST = handler;
