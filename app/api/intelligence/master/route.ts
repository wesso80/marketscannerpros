import { NextResponse } from 'next/server';
import { buildMasterInputs } from '@/lib/intelligence/mockData';
import { computeMaster } from '@/lib/intelligence/engines/master';
import { resolveFragility } from '@/lib/intelligence/fragilityService';
import { resolveLiquidityTransmission } from '@/lib/intelligence/liquidityTransmissionService';
import {
  applyNativeLiquidityToMasterInputs,
  buildUnavailableIntegration,
  type MasterLiquiditySource,
} from '@/lib/intelligence/masterLiquidityIntegration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Master Command Centre aggregate. The fusion is the parity-tested native
// engine; individual engine readings are mock EXCEPT:
//   - Fragility (native since Phase 3), and
//   - Liquidity / macro (native since Phase 4E — validated LiquidityTransmissionResolved.masterLink).
// The remaining three modules stay labelled MOCK — we never pretend the whole
// Master is live while components are mocked.
export async function GET() {
  const timestamp = new Date().toISOString();
  const { inputs, componentsByKey } = buildMasterInputs(timestamp);

  let finalInputs = inputs;
  const flags: { fragility: 'live' | 'mock'; liquidity: MasterLiquiditySource } = {
    fragility: 'mock',
    // Cleanup B: liquidity always resolves through a native integration path.
    // A mock fallback is never restored — even on hard resolver throws.
    liquidity: 'native-unavailable',
  };

  // 1) Native Fragility (Phase 3 — unchanged).
  try {
    const { engine, isLive } = await resolveFragility();
    if (isLive && engine) {
      flags.fragility = 'live';
      finalInputs = finalInputs.map((i) =>
        i.key === 'fragility'
          ? { ...i, raw: engine.masterLink, orientation: engine.masterOrientation, status: 'LIVE' as const }
          : i,
      );
    }
  } catch {
    // keep mock fragility input
  }

  // 2) Native Liquidity Transmission (Phase 4E — validated masterLink).
  // Cleanup B: hard failure never falls back to the mock macro fixture. The
  // resolver either produces an integration (native LIVE / STALE / UNAVAILABLE)
  // or throws — in which case we synthesise an UNAVAILABLE integration here.
  let liquidityComponents: ReturnType<typeof componentsByKey.get> | undefined;
  let liquidityStatus: string | undefined;
  let liquidityReason: string | undefined;
  try {
    const resolvedLiquidity = await resolveLiquidityTransmission();
    const integration = applyNativeLiquidityToMasterInputs(finalInputs, resolvedLiquidity);
    finalInputs = integration.inputs;
    liquidityComponents = integration.macroComponents;
    liquidityStatus = integration.status;
    liquidityReason = integration.reason;
    flags.liquidity = integration.source;
  } catch (e) {
    const integration = buildUnavailableIntegration(finalInputs, e, timestamp);
    finalInputs = integration.inputs;
    liquidityComponents = integration.macroComponents;
    liquidityStatus = integration.status;
    liquidityReason = integration.reason;
    flags.liquidity = integration.source;
  }

  const master = computeMaster(finalInputs, undefined, timestamp);
  master.engines = master.engines.map((e) => {
    if (e.engine === 'macro' && liquidityComponents) {
      // Native components override the mock component map for the macro row.
      return { ...e, components: liquidityComponents };
    }
    return { ...e, components: componentsByKey.get(e.engine) };
  });

  const nativeLiquidityApplied = flags.liquidity !== 'native-unavailable';
  const source = flags.fragility === 'live' || nativeLiquidityApplied
    ? 'partial-live' : 'mock';
  return NextResponse.json({
    data: master,
    source,
    provenance: {
      fragility: flags.fragility,
      liquidity: flags.liquidity,
      liquidityStatus,
      liquidityReason,
    },
  });
}

