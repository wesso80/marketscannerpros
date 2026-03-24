/**
 * GET /api/quant/test-email — Send a test quant alert email
 * Admin-only. Sends a mock PRIORITY alert to verify email delivery.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { sendAlertEmail } from '@/lib/email';
import type { InternalAlert, PipelineResult } from '@/lib/quant/types';

export const runtime = 'nodejs';

const OPERATOR_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

function isOperator(cid: string): boolean {
  const lower = cid.toLowerCase();
  return OPERATOR_EMAILS.some(email => lower === email || lower.endsWith(`_${email}`));
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session || !isOperator(session.cid)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Mock data that mimics a real PRIORITY alert
  const mockAlerts: InternalAlert[] = [
    {
      id: 'NVDA_LONG_TEST',
      symbol: 'NVDA',
      tier: 'PRIORITY',
      permission: 'PRIORITY_GO',
      fusionScore: 88.4,
      direction: 'LONG',
      regime: 'TREND_UP',
      topDimensions: [
        { name: 'momentum', score: 82 },
        { name: 'structure', score: 78 },
        { name: 'participation', score: 75 },
        { name: 'volatility', score: 72 },
      ],
      thesis: 'BULLISH NVDA — Fusion 88/100 in TREND_UP regime. WHY: trend structure is aligned (EMA stacking + ADX confirming); momentum indicators (RSI/MACD/Stoch) aligned bullish; volume and institutional participation elevated. Direction confidence: 85%. Gates: 5/5 hard, soft score 92%. Weakest: timing (50), asymmetry (58). ALL DIMS: ✅ momentum: 82/100 (wt 20%) | ✅ structure: 78/100 (wt 15%) | ✅ participation: 75/100 (wt 10%) | ✅ volatility: 72/100 (wt 10%) | ✅ regime: 70/100 (wt 10%) | ◐ freshness: 80/100 (wt 10%) | ◐ asymmetry: 58/100 (wt 15%) | ◐ timing: 50/100 (wt 10%)',
      invalidation: 'INVALIDATED IF: (1) regime shifts from TREND_UP to RISK_OFF or conflicting, (2) weakest dim timing (50) drops below 30, (3) asymmetry (58) deteriorates, (4) fusion drops below 50, (5) direction flips from LONG.',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
      status: 'ACTIVE',
    },
    {
      id: 'BTC_LONG_TEST',
      symbol: 'BTC',
      tier: 'ACTIONABLE',
      permission: 'GO',
      fusionScore: 76.2,
      direction: 'LONG',
      regime: 'TREND_UP',
      topDimensions: [
        { name: 'volatility', score: 74 },
        { name: 'regime', score: 71 },
        { name: 'momentum', score: 68 },
        { name: 'freshness', score: 80 },
      ],
      thesis: 'BULLISH BTC — Fusion 76/100 in TREND_UP regime. WHY: volatility positioning is favorable for entry; regime is TREND_UP with 72% confidence (3/4 sources agree); momentum indicators aligned bullish. Direction confidence: 70%. Gates: 5/5 hard, soft score 80%. Weakest: timing (50), participation (52). ALL DIMS: ✅ volatility: 74/100 (wt 10%) | ✅ regime: 71/100 (wt 10%) | ◐ momentum: 68/100 (wt 20%) | ◐ freshness: 80/100 (wt 10%) | ◐ structure: 62/100 (wt 15%) | ◐ asymmetry: 55/100 (wt 15%) | ◐ participation: 52/100 (wt 10%) | ◐ timing: 50/100 (wt 10%)',
      invalidation: 'INVALIDATED IF: (1) regime shifts from TREND_UP to RISK_OFF or conflicting, (2) weakest dim timing (50) drops below 30, (3) participation (52) deteriorates, (4) fusion drops below 50, (5) direction flips from LONG.',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
      status: 'ACTIVE',
    },
  ];

  const mockResult: PipelineResult = {
    regime: {
      phase: 'TREND_UP',
      confidence: 72,
      confidenceBand: 'MODERATE' as any,
      agreement: 3,
      sources: {} as any,
      timestamp: new Date().toISOString(),
    },
    candidates: [],
    scored: [],
    permitted: [],
    alerts: mockAlerts,
    meta: {
      scanDurationMs: 2481,
      symbolsScanned: 89,
      symbolsPassed: 12,
      alertsGenerated: 2,
      timestamp: new Date().toISOString(),
    },
  };

  // Build email (replicating alertMailer logic inline to avoid tier filter)
  const dirColor = (d: string) => d === 'LONG' ? '#10b981' : d === 'SHORT' ? '#ef4444' : '#94a3b8';
  const tierEmoji = (t: string) => t === 'PRIORITY' ? '🔴' : t === 'ACTIONABLE' ? '🟠' : '🔵';

  const alertRows = mockAlerts.map(a => {
    const dimBars = a.topDimensions.map(d => {
      const barWidth = Math.max(4, Math.round(d.score * 1.5));
      const barColor = d.score >= 70 ? '#10b981' : d.score >= 50 ? '#eab308' : '#ef4444';
      return `
        <div style="display:flex;align-items:center;margin:2px 0;font-size:12px;">
          <span style="width:90px;color:#94a3b8;text-transform:uppercase;font-size:10px;letter-spacing:0.5px;">${d.name}</span>
          <div style="flex:1;background:#1f2937;border-radius:4px;height:12px;margin:0 8px;">
            <div style="width:${barWidth}px;max-width:100%;background:${barColor};height:12px;border-radius:4px;"></div>
          </div>
          <span style="color:#f1f5f9;font-weight:600;width:30px;text-align:right;">${d.score}</span>
        </div>`;
    }).join('');

    const dc = dirColor(a.direction);
    return `
      <div style="background:#0f172a;border-radius:10px;padding:16px;margin-bottom:16px;border-left:4px solid ${dc};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <span style="font-size:18px;font-weight:700;color:#f1f5f9;">${tierEmoji(a.tier)} ${a.symbol}</span>
            <span style="font-size:14px;color:${dc};font-weight:600;margin-left:8px;">${a.direction}</span>
          </div>
          <div style="text-align:right;">
            <div style="font-size:28px;font-weight:800;color:#10b981;">${a.fusionScore.toFixed(1)}</div>
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;">${a.tier}</div>
          </div>
        </div>
        <div style="margin-bottom:12px;">${dimBars}</div>
        <div style="background:#111827;border-radius:8px;padding:12px;margin-bottom:8px;">
          <div style="font-size:11px;color:#10b981;font-weight:600;text-transform:uppercase;margin-bottom:4px;">Thesis</div>
          <div style="font-size:13px;color:#e2e8f0;line-height:1.5;">${a.thesis}</div>
        </div>
        <div style="background:#111827;border-radius:8px;padding:12px;">
          <div style="font-size:11px;color:#ef4444;font-weight:600;text-transform:uppercase;margin-bottom:4px;">Invalidation</div>
          <div style="font-size:12px;color:#94a3b8;line-height:1.4;">${a.invalidation}</div>
        </div>
      </div>`;
  }).join('');

  const { regime, meta } = mockResult;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; background-color: #0a0a0a; color: #e2e8f0; padding: 20px; margin: 0;">
  <div style="max-width: 640px; margin: 0 auto; background: #111827; border-radius: 12px; padding: 24px; border: 1px solid #1f2937;">
    <div style="text-align: center; margin-bottom: 16px;">
      <span style="font-size: 14px; letter-spacing: 2px; color: #10b981; font-weight: 700;">MSP QUANT</span>
      <span style="font-size: 12px; color: #ef4444; margin-left: 8px;">[TEST EMAIL]</span>
    </div>
    <h1 style="color: #f1f5f9; margin: 0 0 4px 0; font-size: 20px; text-align: center;">
      ${mockAlerts.length} Alert${mockAlerts.length > 1 ? 's' : ''} Triggered
    </h1>
    <p style="color: #64748b; text-align: center; margin: 0 0 20px 0; font-size: 13px;">
      Regime: <strong style="color: #f1f5f9;">${regime.phase}</strong>
      &nbsp;·&nbsp; Confidence: ${regime.confidence}%
      &nbsp;·&nbsp; Agreement: ${regime.agreement}/4
    </p>
    ${alertRows}
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
      This is a test email · Internal operator alert · Not for distribution
    </p>
  </div>
</body>
</html>`.trim();

  try {
    const messageId = await sendAlertEmail({
      to: 'wesso@marketscannerpros.app',
      subject: '🔴 [TEST] PRIORITY ALERT: NVDA, BTC — Fusion 88',
      html,
    });

    return NextResponse.json({
      success: true,
      messageId,
      sentTo: 'wesso@marketscannerpros.app',
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
    }, { status: 500 });
  }
}
