import { Resend } from "resend";

// Direct API key from environment (for Render/Vercel)
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "MarketScanner Pros <alerts@marketscannerpros.app>";

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set - email notifications disabled");
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(RESEND_API_KEY);
  }
  return resendClient;
}

export async function sendAlertEmail({
  to, subject, html,
}: { to: string; subject: string; html: string }) {
  const client = getResendClient();
  if (!client) {
    console.log(`[Email Skipped] No Resend client - would send to ${to}: ${subject}`);
    return null;
  }

  try {
    const { data, error } = await client.emails.send({ 
      from: FROM_EMAIL, 
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
