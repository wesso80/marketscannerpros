import { NextResponse } from 'next/server';
import {
  resolveLiquidityTransmission,
  type LiquidityTransmissionResolved,
} from '@/lib/intelligence/liquidityTransmissionService';
import {
  mapLiquidityTransmissionToPageDto,
  type LiquidityTransmissionPageDto,
} from '@/lib/intelligence/liquidityTransmissionPageMapper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Phase 4D — native Liquidity Transmission surface for /intelligence/liquidity.
// Engine formulas are frozen (Phase 4A/4C). Route delegates to the service
// (which owns its own 6h in-process cache) and shapes the result through the
// pure page mapper. Failure states are never silently substituted with stale
// numbers; the DTO carries an explicit `available` flag and `reason`.

export type { LiquidityTransmissionPageDto } from '@/lib/intelligence/liquidityTransmissionPageMapper';

interface RouteResponse {
  data: LiquidityTransmissionPageDto;
  source: 'live' | 'live-partial' | 'unavailable' | 'engine-error';
  error?: string;
}

export async function GET() {
  try {
    const resolved: LiquidityTransmissionResolved = await resolveLiquidityTransmission();
    const dto = mapLiquidityTransmissionToPageDto(resolved);
    const source: RouteResponse['source'] =
      dto.status === 'OK' ? 'live'
      : dto.status === 'PARTIAL' ? 'live-partial'
      : dto.status === 'ENGINE_ERROR' ? 'engine-error'
      : 'unavailable';
    return NextResponse.json({ data: dto, source } satisfies RouteResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const nowIso = new Date().toISOString();
    const fallback: LiquidityTransmissionPageDto = mapLiquidityTransmissionToPageDto({
      status: 'DATA_UNAVAILABLE',
      environmentLabel: 'UNAVAILABLE',
      calculatedAt: nowIso,
      result: null,
      packs: [],
      m2Meta: {
        status: 'UNAVAILABLE', interpretationEligible: false, parityStatus: 'DATA_PARITY_PENDING',
        validBlocCount: 0, missingBlocs: [], stale: false, providersUsed: [],
        calculatedAt: nowIso,
      },
      previousMasterLink: null,
      masterLinkDelta: null,
      providersUsed: [],
      missingKeys: [],
      errors: [],
      reason: message,
    });
    return NextResponse.json({ data: fallback, source: 'unavailable', error: message } satisfies RouteResponse);
  }
}
