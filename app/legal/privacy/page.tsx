// app/legal/privacy/page.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — MarketScanner Pros",
  description:
    "How MarketScanner Pros collects, uses, and protects your data, including secure access code authentication and Stripe billing.",
  alternates: { canonical: "https://marketscannerpros.app/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="prose prose-invert mx-auto max-w-3xl px-4 py-10">
      <h1>Privacy Policy</h1>
      <p><strong>Effective date:</strong> 28 September 2025</p>

      <h2>Overview</h2>
      <p>
        MarketScanner Pros ("we", "us") provides a trading dashboard and related services.
        This policy explains what we collect, why, and your choices.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>Account:</strong> Secure access code authentication (no personal information collected).</li>
        <li><strong>Billing:</strong> Processed by Stripe; we keep minimal subscription status.</li>
        <li><strong>Usage & Logs:</strong> Diagnostics and server logs for reliability/abuse prevention.</li>
        <li><strong>Cookies/Storage:</strong> Auth/session cookies and preferences.</li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>Authenticate accounts and secure access to the dashboard.</li>
        <li>Process subscriptions and let you manage billing in Stripe's Customer Portal.</li>
        <li>Operate, maintain, and improve the service; comply with legal obligations.</li>
      </ul>

      <h2>Sharing & processors</h2>
      <ul>
        <li><strong>Stripe</strong> (payments & portal).</li>
        <li><strong>NextAuth</strong> (JWT session management).</li>
        <li><strong>Hosting</strong>: Vercel (app) and Cloudflare Pages (marketing).</li>
        <li><strong>Backend</strong>: Our FastAPI service for data features.</li>
      </ul>

      <h2>International transfers</h2>
      <p>Data may be processed outside your country; we use appropriate safeguards where required.</p>

      <h2>Retention</h2>
      <p>We keep personal data only as long as necessary for the purposes above or as required by law.</p>

      <h2>Your rights</h2>
      <p>You may request access, correction, deletion, or object to processing. Contact us to exercise rights.</p>

      <h2>Children</h2>
      <p>Not directed to individuals under 16. We do not knowingly collect children's data.</p>

      <h2>Security</h2>
      <p>We use reasonable technical and organizational measures; no method is 100% secure.</p>

      <h2>Changes</h2>
      <p>We may update this policy and change the effective date. Material changes may include additional notice.</p>

      <h2>Contact</h2>
      <p>Email: <a href="mailto:support@marketscannerpros.app">support@marketscannerpros.app</a></p>
    </main>
  );
}