import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { timingSafeEqual } from "crypto";

/* ------------------------------------------------------------------ */
/*  Admin auth guard (same pattern as all /api/admin/* routes)         */
/* ------------------------------------------------------------------ */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function auth(req: NextRequest): boolean {
  const header = req.headers.get("authorization");
  const secret = header?.replace("Bearer ", "");
  const adminSecret = process.env.ADMIN_SECRET || "";
  return !!(secret && adminSecret && timingSafeCompare(secret, adminSecret));
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Compute the due date for a given report_month (15th of month+1). */
function dueDate(reportMonth: string): string {
  const d = new Date(reportMonth);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(15);
  return d.toISOString().slice(0, 10);
}

/** Revision deadline = due_date + 2 calendar months. */
function revisionDeadline(due: string): string {
  const d = new Date(due);
  d.setUTCMonth(d.getUTCMonth() + 2);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/*  GET  — list reports + live subscriber snapshot                     */
/* ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {
  if (!auth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Existing saved reports
    let reports: any[] = [];
    try {
      reports = await q(
        `SELECT * FROM nasdaq_usage_reports ORDER BY report_month DESC, created_at DESC LIMIT 60`
      );
    } catch {
      // Table may not exist yet — that's OK, we'll just show the live snapshot
    }

    // 2. Live subscriber snapshot from user_subscriptions
    let snapshot: any = {
      total: 0,
      byTier: [],
      byStatus: [],
      activeTrials: 0,
    };
    try {
      const tierRows = await q(
        `SELECT tier, COUNT(*)::int AS count FROM user_subscriptions
         WHERE status IN ('active','trialing')
         GROUP BY tier ORDER BY count DESC`
      );
      const statusRows = await q(
        `SELECT status, COUNT(*)::int AS count FROM user_subscriptions
         GROUP BY status ORDER BY count DESC`
      );
      const trialRow = await q(
        `SELECT COUNT(*)::int AS count FROM user_subscriptions WHERE is_trial = true AND status = 'trialing'`
      );
      const totalRow = await q(
        `SELECT COUNT(*)::int AS count FROM user_subscriptions WHERE status IN ('active','trialing')`
      );

      snapshot = {
        total: totalRow[0]?.count ?? 0,
        byTier: tierRows,
        byStatus: statusRows,
        activeTrials: trialRow[0]?.count ?? 0,
      };
    } catch (e: any) {
      console.warn("Snapshot query failed:", e.message);
    }

    // 3. Monthly subscriber history (last 12 months)
    let monthlyHistory: any[] = [];
    try {
      monthlyHistory = await q(`
        SELECT
          DATE_TRUNC('month', created_at)::date AS month,
          COUNT(*)::int AS new_subscribers,
          COUNT(*) FILTER (WHERE tier = 'free')::int AS free_count,
          COUNT(*) FILTER (WHERE tier = 'pro')::int AS pro_count,
          COUNT(*) FILTER (WHERE tier = 'pro_trader')::int AS pro_trader_count,
          COUNT(*) FILTER (WHERE is_trial = true)::int AS trial_count
        FROM user_subscriptions
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month DESC
      `);
    } catch (e: any) {
      console.warn("Monthly history query failed:", e.message);
    }

    return NextResponse.json({ reports, snapshot, monthlyHistory });
  } catch (error: any) {
    console.error("Admin reporting error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  POST  — generate or save a report for a given month               */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  if (!auth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      action,          // 'generate' | 'submit' | 'revise'
      reportMonth,     // '2026-01-01'
      reportType = "monthly_summary",
      notes,
      submittedBy,
      submissionRef,
      reportId,        // required for 'submit' and 'revise'
      // manual overrides (optional)
      professionalSubscribers,
      nonProfessionalSubscribers,
    } = body;

    /* ---------- GENERATE: auto-compute from DB -------------------- */
    if (action === "generate") {
      if (!reportMonth) {
        return NextResponse.json({ error: "reportMonth required" }, { status: 400 });
      }

      const monthStart = reportMonth; // e.g. '2026-01-01'
      const monthEnd = (() => {
        const d = new Date(monthStart);
        d.setUTCMonth(d.getUTCMonth() + 1);
        return d.toISOString().slice(0, 10);
      })();

      // Count subscribers who were active at any point during the month
      // A subscriber had potential access if created_at <= monthEnd
      // and their status was active/trialing during that period
      const tierCounts = await q(`
        SELECT
          COUNT(*) FILTER (WHERE tier = 'free')::int   AS free_count,
          COUNT(*) FILTER (WHERE tier = 'pro')::int    AS pro_count,
          COUNT(*) FILTER (WHERE tier = 'pro_trader')::int AS pro_trader_count,
          COUNT(*) FILTER (WHERE is_trial = true)::int AS trial_count,
          COUNT(*)::int AS total
        FROM user_subscriptions
        WHERE created_at < $1
          AND status IN ('active', 'trialing', 'past_due')
      `, [monthEnd]);

      const counts = tierCounts[0] || { free_count: 0, pro_count: 0, pro_trader_count: 0, trial_count: 0, total: 0 };

      // Professional = pro + pro_trader, Non-Professional = free + trial
      const proSubs = (professionalSubscribers ?? counts.pro_count + counts.pro_trader_count);
      const nonProSubs = (nonProfessionalSubscribers ?? counts.free_count + counts.trial_count);

      // All paying subscribers get real-time; free/trial get delayed
      const realtimeUsers = counts.pro_count + counts.pro_trader_count;
      const delayedUsers = counts.free_count + counts.trial_count;

      const due = dueDate(monthStart);
      const revDeadline = revisionDeadline(due);

      const rows = await q(`
        INSERT INTO nasdaq_usage_reports (
          report_month, professional_subscribers, non_professional_subscribers,
          total_subscribers, realtime_users, delayed_users,
          free_tier_count, pro_tier_count, pro_trader_count, trial_count,
          report_type, status, due_date, revision_deadline, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12,$13,$14)
        ON CONFLICT (report_month, report_type) WHERE revision_of IS NULL
        DO UPDATE SET
          professional_subscribers = EXCLUDED.professional_subscribers,
          non_professional_subscribers = EXCLUDED.non_professional_subscribers,
          total_subscribers = EXCLUDED.total_subscribers,
          realtime_users = EXCLUDED.realtime_users,
          delayed_users = EXCLUDED.delayed_users,
          free_tier_count = EXCLUDED.free_tier_count,
          pro_tier_count = EXCLUDED.pro_tier_count,
          pro_trader_count = EXCLUDED.pro_trader_count,
          trial_count = EXCLUDED.trial_count,
          notes = EXCLUDED.notes,
          updated_at = NOW()
        RETURNING *
      `, [
        monthStart, proSubs, nonProSubs,
        counts.total, realtimeUsers, delayedUsers,
        counts.free_count, counts.pro_count, counts.pro_trader_count, counts.trial_count,
        reportType, due, revDeadline, notes || null,
      ]);

      return NextResponse.json({ report: rows[0], generated: true });
    }

    /* ---------- SUBMIT: mark report as submitted ------------------- */
    if (action === "submit") {
      if (!reportId) {
        return NextResponse.json({ error: "reportId required" }, { status: 400 });
      }
      const rows = await q(`
        UPDATE nasdaq_usage_reports
        SET status = 'submitted',
            submitted_at = NOW(),
            submitted_by = $2,
            submission_ref = $3,
            notes = COALESCE($4, notes),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [reportId, submittedBy || null, submissionRef || null, notes || null]);

      if (!rows.length) {
        return NextResponse.json({ error: "Report not found" }, { status: 404 });
      }
      return NextResponse.json({ report: rows[0] });
    }

    /* ---------- REVISE: create revised version --------------------- */
    if (action === "revise") {
      if (!reportId) {
        return NextResponse.json({ error: "reportId required" }, { status: 400 });
      }
      // Fetch original
      const orig = await q(`SELECT * FROM nasdaq_usage_reports WHERE id = $1`, [reportId]);
      if (!orig.length) {
        return NextResponse.json({ error: "Original report not found" }, { status: 404 });
      }
      const o = orig[0];

      // Check revision deadline
      if (new Date() > new Date(o.revision_deadline)) {
        return NextResponse.json({ error: "Revision deadline has passed" }, { status: 400 });
      }

      const rows = await q(`
        INSERT INTO nasdaq_usage_reports (
          report_month, professional_subscribers, non_professional_subscribers,
          total_subscribers, realtime_users, delayed_users,
          free_tier_count, pro_tier_count, pro_trader_count, trial_count,
          report_type, status, due_date, revision_deadline,
          revision_of, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'revised','draft',$11,$12,$13,$14)
        RETURNING *
      `, [
        o.report_month,
        professionalSubscribers ?? o.professional_subscribers,
        nonProfessionalSubscribers ?? o.non_professional_subscribers,
        (professionalSubscribers ?? o.professional_subscribers) + (nonProfessionalSubscribers ?? o.non_professional_subscribers),
        o.realtime_users, o.delayed_users,
        o.free_tier_count, o.pro_tier_count, o.pro_trader_count, o.trial_count,
        o.due_date, o.revision_deadline,
        reportId, notes || `Revision of report ${reportId}`,
      ]);

      // Mark original as revised
      await q(`UPDATE nasdaq_usage_reports SET status = 'revised', updated_at = NOW() WHERE id = $1`, [reportId]);

      return NextResponse.json({ report: rows[0], revised: true });
    }

    return NextResponse.json({ error: "Invalid action. Use: generate, submit, revise" }, { status: 400 });
  } catch (error: any) {
    console.error("Admin reporting POST error:", error);
    return NextResponse.json({ error: error.message || "Server error" }, { status: 500 });
  }
}
