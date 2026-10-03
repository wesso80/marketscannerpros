import {reportCryptoCycleHealth} from '@/lib/admin/cryptoOpsAlerts';
import {runCryptoAutomation} from '@/lib/admin/cryptoAutomation';
import {adminDiscoveryOnly,discoveryOnlyAction} from '@/lib/admin/discoveryOnly';
import {runNewsJevDailyOnce} from '@/lib/admin/equityNewsJev';
import {runCryptoPaperAll} from '@/lib/admin/cryptoPaper';
import {runCryptoBaseSleeveAll} from '@/lib/admin/cryptoPaperBase';
import {runCryptoMarketData} from '@/lib/admin/cryptoMarketDataJob';
import {runNewListings} from '@/lib/admin/cryptoNewListingsJob';
import {historyStep} from '@/lib/admin/cgHistoryJob';
import {CG_HISTORY} from '@/lib/admin/cgHistory';
import {runDailyCalibration} from '@/lib/admin/cryptoCalibration';
import {getRedis} from '@/lib/redis';
import {saveBreakoutVerdicts} from '@/lib/admin/cryptoBreakoutVerdict';
/**
 * POST /api/cron/arca-cycle
 *
 * Runs one ARCA simulation cycle for every workspace that has an
 * ACTIVE arca_portfolios row. Designed to be hit on a 15-minute Render
 * cron (24/7 because the portfolio holds crypto).
 *
 * Auth: x-cron-secret header (CRON_SECRET env), or admin session.
 *
 * SIMULATED ONLY. No broker integration. No order routing.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { requireAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/db";
import { simulateArcaCycle } from "@/lib/admin/portfolio-lab/simulateCycle";
import { notifyAdmin } from "@/lib/admin/notifyAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

async function authorise(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET || "";
  const adminSecret = process.env.ADMIN_SECRET || "";
  const headerCron = req.headers.get("x-cron-secret") || "";
  const headerAuth = req.headers.get("authorization")?.replace("Bearer ", "") || "";
  const cronOk = !!cronSecret && timingSafeCompare(headerCron, cronSecret);
  const adminOk = !!adminSecret && timingSafeCompare(headerAuth, adminSecret);
  if (cronOk || adminOk) return true;
  const session = await requireAdmin(req);
  return session.ok;
}

export async function POST(req: NextRequest) {
  if (!(await authorise(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if(adminDiscoveryOnly()){
    // Exit-only work runs before any potentially slow/failed discovery request.
    const monitoring=await runCryptoPaperAll(true).catch(()=>({ok:false,error:'Crypto exit monitoring failed'}));
    const baseMonitoring=await runCryptoBaseSleeveAll(true).catch(()=>({ok:false,error:'Base-breakout exit monitoring failed'}));
    const scanning=await runCryptoAutomation().catch(()=>({ok:false,error:'Crypto background scan failed'}));
    const scanFailed='ok' in scanning&&!scanning.ok;
    // Full cycle rechecks protection and then uses the newly saved scan immediately.
    const cryptoPaper=scanFailed?{ok:false,skipped:true,reason:'Entry phase skipped because scanning failed'}:await runCryptoPaperAll().catch(()=>({ok:false,error:'Crypto paper entry cycle failed'}));
    // The base-breakout sleeve reads the same saved scans; its health is reported but, as a separate ledger, never blocks the momentum sleeves.
    const basePaper=scanFailed?{ok:false,skipped:true,reason:'Entry phase skipped because scanning failed'}:await runCryptoBaseSleeveAll().catch(()=>({ok:false,error:'Base-breakout paper entry cycle failed'}));
    // Advisory only. Saved scans in, a Redis stamp out. Failure here does not change entries, exits, or ok.
    const breakoutVerdicts=await saveBreakoutVerdicts().catch(()=>({ok:false as const,error:'Breakout verdicts failed',saved:0}));
    const ok=monitoring.ok&&cryptoPaper.ok&&!scanFailed;
    const operationalAlerts=await reportCryptoCycleHealth({monitoring,scanning,paper:cryptoPaper}).catch(()=>({ok:false,error:'Operational alert failed'}));
    // Daily calibration reads saved rows only; it never affects this run's health status.
    const calibrationRedis=getRedis();
    const calibration=calibrationRedis?await runDailyCalibration(calibrationRedis).catch(()=>({ok:false,error:'Calibration failed'})):{ok:false,error:'Redis unavailable'};
    // The two Jev equity pages are open while the evening cron is skipped, so their daily scoring step runs here, once per UTC day. Evidence only.
    const newsJev=calibrationRedis&&discoveryOnlyAction('/api/cron/evening-packet')==='skip_job'?await runNewsJevDailyOnce(calibrationRedis).catch(()=>({ok:false,error:'News verification failed'})):{ok:true,skipped:true,reason:'Evening cron handles it'};
    // Non-essential CoinGecko market context runs last and never affects this run's health status.
    const marketData=await runCryptoMarketData().catch(()=>({ok:false,error:'CoinGecko market data failed'}));
    const newListings=await runNewListings().catch(()=>({ok:false,error:'CoinGecko new listings failed'}));
    // Approved history backfill / daily top-up: a small throttled batch per run (does nothing until approved).
    const history=await historyStep(CG_HISTORY.callsPerCronRun).catch(()=>({ok:false,error:'History batch failed'}));
    return NextResponse.json({...cryptoPaper,ok,monitoring,scanning,operationalAlerts,calibration,newsJev,marketData,newListings,history,breakoutVerdicts,baseSleeve:{monitoring:baseMonitoring,paper:basePaper}},{status:ok?200:503});
  }
  const cryptoPaper=await runCryptoPaperAll().catch(()=>({ok:false,error:'Crypto paper cycle failed'}));
  const calibrationRedis=getRedis();
  if(calibrationRedis)await runDailyCalibration(calibrationRedis).catch(()=>undefined);
  await runCryptoMarketData().catch(()=>undefined);
  await runNewListings().catch(()=>undefined);
  await historyStep(CG_HISTORY.callsPerCronRun).catch(()=>undefined);
  const started = Date.now();
  try {
    let rows: Array<{ workspace_id: string }> = [];
    try {
      rows = await q<{ workspace_id: string }>(
        `SELECT DISTINCT workspace_id FROM arca_portfolios WHERE status='ACTIVE' AND mode='SIMULATED'`,
      );
    } catch (selectErr) {
      const msg = selectErr instanceof Error ? selectErr.message : String(selectErr);
      // Common case: migration 095 not deployed → table missing.
      // Report lookup failures as failures so Render cannot mark a skipped run healthy.
      const isMissingTable = (selectErr as { code?: string })?.code === '42P01';
      notifyAdmin({
        subject: isMissingTable
          ? "arca-cycle skipped — arca_portfolios table missing"
          : "arca-cycle: portfolio lookup failed",
        body: `arca-cycle SELECT failed: ${msg}${isMissingTable ? "\n\nLikely cause: migrations/095_arca_portfolio_lab.sql not applied on this environment." : ""}`,
        severity: isMissingTable ? "warn" : "error",
        context: { durationMs: Date.now() - started },
      }).catch(() => {});
      return NextResponse.json({
        ok: false,
        skipped: true,
        reason: isMissingTable ? "arca_portfolios_table_missing" : "portfolio_lookup_failed",
        message: msg,
        durationMs: Date.now() - started,
      }, { status: 503 });
    }

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        workspacesProcessed: 0,
        results: [],
        durationMs: Date.now() - started,
      });
    }

    const results: Array<{ workspaceId: string; ok: boolean; result?: unknown; error?: string }> = [];
    for (const r of rows) {
      try {
        const result = await simulateArcaCycle({ workspaceId: r.workspace_id });
        results.push({ workspaceId: r.workspace_id, ok: true, result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ workspaceId: r.workspace_id, ok: false, error: msg });
        notifyAdmin({
          subject: "arca-cycle workspace failed",
          body: `ARCA cycle failed for workspace ${r.workspace_id}: ${msg}`,
          severity: "error",
          context: { workspaceId: r.workspace_id, durationMs: Date.now() - started },
        }).catch(() => {});
      }
    }
    const ok = results.every((result) => result.ok);
    return NextResponse.json({
      ok,
      workspacesProcessed: rows.length,
      results,
      durationMs: Date.now() - started,
    }, { status: ok ? 200 : 503 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    notifyAdmin({
      subject: "arca-cycle cron failed",
      body: `arca-cycle cron crashed: ${msg}`,
      severity: "error",
      context: { durationMs: Date.now() - started },
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
