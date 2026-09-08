import { NextResponse } from 'next/server';
import { buildMasterInputs } from '@/lib/intelligence/mockData';
import { computeMaster } from '@/lib/intelligence/engines/master';
import { resolveFragility } from '@/lib/intelligence/fragilityService';
import { resolveLiquidityTransmission } from '@/lib/intelligence/liquidityTransmissionService';
import {
  applyNativeLiquidityToMasterInputs,
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
  const flags: { fragility: 'live' | 'mock'; liquidity: MasterLiquiditySource | 'mock' } = {
    fragility: 'mock',
    liquidity: 'mock',
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
  let liquidityComponents: ReturnType<typeof componentsByKey.get> | undefined;
  let liquidityStatus: string | undefined;
  try {
    const resolvedLiquidity = await resolveLiquidityTransmission();
    const integration = applyNativeLiquidityToMasterInputs(finalInputs, resolvedLiquidity);
    finalInputs = integration.inputs;
    liquidityComponents = integration.macroComponents;
    liquidityStatus = integration.status;
    flags.liquidity = integration.source;
  } catch (e) {
    // Preserve the mock macro input on hard failure — the aggregate stays
    // deterministic and the source label stays 'mock' for macro.
    flags.liquidity = 'mock';
    liquidityStatus = e instanceof Error ? e.message : 'liquidity-error';
  }

  const master = computeMaster(finalInputs, undefined, timestamp);
  master.engines = master.engines.map((e) => {
    if (e.engine === 'macro' && liquidityComponents) {
      // Native components override the mock component map for the macro row.
      return { ...e, components: liquidityComponents };
    }
    return { ...e, components: componentsByKey.get(e.engine) };
  });

  const source = flags.fragility === 'live' || flags.liquidity !== 'mock'
    ? 'partial-live' : 'mock';
  return NextResponse.json({
    data: master,
    source,
    provenance: { fragility: flags.fragility, liquidity: flags.liquidity, liquidityStatus },
  });
}

