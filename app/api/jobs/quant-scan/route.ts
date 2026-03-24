/**
 * Quant Auto-Scan Cron Job
 *
 * @route GET|POST /api/jobs/quant-scan
 * @description Runs the full quant pipeline on schedule and emails
 *              ACTIONABLE/PRIORITY alerts to the operator.
 *
 * Designed to run every 30 minutes during market hours via Render cron.
 * Protected by CRON_SECRET (same as all other jobs).
 *
 * Pipeline:
 *  1. Run full 6-layer quant pipeline (regime → discovery → fusion → permission → escalation)
 *  2. Persist scan result to quant_scan_history
 *  3. If ACTIONABLE or PRIORITY alerts exist → email operator
 *  4. Return full audit log
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth, verifyAdminAuth } from '@/lib/adminAuth';
import { runPipeline, persistScanResult } from '@/lib/quant/orchestrator';
import { sendQuantAlertEmail } from '@/lib/quant/alertMailer';
import { DEFAULT_QUANT_CONFIG } from '@/lib/quant/types';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 min budget

export async function GET(req: NextRequest) { return runQuantScan(req); }
export async function POST(req: NextRequest) { return runQuantScan(req); }

async function runQuantScan(req: NextRequest) {
  if (!verifyCronAuth(req) && !verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log: string[] = [];
  const push = (msg: string) => { log.push(msg); console.log(`[quant-scan] ${msg}`); };

  try {
    push('Starting quant pipeline...');

    // Determine asset types from query param (default: both)
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') || 'full';
    const assetTypes: ('equity' | 'crypto')[] =
      mode === 'equity' ? ['equity'] :
      mode === 'crypto' ? ['crypto'] :
      ['equity', 'crypto'];

    const config = { ...DEFAULT_QUANT_CONFIG, enabledAssetTypes: assetTypes };

    // ── 1. Run pipeline ──────────────────────────────────────────────
    const result = await runPipeline(config);
    push(`Pipeline complete: ${result.meta.symbolsScanned} scanned, ${result.meta.symbolsPassed} passed, ${result.meta.alertsGenerated} alerts in ${result.meta.scanDurationMs}ms`);
    push(`Regime: ${result.regime.phase} (${result.regime.confidence}% confidence, ${result.regime.agreement}/4 agreement)`);

    // ── 2. Persist to DB ─────────────────────────────────────────────
    const persisted = await persistScanResult(result);
    push(persisted ? 'Scan persisted to quant_scan_history' : 'WARNING: Failed to persist scan');

    // ── 3. Email if qualifying alerts ────────────────────────────────
    if (result.alerts.length > 0) {
      push(`Alerts: ${result.alerts.map(a => `${a.symbol}(${a.tier}:${a.fusionScore.toFixed(1)})`).join(', ')}`);

      const emailsSent = await sendQuantAlertEmail(result);
      push(emailsSent > 0 ? `Email sent to operator (${emailsSent})` : 'No ACTIONABLE/PRIORITY alerts — email skipped');
    } else {
      push('No alerts generated — all signals below threshold or in cooldown');
    }

    return NextResponse.json({
      success: true,
      regime: result.regime.phase,
      confidence: result.regime.confidence,
      scanned: result.meta.symbolsScanned,
      passed: result.meta.symbolsPassed,
      alerts: result.meta.alertsGenerated,
      durationMs: result.meta.scanDurationMs,
      log,
    });

  } catch (err: any) {
    const msg = err?.message || String(err);
    push(`ERROR: ${msg}`);
    console.error('[quant-scan] Fatal error:', err);
    return NextResponse.json({ success: false, error: msg, log }, { status: 500 });
  }
}
