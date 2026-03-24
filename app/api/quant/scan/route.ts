/**
 * POST /api/quant/scan — Trigger full quant pipeline
 *
 * PRIVATE — requires admin authentication.
 * Runs the 6-layer pipeline and returns the full PipelineResult.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { runPipeline, persistScanResult } from '@/lib/quant/orchestrator';
import { sendQuantAlertEmail } from '@/lib/quant/alertMailer';
import { DEFAULT_QUANT_CONFIG } from '@/lib/quant/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

const OPERATOR_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

function isOperator(cid: string): boolean {
  const lower = cid.toLowerCase();
  return OPERATOR_EMAILS.some(email =>
    lower === email || lower.endsWith(`_${email}`),
  );
}

export async function POST(req: NextRequest) {
  // Auth gate: operators only
  const session = await getSessionFromCookie();
  if (!session || !isOperator(session.cid)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      assetTypes?: ('equity' | 'crypto')[];
      maxSymbols?: number;
    };

    const config = {
      ...DEFAULT_QUANT_CONFIG,
      operatorEmails: OPERATOR_EMAILS,
      enabledAssetTypes: body.assetTypes ?? DEFAULT_QUANT_CONFIG.enabledAssetTypes,
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
