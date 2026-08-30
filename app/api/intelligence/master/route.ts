import { NextResponse } from 'next/server';
import { getMasterResult } from '@/lib/intelligence/mockData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Master Command Centre aggregate. Currently mock-backed; the response shape is
// the stable contract the UI depends on, so real engine outputs can replace the
// mock builder without any frontend change.
export async function GET() {
  return NextResponse.json({ data: getMasterResult(), source: 'mock' });
}
