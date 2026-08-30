import { NextResponse } from 'next/server';
import { getFragilityResult } from '@/lib/intelligence/mockData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ data: getFragilityResult(), source: 'mock' });
}
