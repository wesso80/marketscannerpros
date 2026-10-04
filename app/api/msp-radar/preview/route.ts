import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { pgReportStore } from '@/lib/jarvis/report/persistDailyReport';
import { radarPreview } from '@/lib/free/radarPreview';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return NextResponse.json({ preview: await radarPreview(pgReportStore(q)) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Report summary unavailable' }, { status: 503 }); }
}
