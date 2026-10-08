import { NextRequest, NextResponse } from 'next/server';
import { buildPublicScannerObservations } from './publicObservations';

const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, Authorization, X-Admin-Secret, X-Cron-Secret' };
type PublicPacket = ReturnType<typeof buildPublicScannerObservations>;
type Dependencies = {
  isInternal: (request: NextRequest) => Promise<boolean>;
  run: (request: NextRequest, capture?: (rows: readonly unknown[]) => void) => Promise<Response>;
};

/** Per-request projection; no user or engine response is stored in shared state. */
export function publicScannerHandler({ isInternal, run }: Dependencies) {
  return async (request: NextRequest): Promise<Response> => {
    try {
      if (await isInternal(request)) return await run(request);
      // Validate public controls before any quota reservation or provider work.
      let body;
      try { body = await request.clone().json(); } catch { return NextResponse.json({ error: 'Invalid scan request.' }, { status: 400, headers }); }
      let packet: PublicPacket | undefined;
      const filters = body?.filters ?? {};
      const offset = body?.offset ?? 0;
      const limit = body?.limit ?? 100;
      try { buildPublicScannerObservations([], filters, offset, limit); }
      catch { return NextResponse.json({ error: 'Invalid factual filters or page.' }, { status: 400, headers }); }
      const response = await run(request, rows => { packet = buildPublicScannerObservations(rows, filters, offset, limit); });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        return NextResponse.json({
          error: response.status === 429 ? 'Scan allowance reached. Please try again after it resets.' : response.status === 401 || response.status === 403 ? 'This scan requires access to your account.' : response.status === 400 ? 'The requested scan is not supported.' : 'Scan data is unavailable. Please try again.',
          ...(data.limitReached === true ? { limitReached: true } : {}),
        }, { status: response.ok ? 503 : response.status, headers });
      }
      const localDemo = data.metadata?.localDemo === true;
      // Only the explicit local-demo path may bypass the pre-ranking snapshot.
      if (!packet && localDemo) packet = buildPublicScannerObservations(Array.isArray(data.results) ? data.results : [], filters, offset, limit);
      if (!packet) return NextResponse.json({ error: 'Scan observations are unavailable.' }, { status: 503, headers });
      const coverage = data.metadata?.scanCoverage;
      const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
      return NextResponse.json({
        success: true,
        ...packet,
        localDemo,
        notice: localDemo ? 'Development sample data. Not live market observations.' : null,
        coverage: { universe: count(coverage?.universe), attempted: count(coverage?.attempted), unavailable: count(coverage?.unavailable), outsideSample: count(coverage?.outsideSample) },
      }, { headers });
    } catch {
      return NextResponse.json({ error: 'Scan data is unavailable. Please try again.' }, { status: 503, headers });
    }
  };
}
