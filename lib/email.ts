import { Resend } from "resend";

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

export async function sendAlertEmail(params: SendEmailParams | SendAlertEmailParams) {
  // Handle legacy interface
  if ('html' in params) {
    return sendEmail(params);
  }

  // New alert-specific interface
  const { to, alertName, symbol, message, value, threshold, alertType = 'price' } = params;
  
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

  return sendEmail({ to, subject, html });
}

const PRO_FEATURES = [
  ['SCAN', 'Unlimited Scanner', 'Run unlimited technical scans across the full market'],
  ['AI', 'AI Analyst (50/day)', 'GPT-powered market analysis and research tools'],
  ['OPT', 'Options Confluence', 'Multi-signal options flow analysis'],
  ['CSV', 'CSV Exports', 'Download scan results and journal data'],
  ['NEWS', 'Real-Time News', 'Curated market news feed with alerts'],
];

const PRO_TRADER_FEATURES = [
  ['PRO', 'Everything in Pro', 'Full access to all Pro features'],
  ['BT', 'Strategy Backtester', 'Test strategies against historical data'],
  ['JRNL', 'Trade Journal', 'Log, review, and analyze every trade'],
  ['OPT', 'Options Terminal', 'Full options chain with Greeks and IV analysis'],
  ['CRYP', 'Crypto Derivatives', 'Perpetuals, funding rates, and open interest'],
  ['AI', 'Unlimited AI', 'No daily limit on AI Analyst questions'],
  ['OPS', 'Operator Intelligence', 'Workflow automation and decision packets'],
];

export async function sendWelcomeEmail(to: string, tier: 'pro' | 'pro_trader') {
  const isPT = tier === 'pro_trader';
  const planName = isPT ? 'Pro Trader' : 'Pro';
  const features = isPT ? PRO_TRADER_FEATURES : PRO_FEATURES;
  const accent = '#10b981';

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
    ['ARCA AI Panel', '/tools/scanner'],
    ...(isPT ? [['Journal', '/tools/workspace?tab=journal'], ['Backtester', '/tools/workspace?tab=backtest']] : []),
  ]
    .map(
      ([label, path]) =>
        `<a href="https://app.marketscannerpros.app${path}" style="display:inline-block;background:#1e293b;color:#e2e8f0;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:500;border:1px solid #334155;margin:4px;">${label}</a>`
    )
    .join('');

  const subject = `Welcome to MarketScanner Pros ${planName}`;

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
      <p style="color:#475569;font-size:12px;margin:0;">MarketScanner Pros &bull; Real-time market intelligence</p>
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
    <p style="color:#64748b;font-size:12px;margin:20px 0 0;">MarketScanner Pros</p>
  </div>
</body>
</html>`.trim();

  try {
    await sendEmail({ to: 'wesso@marketscannerpros.app', subject, html });
  } catch (e) {
    console.error('New signup notification failed:', e);
  }
}

async function sendEmail({ to, subject, html }: SendEmailParams) {
  const client = getResendClient();
  if (!client) {
    throw new Error('RESEND_API_KEY not set');
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || "MarketScanner Pros <alerts@marketscannerpros.app>";

  try {
    const { data, error } = await client.emails.send({ 
      from: fromEmail,
      to, 
      subject, 
      html 
    });
    
    if (error) {
      console.error("Resend error:", error);
      throw new Error(error.message || "Resend send failed");
    }
    
    console.log(`Email sent to ${to}: ${subject}`);
    return data?.id ?? null;
  } catch (err) {
    console.error("Email send failed:", err);
    throw err;
  }
}
