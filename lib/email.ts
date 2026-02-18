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
  const emoji = isSmartAlert ? '🧠' : '🔔';
  const typeLabel = isSmartAlert ? 'Smart Alert' : 'Price Alert';
  
  const subject = `${emoji} ${alertName} - ${symbol}`;
  
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
      <span style="font-size: 48px;">${emoji}</span>
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
      <a href="https://app.marketscannerpros.app/tools/alerts" 
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
    
    console.log(`📧 Email sent to ${to}: ${subject}`);
    return data?.id ?? null;
  } catch (err) {
    console.error("Email send failed:", err);
    throw err;
  }
}
