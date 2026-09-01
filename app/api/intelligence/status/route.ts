import { NextResponse } from 'next/server';
import { getEngineStatus } from '@/lib/intelligence/mockData';
import { resolveFragility } from '@/lib/intelligence/fragilityService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Engine status strip for the Intelligence landing page. Engine rows are mock
// EXCEPT Fragility, which reflects the shared native result when live — the same
// source of truth used by the Fragility page and the Master fusion.
export async function GET() {
  const rows = getEngineStatus();
  let source: 'mock' | 'partial-live' = 'mock';
  try {
    const { engine, isLive } = await resolveFragility();
    if (isLive && engine) {
      source = 'partial-live';
      for (const row of rows) {
        if (row.engine === 'fragility') {
          row.score = Math.round(engine.masterOrientation);
          row.state = engine.regime;
          row.timestamp = engine.calculatedAt;
        }
      }
    }
  } catch {
    // keep mock status
  }
  return NextResponse.json({ data: rows, source });
}
