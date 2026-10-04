import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { prepareVisitor, readScanQuota } from '@/lib/free/scanQuota';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  const visitor = prepareVisitor(req, session?.workspaceId);
  try {
    return visitor.attach(NextResponse.json(await readScanQuota(visitor.key), { headers: { 'Cache-Control': 'private, no-store' } }));
  } catch {
    return NextResponse.json({ error: 'Scan allowance is unavailable. Please try again.' }, { status: 503 });
  }
}
