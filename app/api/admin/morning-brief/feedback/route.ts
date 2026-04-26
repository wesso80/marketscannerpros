import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/db";

export const runtime = "nodejs";

const ACTIONS = ["taken", "ignored", "missed", "worked", "failed", "invalidated", "rule_broken"] as const;
type BriefAction = typeof ACTIONS[number];

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    await ensureFeedbackTable();
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol")?.trim().toUpperCase();
    const params: unknown[] = [];
    let where = "created_at > NOW() - INTERVAL '30 days'";
    if (symbol) {
      params.push(symbol);
      where += ` AND symbol = $${params.length}`;
    }

    const rows = await q(
      `SELECT id, brief_id, symbol, action, market, timeframe, permission, bias, playbook, confidence, note, snapshot, created_at
       FROM admin_morning_brief_feedback
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT 100`,
      params,
    );

    return NextResponse.json({ ok: true, feedback: rows });
  } catch (err: unknown) {
    console.error("[admin:morning-brief:feedback:get] Error:", err);
    return NextResponse.json({ error: "Feedback fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    await ensureFeedbackTable();
    const body = await req.json();
    const symbol = String(body?.symbol || "").trim().toUpperCase();
    const action = String(body?.action || "").trim().toLowerCase() as BriefAction;
    const snapshot = typeof body?.snapshot === "object" && body.snapshot !== null ? body.snapshot : {};

    if (!symbol) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: `action must be one of: ${ACTIONS.join(", ")}` }, { status: 400 });
    }

    const rows = await q(
      `INSERT INTO admin_morning_brief_feedback (
        brief_id, symbol, action, market, timeframe, permission, bias, playbook, confidence, note, snapshot
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
       RETURNING id, brief_id, symbol, action, created_at`,
      [
        String(body?.briefId || new Date().toISOString().slice(0, 10)),
        symbol,
        action,
        body?.market ? String(body.market) : null,
        body?.timeframe ? String(body.timeframe) : null,
        body?.permission ? String(body.permission) : null,
        body?.bias ? String(body.bias) : null,
        body?.playbook ? String(body.playbook) : null,
        Number.isFinite(Number(body?.confidence)) ? Number(body.confidence) : null,
        typeof body?.note === "string" ? body.note.slice(0, 1000) : null,
        JSON.stringify(snapshot),
      ],
    );

    return NextResponse.json({ ok: true, feedback: rows[0] });
  } catch (err: unknown) {
    console.error("[admin:morning-brief:feedback:post] Error:", err);
    return NextResponse.json(
      { error: "Feedback save failed", detail: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}

async function ensureFeedbackTable() {
  await q(`
    CREATE TABLE IF NOT EXISTS admin_morning_brief_feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brief_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('taken', 'ignored', 'missed', 'worked', 'failed', 'invalidated', 'rule_broken')),
      market TEXT,
      timeframe TEXT,
      permission TEXT,
      bias TEXT,
      playbook TEXT,
      confidence NUMERIC(6,2),
      note TEXT,
      snapshot JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await q(`
    ALTER TABLE admin_morning_brief_feedback
    DROP CONSTRAINT IF EXISTS admin_morning_brief_feedback_action_check
  `).catch(() => undefined);
  await q(`
    ALTER TABLE admin_morning_brief_feedback
    ADD CONSTRAINT admin_morning_brief_feedback_action_check
    CHECK (action IN ('taken', 'ignored', 'missed', 'worked', 'failed', 'invalidated', 'rule_broken'))
  `).catch(() => undefined);
  await q(`CREATE INDEX IF NOT EXISTS idx_admin_mbf_symbol_created ON admin_morning_brief_feedback (symbol, created_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_admin_mbf_action_created ON admin_morning_brief_feedback (action, created_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_admin_mbf_brief ON admin_morning_brief_feedback (brief_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_admin_mbf_playbook_created ON admin_morning_brief_feedback (playbook, created_at DESC)`);
}