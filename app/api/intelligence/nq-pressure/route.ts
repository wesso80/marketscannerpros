import { NextResponse } from 'next/server';
import { getPressureResult } from '@/lib/intelligence/mockData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ data: getPressureResult(), source: 'mock' });
}
