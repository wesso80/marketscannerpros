import { sendAlertEmail } from "./email";
import { userHasPaidPlan } from "./stripe";

export async function notifyPriceAlert(
  user: { email?: string },
  payload: { symbol: string; price: number; note?: string }
) {
  if (!user?.email) return;
  const allowed = await userHasPaidPlan(user.email);
  if (!allowed) return;

  await sendAlertEmail({
    to: user.email,
    subject: `📈 ${payload.symbol} hit ${payload.price}`,
    html: `
      <h2>${payload.symbol} Alert</h2>
      <p>Price reached <b>${payload.price}</b>.</p>
      ${payload.note ? `<p>${payload.note}</p>` : ""}
      <p style="margin-top:16px"><a href="https://app.marketscannerpros.app/alerts">Open MarketScanner</a></p>
    `,
  });
}
