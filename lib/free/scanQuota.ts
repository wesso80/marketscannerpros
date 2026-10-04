import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getClientIP } from '@/lib/rateLimit';
import { q } from '@/lib/db';
import { FREE_DAILY_SCAN_LIMIT } from './limits';
export const VISITOR_COOKIE = 'msp_scan_visitor';
export function quotaKey(req: NextRequest, workspaceId?: string | null): string {
  if (workspaceId && workspaceId !== 'anonymous') return workspaceId;
  const id = req.cookies.get(VISITOR_COOKIE)?.value;
  if (id && /^[a-f0-9-]{36}$/i.test(id)) return `anon:${id}`;
  // Cookie-blocked clients retain one IP bucket; never issue a fresh quota on each POST.
  return `anon:ip:${createHash('sha256').update(getClientIP(req)).digest('hex')}`;
}
export function prepareVisitor(req: NextRequest, workspaceId?: string | null) {
  const id = !workspaceId && !req.cookies.get(VISITOR_COOKIE)?.value ? randomUUID() : null;
  return {
    key: quotaKey(req, workspaceId),
    attach(response: NextResponse) {
      if (id) response.cookies.set(VISITOR_COOKIE, id, { httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 31536000 });
      return response;
    },
  };
}
export function quotaDay(now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  return { date, resetsAt: new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString() };
}
export async function readScanQuota(key: string, now = new Date()) {
  const { date, resetsAt } = quotaDay(now);
  const rows = await q<{ scan_count: number }>('SELECT scan_count FROM scan_usage WHERE workspace_id = $1 AND scan_date = $2', [key, date]);
  return { used: Number(rows[0]?.scan_count ?? 0), limit: FREE_DAILY_SCAN_LIMIT, resetsAt };
}
/** One atomic reservation per explicit scan request; no check/increment race. */
export async function reserveScan(key: string, now = new Date()) {
  const { date } = quotaDay(now);
  const rows = await q<{ scan_count: number }>(`INSERT INTO scan_usage (workspace_id, scan_date, scan_count)
    VALUES ($1, $2, 1) ON CONFLICT (workspace_id, scan_date)
    DO UPDATE SET scan_count = scan_usage.scan_count + 1
    WHERE scan_usage.scan_count < $3 RETURNING scan_count`, [key, date, FREE_DAILY_SCAN_LIMIT]);
  return rows.length ? Number(rows[0].scan_count) : null;
}
