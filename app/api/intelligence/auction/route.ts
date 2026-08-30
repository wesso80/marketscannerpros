import { NextResponse } from 'next/server';
import { getAuctionResult } from '@/lib/intelligence/mockData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ data: getAuctionResult(), source: 'mock' });
}
