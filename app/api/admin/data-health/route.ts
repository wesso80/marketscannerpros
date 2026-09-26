/**
 * GET /api/admin/data-health — Consolidated health probe for the admin
 * research terminal. Replaces the split between /diagnostics + /system by
 * returning provider feeds, scanner status, webhook activity, and base
 * database connectivity in one shape.
 *
 * BOUNDARY: read-only diagnostics. No mutations, no execution.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/db";
import { wrapTruth } from "@/lib/admin";
import { getProviderHealthSummary } from "@/lib/admin/providerTelemetry";
import {
  loadDiscordBridgeHealth,
  loadResearchAlertHealth,
  loadScannerHealth,
  loadStripeWebhookHealth,
  type ActivityRow,
} from "@/lib/admin/healthProbes";

export const runtime = "nodejs";

interface ProviderRow {
  id: string;
  label: string;
  /** CONFIGURED = the key is set (not a live check); PAUSED = switched off on purpose. */
  status: "OK" | "CONFIGURED" | "PAUSED" | "DEGRADED" | "DOWN" | "UNKNOWN";
  latencyMs?: number | null;
  lastSeen?: string | null;
  note?: string;
}

type WebhookRow = ActivityRow;

function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

async function probeDatabase(): Promise<{ connected: boolean; latencyMs: number | null }> {
  const start = Date.now();
  try {
    await q("SELECT 1");
    return { connected: true, latencyMs: Date.now() - start };
  } catch {
    return { connected: false, latencyMs: null };
  }
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  const [db, scanner, discord, alerts] = await Promise.all([
    probeDatabase(),
    loadScannerHealth(),
    loadDiscordBridgeHealth(),
    loadResearchAlertHealth(),
  ]);

  const hasAlphaVantage = !!process.env.ALPHA_VANTAGE_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasStripe = !!process.env.STRIPE_SECRET_KEY;
  const hasStripeWebhook = !!process.env.STRIPE_WEBHOOK_SECRET;

  const providers: ProviderRow[] = [
    {
      id: "database",
      label: "PostgreSQL",
      status: db.connected ? "OK" : "DOWN",
      latencyMs: db.latencyMs,
      note: db.connected ? "Primary store" : "No connection — diagnostics degraded",
    },
    {
      id: "alpha-vantage",
      label: "Alpha Vantage",
      status: hasAlphaVantage ? "CONFIGURED" : "DEGRADED",
      note: hasAlphaVantage ? "Key set (configuration only, not a live check)" : "ALPHA_VANTAGE_API_KEY missing",
    },
    {
      id: "openai",
      label: "OpenAI",
      status: hasOpenAI ? "CONFIGURED" : "DEGRADED",
      note: hasOpenAI ? "Key set (configuration only, not a live check)" : "OPENAI_API_KEY missing",
    },
    {
      id: "stripe",
      label: "Stripe",
      status: hasStripe ? "CONFIGURED" : "DEGRADED",
      note: hasStripe ? "Key set (configuration only, not a live check)" : "STRIPE_SECRET_KEY missing",
    },
    {
      id: "scanner",
      label: "Scanner Pipeline",
      // From the shared saved scan's run log (admin_scan_runs), not the retired operator_state table.
      status: !scanner ? "UNKNOWN" : scanner.status === "OK" ? "OK" : scanner.status === "PAUSED" ? "PAUSED" : "DEGRADED",
      lastSeen: relativeTime(scanner?.lastRunAt),
      note: scanner ? scanner.note : "Could not read admin_scan_runs",
    },
  ];

  // Webhook / outbound activity from tables that exist. Stripe events are not logged anywhere, so Stripe
  // delivery is NOT MONITORED rather than a fake STALE.
  const webhooks: WebhookRow[] = [
    await loadStripeWebhookHealth(hasStripeWebhook),
    alerts,
    discord,
  ].map((row) => ({ ...row, lastReceivedAt: relativeTime(row.lastReceivedAt) }));

  // Phase 10: Provider telemetry — success/failure/latency tracking
  const providerTelemetry = getProviderHealthSummary();

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    database: db,
    providers,
    scanner,
    webhooks,
    providerTelemetry: providerTelemetry.map((summary) => ({
      provider: summary.provider,
      overallHealth: summary.overallHealth,
      successRate: summary.successRate.toFixed(1) + "%",
      rateLimitRate: summary.rateLimitRate.toFixed(1) + "%",
      avgLatencyMs: summary.avgLatencyMs.toFixed(0),
      familyMetrics: summary.familyMetrics.map((m) => ({
        family: m.endpointFamily,
        requests: m.requestCount,
        success: m.successCount,
        failures: m.failureCount,
        cacheHits: m.cacheHitCount,
        rateLimitHits: m.rateLimitHitCount,
        successRate: m.successRate.toFixed(1) + "%",
        avgLatency: m.latencyMs.mean.toFixed(0) + "ms",
        p95Latency: m.latencyMs.p95.toFixed(0) + "ms",
        lastSuccess: m.lastSuccessAt,
        lastFailure: m.lastFailureAt,
      })),
    })),
    truth: wrapTruth({}, { source: 'admin:data-health', freshness: 'real-time' }),
  });
}
