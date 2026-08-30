import { NextResponse } from 'next/server';
import { getLeadLagResult } from '@/lib/intelligence/mockData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ data: getLeadLagResult(), source: 'mock' });
}
