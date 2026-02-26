import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { sendAlertEmail } from '@/lib/email';
import { avTakeToken } from '@/lib/avRateGovernor';

/**
 * Alert End-to-End Test
 *
 * GET /api/alerts/test-trigger
 *
 * Requires auth (session cookie). Steps:
 * 1. Creates a temporary "AAPL price_below $99999" alert (guaranteed to trigger)
 * 2. Fetches the live AAPL price from Alpha Vantage
 * 3. Evaluates the condition
 * 4. Sends the alert email via Resend
 * 5. Cleans up the test alert
 * 6. Returns a detailed step-by-step log
 */
export async function GET(_req: NextRequest) {
  const log: string[] = [];
  const step = (msg: string) => {
    log.push(msg);
    console.log(`[alert-test] ${msg}`);
  };

  try {
    // 1. Auth
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Not logged in — open this URL while signed into the app' }, { status: 401 });
    }
    step(`✅ Session OK — workspace ${session.workspaceId.slice(0, 8)}…`);

    // 2. Get user email
    const userRows = await q<{ email: string }>(
      `SELECT email FROM user_subscriptions WHERE workspace_id = $1`,
      [session.workspaceId],
    );
    const email = userRows[0]?.email;
    if (!email) {
      step('❌ No email found in user_subscriptions');
      return NextResponse.json({ error: 'No email on file', log }, { status: 400 });
    }
    step(`✅ User email: ${email}`);

    // 3. Check existing active alerts (diagnostic)
    const existingAlerts = await q<{ id: string; symbol: string; condition_type: string; condition_value: number; is_active: boolean }>(
      `SELECT id, symbol, condition_type, condition_value, is_active
       FROM alerts WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [session.workspaceId],
    );
    step(`ℹ️  You have ${existingAlerts.length} alerts in total: ${existingAlerts.map(a => `${a.symbol} ${a.condition_type} ${a.condition_value} (active=${a.is_active})`).join(', ') || 'none'}`);

    // 4. Fetch AAPL price
    step('⏳ Fetching AAPL price from Alpha Vantage…');
    let price: number | null = null;
    try {
      await avTakeToken();
      const res = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&entitlement=realtime&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`,
      );
      const data = await res.json();
      const gq = data['Global Quote'] || data['Global Quote - DATA DELAYED BY 15 MINUTES'];
      price = gq?.['05. price'] ? parseFloat(gq['05. price']) : null;
      if (price) {
        step(`✅ AAPL price: $${price.toFixed(2)}`);
      } else {
        step(`⚠️ Alpha Vantage returned no price. Full response keys: ${Object.keys(data).join(', ')}`);
        // Use a fallback price so we can still test email
        price = 150;
        step(`ℹ️  Using fallback price $${price} to continue test`);
      }
    } catch (err: any) {
      step(`⚠️ AV fetch error: ${err.message}. Using fallback price $150`);
      price = 150;
    }

    // 5. Insert test alert
    step('⏳ Creating test alert (AAPL price_below $99999)…');
    const insertResult = await q<{ id: string }>(
      `INSERT INTO alerts (workspace_id, symbol, asset_type, condition_type, condition_value,
         is_active, is_recurring, notify_email, notify_push, name, notes)
       VALUES ($1, 'AAPL', 'equity', 'price_below', 99999,
         true, false, true, false, 'E2E Test Alert', 'Auto-created by test-trigger endpoint')
       RETURNING id`,
      [session.workspaceId],
    );
    const alertId = insertResult[0]?.id;
    if (!alertId) {
      step('❌ Failed to insert test alert');
      return NextResponse.json({ error: 'Insert failed', log }, { status: 500 });
    }
    step(`✅ Test alert created: id=${alertId}`);

    // 6. Evaluate condition
    const triggered = price! <= 99999; // Always true
    step(`✅ Condition check: ${price} <= 99999 → ${triggered ? 'TRIGGERED' : 'NOT triggered'}`);

    // 7. Send email
    let emailResult: string | null = null;
    if (triggered) {
      step('⏳ Sending alert email via Resend…');
      try {
        emailResult = await sendAlertEmail({
          to: email,
          alertName: 'E2E Test Alert',
          symbol: 'AAPL',
          message: `Test alert: AAPL is at $${price!.toFixed(2)} (below $99,999 threshold)`,
          value: price!,
          threshold: 99999,
          alertType: 'price',
        });
        step(`✅ Email sent! Resend ID: ${emailResult}`);
      } catch (err: any) {
        step(`❌ Email send FAILED: ${err.message}`);
      }
    }

    // 8. Record in history (same as real flow)
    try {
      await q(
        `INSERT INTO alert_history (alert_id, workspace_id, triggered_at, trigger_price, condition_met,
           symbol, condition_type, condition_value, notification_sent, notification_channel)
         VALUES ($1, $2, NOW(), $3, $4, 'AAPL', 'price_below', 99999, $5, 'email')`,
        [alertId, session.workspaceId, price, `AAPL below $99999 (now $${price!.toFixed(2)})`, !!emailResult],
      );
      step('✅ Alert history recorded');
    } catch (err: any) {
      step(`⚠️ History insert failed (non-fatal): ${err.message}`);
    }

    // 9. Cleanup — deactivate and delete the test alert
    await q(`DELETE FROM alerts WHERE id = $1 AND workspace_id = $2`, [alertId, session.workspaceId]);
    step('✅ Test alert cleaned up');

    // 10. Summary
    const success = !!emailResult;
    step(success
      ? `🎉 END-TO-END TEST PASSED — check ${email} for the test alert email`
      : '❌ TEST FAILED — email was not sent, see steps above');

    return NextResponse.json({ success, log, email, price, emailId: emailResult });
  } catch (err: any) {
    step(`💥 Unexpected error: ${err.message}`);
    return NextResponse.json({ error: err.message, log }, { status: 500 });
  }
}
