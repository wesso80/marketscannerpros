import { NextResponse } from 'next/server';
import { buildMasterInputs } from '@/lib/intelligence/mockData';
import { computeMaster } from '@/lib/intelligence/engines/master';
import { resolveFragility } from '@/lib/intelligence/fragilityService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Master Command Centre aggregate. The fusion is the parity-tested native
// engine; the individual engine readings are still mock EXCEPT Fragility, which
// is swapped for the native LIVE result when real provider data is available.
// The remaining four modules stay labelled MOCK — we never pretend the whole
// Master is live while components are mocked.
export async function GET() {
  const timestamp = new Date().toISOString();
  const { inputs, componentsByKey } = buildMasterInputs(timestamp);

  let source: 'mock' | 'partial-live' = 'mock';
  let finalInputs = inputs;
  try {
    const { engine, isLive } = await resolveFragility();
    if (isLive && engine) {
      source = 'partial-live';
      finalInputs = inputs.map((i) =>
        i.key === 'fragility'
          ? { ...i, raw: engine.masterLink, orientation: engine.masterOrientation, status: 'LIVE' as const }
          : i,
      );
    }
  } catch {
    // keep mock fragility input
  }

  const master = computeMaster(finalInputs, undefined, timestamp);
  master.engines = master.engines.map((e) => ({ ...e, components: componentsByKey.get(e.engine) }));
  return NextResponse.json({ data: master, source });
}
