import { NextResponse } from 'next/server';
import { resolveFragility } from '@/lib/intelligence/fragilityService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { ui, isLive } = await resolveFragility();
  return NextResponse.json({ data: ui, source: isLive ? 'live' : 'mock' });
}
