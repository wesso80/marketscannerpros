import { NextResponse } from 'next/server';
import { getEngineStatus } from '@/lib/intelligence/mockData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Engine status strip for the Intelligence landing page. Mock-backed for now.
export async function GET() {
  return NextResponse.json({ data: getEngineStatus(), source: 'mock' });
}
