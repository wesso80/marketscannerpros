/**
 * POST /api/quant/scan — Trigger full quant pipeline
 *
 * PRIVATE — requires admin authentication.
 * Runs the 6-layer pipeline and returns the full PipelineResult.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator } from '@/lib/quant/operatorAuth';
import { requireAdmin } from '@/lib/adminAuth';
import { runPipeline, persistScanResult } from '@/lib/quant/orchestrator';
import { sendQuantAlertEmail } from '@/lib/quant/alertMailer';
import { DEFAULT_QUANT_CONFIG } from '@/lib/quant/types';
import type { ScanTimeframe } from '@/lib/quant/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // Auth gate: operators only (ms_auth cookie OR admin secret)
  const adminAuth = (await requireAdmin(req)).ok;
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      assetTypes?: ('equity' | 'crypto')[];
      maxSymbols?: number;
      timeframe?: ScanTimeframe;
    };

    const timeframe = body.timeframe ?? 'daily';
    const validTimeframes: ScanTimeframe[] = ['daily', '1h', '15min'];
    if (!validTimeframes.includes(timeframe)) {
      return NextResponse.json({ error: 'Invalid timeframe' }, { status: 400 });
    }

    const config = {
      ...DEFAULT_QUANT_CONFIG,
      enabledAssetTypes: body.assetTypes ?? DEFAULT_QUANT_CONFIG.enabledAssetTypes,
      timeframe,
    };

    const result = await runPipeline(config, {
      assetTypes: config.enabledAssetTypes,
      maxSymbols: body.maxSymbols,
    });

    // Persist scan + email alerts in background (non-blocking)
    persistScanResult(result).catch(() => {});
    sendQuantAlertEmail(result).catch(() => {});

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[quant:scan] Pipeline error:', err);
    return NextResponse.json(
      { error: 'Pipeline execution failed', detail: err.message },
      { status: 500 },
    );
  }
}
