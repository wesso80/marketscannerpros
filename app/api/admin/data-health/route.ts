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
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { q } from "@/lib/db";

export const runtime = "nodejs";

interface ProviderRow {
  id: string;
  label: string;
  status: "OK" | "DEGRADED" | "DOWN" | "UNKNOWN";
  latencyMs?: number | null;
  lastSeen?: string | null;
  note?: string;
}

interface WebhookRow {
  id: string;
  label: string;
  lastReceivedAt?: string | null;
  lastStatus?: "OK" | "FAILED" | "STALE" | "UNKNOWN";
  count24h?: number;
  failures24h?: number;
  note?: string;
}

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

async function probeLastSignalAt(): Promise<string | null> {
  try {
    const rows = await q(
      "SELECT MAX(created_at) AS last FROM operator_state",
    );
    return rows?.[0]?.last ?? null;
  } catch {
    return null;
  }
}

async function probeWebhookCounts(table: string): Promise<{ count: number; failures: number; last: string | null }> {
  try {
    const rows = await q(
      `SELECT COUNT(*)::int AS c,
              COUNT(*) FILTER (WHERE status = 'failed')::int AS f,
              MAX(created_at) AS last
       FROM ${table}
       WHERE created_at > NOW() - INTERVAL '24 hours'`,
    );
    const row = rows?.[0] ?? {};
    return {
      count: Number(row.c) || 0,
      failures: Number(row.f) || 0,
      last: row.last ?? null,
    };
  } catch {
    return { count: 0, failures: 0, last: null };
  }
}

export async function GET(req: NextRequest) {
  const adminAuth = (await requireAdmin(req)).ok;
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }
  }

  const db = await probeDatabase();
  const lastSignal = await probeLastSignalAt();

  const hasAlphaVantage = !!process.env.ALPHA_VANTAGE_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasStripe = !!process.env.STRIPE_SECRET_KEY;
  const hasStripeWebhook = !!process.env.STRIPE_WEBHOOK_SECRET;
  const hasDiscord = !!process.env.DISCORD_BRIDGE_WEBHOOK_URL || !!process.env.DISCORD_WEBHOOK_URL;

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
      status: hasAlphaVantage ? "OK" : "DEGRADED",
      note: hasAlphaVantage ? "Market data feed configured" : "ALPHA_VANTAGE_API_KEY missing",
    },
    {
      id: "openai",
      label: "OpenAI",
      status: hasOpenAI ? "OK" : "DEGRADED",
      note: hasOpenAI ? "MSP Analyst online" : "OPENAI_API_KEY missing",
    },
    {
      id: "stripe",
      label: "Stripe",
      status: hasStripe ? "OK" : "DEGRADED",
      note: hasStripe ? "Subscriptions configured" : "STRIPE_SECRET_KEY missing",
    },
    {
      id: "scanner",
      label: "Scanner Pipeline",
      status: lastSignal ? "OK" : "DEGRADED",
      lastSeen: relativeTime(lastSignal),
      note: lastSignal ? "Operator state recently written" : "No operator_state activity yet",
    },
  ];

  // Webhook activity — table presence is optional; absent tables degrade
  // to UNKNOWN rather than failing the response.
  const stripeEvents = await probeWebhookCounts("stripe_webhook_events");
  const alertDispatches = await probeWebhookCounts("alert_dispatch_log");

  const webhooks: WebhookRow[] = [
    {
      id: "stripe",
      label: "Stripe Webhooks",
      count24h: stripeEvents.count,
      failures24h: stripeEvents.failures,
      lastReceivedAt: relativeTime(stripeEvents.last),
      lastStatus: !hasStripeWebhook
        ? "UNKNOWN"
        : stripeEvents.failures > 0
        ? "FAILED"
        : stripeEvents.count > 0
        ? "OK"
        : "STALE",
      note: hasStripeWebhook ? "Signed receiver active" : "STRIPE_WEBHOOK_SECRET missing",
    },
    {
      id: "alerts",
      label: "Alert Dispatcher",
      count24h: alertDispatches.count,
      failures24h: alertDispatches.failures,
      lastReceivedAt: relativeTime(alertDispatches.last),
      lastStatus:
        alertDispatches.failures > 0
          ? "FAILED"
          : alertDispatches.count > 0
          ? "OK"
          : "STALE",
      note: "Outbound research alerts",
    },
    {
      id: "discord",
      label: "Discord Bridge",
      lastStatus: hasDiscord ? "OK" : "UNKNOWN",
      note: hasDiscord ? "Outbound webhook configured" : "DISCORD_WEBHOOK_URL missing",
    },
  ];

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    database: db,
    providers,
    webhooks,
  });
}
