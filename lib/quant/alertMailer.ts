/**
 * Quant Alert Email Sender
 *
 * Sends operator email when ACTIONABLE or PRIORITY alerts fire.
 * Uses existing Resend infrastructure from lib/email.ts.
 */

import { sendAlertEmail } from '@/lib/email';
import type { InternalAlert, PipelineResult } from './types';

const OPERATOR_EMAIL = 'wesso@marketscannerpros.app';

/** Only email these tiers — WATCHLIST and INTERESTING are noise */
const EMAIL_TIERS: Set<string> = new Set(['ACTIONABLE', 'PRIORITY']);

/**
 * Tier-specific emoji/label
 */
function tierLabel(tier: string): { emoji: string; label: string } {
  switch (tier) {
    case 'PRIORITY':   return { emoji: '🔴', label: 'PRIORITY ALERT' };
    case 'ACTIONABLE': return { emoji: '🟠', label: 'ACTIONABLE ALERT' };
    default:           return { emoji: '🔵', label: tier };
  }
}

/**
 * Build HTML email body for a batch of quant alerts.
 */
function buildAlertEmailHtml(alerts: InternalAlert[], result: PipelineResult): string {
  const { regime, meta } = result;

  const alertRows = alerts.map(a => {
    const { emoji } = tierLabel(a.tier);
    const dimStr = a.topDimensions.slice(0, 3).map(d => `${d.name}: ${d.score}`).join(' · ');
    const dirColor = a.direction === 'LONG' ? '#10b981' : a.direction === 'SHORT' ? '#ef4444' : '#94a3b8';

    return `
      <tr style="border-bottom: 1px solid #334155;">
        <td style="padding:12px 8px;font-size:14px;color:#f1f5f9;font-weight:600;">${emoji} ${a.symbol}</td>
        <td style="padding:12px 8px;font-size:14px;color:${dirColor};font-weight:600;">${a.direction}</td>
        <td style="padding:12px 8px;font-size:20px;font-weight:700;color:#10b981;">${a.fusionScore.toFixed(1)}</td>
        <td style="padding:12px 8px;font-size:12px;color:#94a3b8;">${a.tier}</td>
        <td style="padding:12px 8px;font-size:12px;color:#94a3b8;">${dimStr}</td>
      </tr>
      <tr>
        <td colspan="5" style="padding:4px 8px 12px 8px;font-size:12px;color:#cbd5e1;">
          <strong>Thesis:</strong> ${a.thesis}<br>
          <strong>Invalidation:</strong> ${a.invalidation}
        </td>
      </tr>`;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; background-color: #0a0a0a; color: #e2e8f0; padding: 20px; margin: 0;">
  <div style="max-width: 640px; margin: 0 auto; background: #111827; border-radius: 12px; padding: 24px; border: 1px solid #1f2937;">

    <div style="text-align: center; margin-bottom: 16px;">
      <span style="font-size: 14px; letter-spacing: 2px; color: #10b981; font-weight: 700;">MSP QUANT</span>
    </div>

    <h1 style="color: #f1f5f9; margin: 0 0 4px 0; font-size: 20px; text-align: center;">
      ${alerts.length} Alert${alerts.length > 1 ? 's' : ''} Triggered
    </h1>

    <p style="color: #64748b; text-align: center; margin: 0 0 20px 0; font-size: 13px;">
      Regime: <strong style="color: #f1f5f9;">${regime.phase}</strong>
      &nbsp;·&nbsp; Confidence: ${regime.confidence}%
      &nbsp;·&nbsp; Agreement: ${regime.agreement}/4
    </p>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="border-bottom: 2px solid #1f2937;">
          <th style="padding:8px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Symbol</th>
          <th style="padding:8px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Dir</th>
          <th style="padding:8px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Score</th>
          <th style="padding:8px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Tier</th>
          <th style="padding:8px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Top Dims</th>
        </tr>
      </thead>
      <tbody>
        ${alertRows}
      </tbody>
    </table>

    <div style="background: #0a0a0a; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 12px; color: #64748b;">
      Scanned ${meta.symbolsScanned} symbols · ${meta.symbolsPassed} passed gates · ${meta.alertsGenerated} alerts · ${meta.scanDurationMs}ms
    </div>

    <div style="text-align: center; margin-top: 16px;">
      <a href="https://marketscannerpros.app/quant"
         style="display: inline-block; background: #10b981; color: #0a0a0a; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Open Quant Terminal
      </a>
    </div>

    <p style="color: #374151; font-size: 11px; text-align: center; margin-top: 20px;">
      Internal operator alert · Not for distribution
    </p>
  </div>
</body>
</html>`.trim();
}

/**
 * Send email for qualifying quant alerts.
 * Returns number of emails sent (0 or 1).
 */
export async function sendQuantAlertEmail(result: PipelineResult): Promise<number> {
  const qualifying = result.alerts.filter(a => EMAIL_TIERS.has(a.tier));

  if (qualifying.length === 0) {
    return 0;
  }

  const topAlert = qualifying[0];
  const { emoji, label } = tierLabel(topAlert.tier);
  const subject = `${emoji} ${label}: ${qualifying.map(a => a.symbol).join(', ')} — Fusion ${topAlert.fusionScore.toFixed(0)}`;

  const html = buildAlertEmailHtml(qualifying, result);

  try {
    const messageId = await sendAlertEmail({
      to: OPERATOR_EMAIL,
      subject,
      html,
    });
    console.log(`[quant:mailer] Sent alert email (${qualifying.length} alerts) — messageId: ${messageId}`);
    return 1;
  } catch (err) {
    console.error('[quant:mailer] Failed to send alert email:', err);
    return 0;
  }
}
