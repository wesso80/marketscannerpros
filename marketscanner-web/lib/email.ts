import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendAlertEmail(opts: {
  to: string;
  subject: string;
  html: string;
  fromOverride?: string;
}) {
  const from =
    opts.fromOverride ||
    process.env.EMAIL_FROM ||
    "MarketScanner Alerts <onboarding@resend.dev>";

  return await resend.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}
