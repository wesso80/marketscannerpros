import { Resend } from "resend";
import { resolveAlertsFromEmail } from "@/lib/alerts/emailPolicy";

export { DEFAULT_ALERTS_FROM_EMAIL, resolveAlertsFromEmail } from "@/lib/alerts/emailPolicy";

let resendClient: Resend | null = null;
let resendClientKey: string | null = null;

function getResendClient(): Resend | null {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();

  if (!apiKey) {
    console.warn("RESEND_API_KEY not set - email notifications disabled");
    return null;
  }

  if (!resendClient || resendClientKey !== apiKey) {
    resendClient = new Resend(apiKey);
    resendClientKey = apiKey;
  }

  return resendClient;
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

/** Dedicated sign-in sender. The domain is already verified with Resend, so this mailbox does not need its own DNS. */
export const DEFAULT_AUTH_FROM_EMAIL = "MarketScannerPros <login@marketscannerpros.app>";

export const SIGN_IN_EMAIL_SUBJECT = "Your sign-in link";

const SAFE_SIGN_IN_URL = /^https:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/;

export function resolveAuthFromEmail(env: NodeJS.ProcessEnv = process.env): string {
  const dedicated = (env.AUTH_FROM_EMAIL || "").trim();
  if (dedicated) return dedicated;
  return DEFAULT_AUTH_FROM_EMAIL;
}

/** Optional Reply-To. Omitted when unset — the repo has no shared support-address constant. */
export function resolveAuthReplyTo(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const replyTo = (env.AUTH_REPLY_TO || "").trim();
  return replyTo || undefined;
}

export function buildSignInEmail(verifyUrl: string): { subject: string; text: string; html: string } {
  if (!SAFE_SIGN_IN_URL.test(verifyUrl)) {
    throw new Error("Invalid sign-in URL");
  }

  const text = [
    "Use this link to sign in. It expires in 15 minutes.",
    "",
    verifyUrl,
    "",
    "If you did not request this email, you can ignore it.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background-color:#ffffff;color:#1f2937;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;">
  <p style="margin:0 0 16px;">Use this link to sign in. It expires in 15 minutes.</p>
  <p style="margin:0 0 16px;"><a href="${verifyUrl}" style="color:#1d4ed8;">Sign in</a></p>
  <p style="margin:0;color:#4b5563;font-size:14px;">If you did not request this email, you can ignore it.</p>
</body>
</html>`;

  return { subject: SIGN_IN_EMAIL_SUBJECT, text, html };
}

interface SendAlertEmailParams {
  to: string;
  alertName: string;
  symbol: string;
  message: string;
  value?: number;
  threshold?: number;
  alertType?: 'price' | 'smart';
}

export function buildTriggeredAlertContent(params: SendAlertEmailParams): { subject: string; html: string } {
  const { alertName, symbol, message, value, threshold, alertType = 'price' } = params;
  
  const isSmartAlert = alertType === 'smart';
  const alertCode = isSmartAlert ? 'AI' : 'PX';
  const typeLabel = isSmartAlert ? 'Smart Alert' : 'Price Alert';
  
  const subject = `${typeLabel}: ${alertName} - ${symbol}`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #e2e8f0; padding: 20px;">
  <div style="max-width: 500px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 24px; border: 1px solid #334155;">
    <div style="text-align: center; margin-bottom: 20px;">
      <span style="display:inline-block;font-size:16px;font-weight:800;color:#10b981;border:1px solid #10b981;border-radius:999px;padding:10px 14px;letter-spacing:0.5px;">${alertCode}</span>
    </div>
    
    <h1 style="color: #10b981; margin: 0 0 8px 0; font-size: 24px; text-align: center;">
      ${typeLabel} Triggered
    </h1>
    
    <p style="color: #94a3b8; text-align: center; margin: 0 0 24px 0;">
      ${alertName}
    </p>
    
    <div style="background: #0f172a; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <div style="font-size: 14px; color: #64748b; margin-bottom: 4px;">Symbol</div>
      <div style="font-size: 20px; font-weight: bold; color: #f1f5f9;">${symbol}</div>
    </div>
    
    <div style="background: #0f172a; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <div style="font-size: 14px; color: #64748b; margin-bottom: 4px;">Alert Details</div>
      <div style="font-size: 16px; color: #f1f5f9;">${message}</div>
      ${value !== undefined ? `
      <div style="margin-top: 8px; font-size: 14px; color: #94a3b8;">
        Current: <strong style="color: #10b981;">${typeof value === 'number' ? value.toFixed(4) : value}</strong>
        ${threshold !== undefined ? ` | Threshold: ${typeof threshold === 'number' ? threshold.toFixed(4) : threshold}` : ''}
      </div>
      ` : ''}
    </div>
    
    <div style="text-align: center; margin-top: 24px;">
      <a href="https://app.marketscannerpros.app/tools/workspace?tab=alerts"
         style="display: inline-block; background: #10b981; color: #0f172a; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        View Alerts Dashboard
      </a>
    </div>
    
    <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 24px;">
      MarketScannerPros • Real-time market intelligence
    </p>
  </div>
</body>
</html>
  `.trim();

  return { subject, html };
}

export async function sendAlertEmail(params: SendEmailParams | SendAlertEmailParams) {
  if ('html' in params) {
    return sendAlertsMailboxEmail(params);
  }

  const built = buildTriggeredAlertContent(params);
  return sendAlertsMailboxEmail({ to: params.to, subject: built.subject, html: built.html });
}

// Two access levels only (Free / Pro). Legacy `pro_trader` subscribers get the same Pro email.
const PRO_FEATURES = [
  ['SCAN', 'Unlimited Scanner', 'Run unlimited technical scans across the full market'],
  ['AI', 'AI Analyst (20/day)', 'AI-powered market analysis and research tools'],
  ['OPT', 'Options timing', 'Options chain, Greeks, IV and options-flow measurements'],
  ['BT', 'Strategy Backtester', 'Test strategies against historical data'],
  ['JRNL', 'Trade Journal', 'Log, review, and analyze every trade'],
  ['CRYP', 'Crypto Derivatives', 'Perpetuals, funding rates, and open interest'],
  ['OPS', 'Operator Intelligence', 'Workflow automation and decision packets'],
  ['CSV', 'CSV Exports', 'Download scan results and journal data'],
  ['NEWS', 'Real-Time News', 'Curated market news feed with alerts'],
];

export async function sendWelcomeEmail(to: string, tier: 'pro' | 'pro_trader') {
  void tier; // 'pro' and legacy 'pro_trader' get the same Pro welcome
  const planName = 'Pro';
  const features = PRO_FEATURES;
  const accent = 'var(--msp-bull)';

  const featureRows = features
    .map(
      ([code, title, desc]) =>
        `<tr>
          <td style="padding:8px 12px 8px 0;font-size:11px;font-weight:800;color:${accent};vertical-align:top;width:48px;letter-spacing:0.4px;">${code}</td>
          <td style="padding:8px 0;">
            <div style="font-size:15px;font-weight:600;color:#f1f5f9;">${title}</div>
            <div style="font-size:13px;color:#94a3b8;margin-top:2px;">${desc}</div>
          </td>
        </tr>`
    )
    .join('');

  const quickLinks = [
    ['Scanner', '/tools/scanner'],
    ['Portfolio', '/tools/workspace?tab=portfolio'],
    ['MSP AI', '/tools/scanner'],
    ['Journal', '/tools/workspace?tab=journal'],
    ['Backtester', '/tools/workspace?tab=backtest'],
  ]
    .map(
      ([label, path]) =>
        `<a href="https://app.marketscannerpros.app${path}" style="display:inline-block;background:#1e293b;color:#e2e8f0;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:500;border:1px solid #334155;margin:4px;">${label}</a>`
    )
    .join('');

  const subject = `Welcome to MarketScannerPros ${planName}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#0f172a;color:#e2e8f0;padding:20px;margin:0;">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="display:inline-block;font-size:16px;font-weight:800;color:${accent};border:1px solid ${accent};border-radius:999px;padding:10px 16px;letter-spacing:0.5px;">MSP</span>
    </div>

    <h1 style="color:${accent};margin:0 0 8px;font-size:26px;text-align:center;font-weight:700;">
      Welcome to ${planName}
    </h1>
    <p style="color:#94a3b8;text-align:center;margin:0 0 28px;font-size:15px;">
      Your subscription is active. Here&rsquo;s everything you&rsquo;ve unlocked.
    </p>

    <div style="background:#0f172a;border-radius:12px;padding:20px;margin-bottom:24px;">
      <div style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Your ${planName} Features</div>
      <table style="width:100%;border-collapse:collapse;">${featureRows}</table>
    </div>

    <div style="text-align:center;margin-bottom:24px;">
      <a href="https://app.marketscannerpros.app/tools" 
         style="display:inline-block;background:${accent};color:#0f172a;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">
        Open Dashboard
      </a>
    </div>

    <div style="background:#0f172a;border-radius:12px;padding:16px;margin-bottom:24px;text-align:center;">
      <div style="font-size:13px;font-weight:600;color:#64748b;margin-bottom:10px;">Quick Links</div>
      ${quickLinks}
    </div>

    <div style="border-top:1px solid #334155;padding-top:20px;text-align:center;">
      <p style="color:#64748b;font-size:13px;margin:0 0 4px;">Need help? Reply to this email or visit our <a href="https://marketscannerpros.app/guide" style="color:${accent};text-decoration:none;">Platform Guide</a>.</p>
      <p style="color:#475569;font-size:12px;margin:0;">MarketScannerPros &bull; Real-time market intelligence</p>
    </div>
  </div>
</body>
</html>`.trim();

  return sendEmail({ to, subject, html });
}

export async function sendNewSignupNotification(email: string, tier: string) {
  const subject = `New MSP Signup: ${email}`;
  const now = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:20px;">
  <div style="max-width:500px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px;border:1px solid #334155;">
    <h2 style="color:#10b981;margin:0 0 16px;">New User Signup</h2>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="color:#94a3b8;padding:6px 0;">Email</td><td style="color:#f1f5f9;padding:6px 0;font-weight:600;">${email}</td></tr>
      <tr><td style="color:#94a3b8;padding:6px 0;">Tier</td><td style="color:#f1f5f9;padding:6px 0;font-weight:600;">${tier}</td></tr>
      <tr><td style="color:#94a3b8;padding:6px 0;">Time (AEST)</td><td style="color:#f1f5f9;padding:6px 0;">${now}</td></tr>
    </table>
    <p style="color:#64748b;font-size:12px;margin:20px 0 0;">MarketScannerPros</p>
  </div>
</body>
</html>`.trim();

  try {
    await sendEmail({ to: 'wesso@marketscannerpros.app', subject, html });
  } catch (e) {
    console.error('New signup notification failed:', e);
  }
}

export async function sendAlertsMailboxEmail(params: SendEmailParams): Promise<string | null> {
  try {
    return await sendEmail({ ...params, from: resolveAlertsFromEmail() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/suppress/i.test(message) && params.to) {
      const { noteProviderSuppression } = await import("@/lib/alerts/emailControls");
      await noteProviderSuppression(params.to, message).catch(() => {});
    }
    throw error;
  }
}

async function sendEmail({ to, subject, html, text, from, replyTo, headers }: SendEmailParams) {
  const client = getResendClient();
  if (!client) {
    throw new Error('RESEND_API_KEY not set');
  }

  const fromEmail = (from || "").trim() || process.env.RESEND_FROM_EMAIL || "MarketScannerPros <alerts@marketscannerpros.app>";

  try {
    const payload: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text?: string;
      replyTo?: string;
      headers?: Record<string, string>;
    } = { from: fromEmail, to, subject, html };
    if (text) payload.text = text;
    if (replyTo) payload.replyTo = replyTo;
    if (headers && Object.keys(headers).length > 0) payload.headers = headers;

    const { data, error } = await client.emails.send(payload);
    
    if (error) {
      console.error("Resend error:", error.message || "Resend send failed");
      throw new Error(error.message || "Resend send failed");
    }

    // Log the provider id only. Never log the body — sign-in mail contains the token URL.
    console.log(`Email sent to ${to}: ${subject} id=${data?.id ?? "missing"}`);
    return data?.id ?? null;
  } catch (err) {
    console.error("Email send failed:", err instanceof Error ? err.message : "send failed");
    throw err;
  }
}

function escapeEmailText(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch
  ));
}

/** Backup record for support. The body is the workspace id, customer id, and time. The log path stays in sendEmail. */
export async function sendDeletionRequestEmail(input: { workspaceId: string; customerId: string; requestedAt: string }): Promise<void> {
  const subject = 'Data deletion request';
  const text = [
    'Data deletion request',
    `Workspace: ${input.workspaceId}`,
    `Customer: ${input.customerId}`,
    `Requested at: ${input.requestedAt}`,
    'Confirm to the customer within 48 hours.',
  ].join('\n');
  const html = `<p>Data deletion request</p><p>Workspace: ${escapeEmailText(input.workspaceId)}</p><p>Customer: ${escapeEmailText(input.customerId)}</p><p>Requested at: ${escapeEmailText(input.requestedAt)}</p><p>Confirm to the customer within 48 hours.</p>`;
  await sendEmail({ to: 'support@marketscannerpros.app', subject, html, text });
}

export async function sendSignInEmail(params: { to: string; verifyUrl: string }) {
  const content = buildSignInEmail(params.verifyUrl);
  return sendEmail({
    to: params.to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    from: resolveAuthFromEmail(),
    replyTo: resolveAuthReplyTo(),
  });
}
