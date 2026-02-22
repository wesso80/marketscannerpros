import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

const COOKIE_NAME = 'msp_risk_guard';
const MAX_DISABLE_HOURS = 24; // Auto re-enable after 24 hours

function parseEnabledFromCookie(req: NextRequest): boolean {
  const cookieValue = req.cookies.get(COOKIE_NAME)?.value;
  if (!cookieValue || cookieValue === 'on') return true;
  // Check if disabled cookie has expired (24h max)
  if (cookieValue.startsWith('off:')) {
    const disabledAt = Number(cookieValue.split(':')[1]);
    if (Number.isFinite(disabledAt)) {
      const hoursElapsed = (Date.now() - disabledAt) / (1000 * 60 * 60);
      if (hoursElapsed >= MAX_DISABLE_HOURS) return true; // Auto re-enable
    }
  }
  return cookieValue === 'off' ? false : true;
}

export async function GET(req: NextRequest) {
  const enabled = parseEnabledFromCookie(req);
  return NextResponse.json({ enabled });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const enabled = body?.enabled !== false;

    // Audit log: record guard toggle events
    const session = await getSessionFromCookie().catch(() => null);
    if (session?.workspaceId) {
      try {
        await q(
          `INSERT INTO guard_audit_log (workspace_id, action, timestamp, source)
           VALUES ($1, $2, NOW(), 'preferences_api')
           ON CONFLICT DO NOTHING`,
          [session.workspaceId, enabled ? 'ENABLE' : 'DISABLE']
        );
      } catch {
        // Table may not exist yet — log to console as fallback
        console.warn(`[risk-governor] Guard toggle audit: workspace=${session.workspaceId} action=${enabled ? 'ENABLE' : 'DISABLE'} at=${new Date().toISOString()}`);
      }
    }
    console.info(`[risk-governor] Guard ${enabled ? 'ENABLED' : 'DISABLED'} for workspace ${session?.workspaceId ?? 'unknown'}`);

    const res = NextResponse.json({ enabled });
    res.cookies.set({
      name: COOKIE_NAME,
      value: enabled ? 'on' : `off:${Date.now()}`, // Track disable timestamp for 24h auto re-enable
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: enabled
        ? 60 * 60 * 24 * 365
        : 60 * 60 * MAX_DISABLE_HOURS, // Disabled cookie expires after 24h
    });
    return res;
  } catch (error) {
    console.error('risk governor preferences update error:', error);
    return NextResponse.json({ error: 'Failed to update preference' }, { status: 500 });
  }
}
