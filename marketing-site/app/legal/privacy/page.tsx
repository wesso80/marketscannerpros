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
      <p><strong>Effective date:</strong> 7 October 2025</p>

      <h2>Overview</h2>
      <p>
        MarketScanner Pros ("we", "us") provides a trading dashboard and related services.
        This policy explains what we collect, why, and your choices.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>Email Address:</strong> Collected during checkout to verify trial eligibility and send receipts. Required for all paid subscriptions.</li>
        <li><strong>Account:</strong> Workspace ID (device identifier) for authentication and subscription tracking.</li>
        <li><strong>Billing:</strong> Processed by Stripe (web/Android) or Apple (iOS); we store minimal subscription status and payment metadata.</li>
        <li><strong>Trial Usage Tracking:</strong> Email address, plan type, workspace ID, and Stripe customer ID stored to prevent trial abuse (one trial per email per plan).</li>
        <li><strong>Usage & Logs:</strong> Diagnostics, error tracking (via Sentry), and server logs for reliability and abuse prevention.</li>
        <li><strong>Cookies/Storage:</strong> Session cookies for authentication, workspace ID tracking, and user preferences.</li>
        <li><strong>Device Information:</strong> Browser type, IP address, and device fingerprints for fraud prevention and rate limiting.</li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>Authenticate accounts and secure access to the dashboard via workspace IDs.</li>
        <li>Verify trial eligibility and prevent trial abuse (one trial per email address).</li>
        <li>Process subscriptions and let you manage billing in Stripe's Customer Portal or Apple's App Store.</li>
        <li>Send transactional emails (receipts, subscription confirmations, trial reminders).</li>
        <li>Detect and prevent fraud, abuse, and unauthorized access.</li>
        <li>Monitor performance, track errors, and improve service reliability.</li>
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
      <ul>
        <li><strong>Email & Trial Records:</strong> Retained indefinitely to prevent trial abuse. Required for fraud prevention.</li>
        <li><strong>Subscription Data:</strong> Retained while subscription is active, plus 7 years for tax/legal compliance.</li>
        <li><strong>Workspace IDs:</strong> Retained for account continuity; deleted upon account deletion request.</li>
        <li><strong>Logs & Analytics:</strong> Retained for 90 days, then automatically deleted.</li>
        <li><strong>Other Personal Data:</strong> Kept only as long as necessary for stated purposes or as required by law.</li>
      </ul>

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