import { NextResponse } from 'next/server';
import { getLiquidityResult } from '@/lib/intelligence/mockData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Validated Liquidity Transmission + Rotation Clock. Mock-backed for now.
export async function GET() {
  return NextResponse.json({ data: getLiquidityResult(), source: 'mock' });
}
