import { NextResponse } from 'next/server';
import { readDataFreshness } from '@/lib/health/dataFreshness';

export const runtime = 'nodejs';

const TTL_MS = 60_000;

type Entry = { at: number; stale: boolean };

let entry: Entry | null = null;
let pending: Promise<boolean> | null = null;

/** Test hook. Production callers use the 60s entry above. */
export function clearPublicStaleCache(): void {
  entry = null;
  pending = null;
}

function json(stale: boolean) {
  return NextResponse.json(
    { stale },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}

async function loadStale(): Promise<boolean> {
  try {
    return (await readDataFreshness()).stale;
  } catch {
    console.error('[health/stale] freshness check failed');
    return false;
  }
}

/**
 * GET /api/health/stale
 * Public flag for StaleDataBanner. Body is only `{ stale: boolean }`.
 * One process-wide read of the freshness keys per 60s, including failures,
 * so polling this route cannot fan out into Redis.
 */
export async function GET() {
  const now = Date.now();
  if (entry && now - entry.at < TTL_MS) return json(entry.stale);

  if (!pending) {
    pending = loadStale()
      .then((stale) => {
        entry = { at: Date.now(), stale };
        return stale;
      })
      .finally(() => {
        pending = null;
      });
  }

  return json(await pending);
}
