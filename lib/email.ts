import { Resend } from "resend";

const from = process.env.EMAIL_FROM || "onboarding@resend.dev";

export async function sendAlertEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY");
  }

  // Initialize only when sending
  const resend = new Resend(process.env.RESEND_API_KEY);

  return await resend.emails.send({
    from,
    to,
    subject,
    html,
  });
}
