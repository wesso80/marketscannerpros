import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — MarketScanner Pros",
  description:
    "How MarketScanner Pros collects, uses, and protects your data, including secure access code authentication and Stripe billing.",
  alternates: { canonical: "https://marketscannerpros.app/privacy" },
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--msp-bg)] px-4 py-16 text-slate-200">
      <div className="mx-auto max-w-[800px]">
        <div className="rounded-3xl border border-emerald-500/20 bg-[var(--msp-card)] p-8 shadow-2xl md:p-12">
          <div className="prose prose-invert prose-emerald max-w-none prose-headings:text-slate-100 prose-a:text-emerald-400 prose-strong:text-slate-200">
      <h1 className="text-emerald-400">Privacy Policy</h1>
      <p><strong>Effective date:</strong> 13 December 2025</p>

      <h2>Overview</h2>
      <p>
        MarketScanner Pros (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides a trading dashboard and related services.
        This policy explains what we collect, why, and your choices.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>Email Address:</strong> Collected during checkout to verify trial eligibility and send receipts. Required for all paid subscriptions.</li>
        <li><strong>Account:</strong> Workspace ID (device identifier) for authentication and subscription tracking.</li>
        <li><strong>Billing:</strong> Processed by Stripe (web/Android) or Apple (iOS); we store minimal subscription status and payment metadata.</li>
        <li><strong>Trial Usage Tracking:</strong> Email address, plan type, workspace ID, and Stripe customer ID stored to prevent trial abuse (one trial per email per plan).</li>
        <li><strong>Usage &amp; Logs:</strong> Diagnostics, error tracking (via Sentry), and server logs for reliability and abuse prevention.</li>
        <li><strong>AI Interactions:</strong> Questions asked to ARCA AI (AI chatbot) are tracked by workspace ID for tier limit enforcement. We store question count, tier level, and timestamps. Question content may be logged for debugging but is not used for training.</li>
        <li><strong>Edge Profile &amp; Personalisation Data:</strong> If you use the trade journal, we analyse your closed trade history to generate Edge Profile insights (win rates, patterns, strategy performance). This data is derived from your own journal entries and is processed only within your workspace.</li>
        <li><strong>Adaptive Personality Data:</strong> Your interaction patterns, scan preferences, and tool usage may be used to personalise the dashboard experience. This data remains within your workspace and is not shared with third parties.</li>
        <li><strong>Portfolio &amp; Journal Data:</strong> Paper trade positions, closed trade history, and journal entries are stored in our database for cross-device sync. This is simulation data for educational purposes only &mdash; we do not connect to or access any live brokerage accounts.</li>
        <li><strong>Cookies/Storage:</strong> Session cookies for authentication, workspace ID tracking, and user preferences.</li>
        <li><strong>Device Information:</strong> Browser type, IP address, and device fingerprints for fraud prevention and rate limiting.</li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>Authenticate accounts and secure access to the dashboard via workspace IDs.</li>
        <li>Verify trial eligibility and prevent trial abuse (one trial per email address).</li>
        <li>Process subscriptions and let you manage billing in Stripe&rsquo;s Customer Portal or Apple&rsquo;s App Store.</li>
        <li>Send transactional emails (receipts, subscription confirmations, trial reminders).</li>
        <li>Detect and prevent fraud, abuse, and unauthorized access.</li>
        <li>Generate Edge Profile insights from your journal data to surface historical trading patterns (educational analysis only).</li>
        <li>Process AI chatbot queries through OpenAI to provide educational market insights (OpenAI does not train on your data).</li>
        <li>Sync paper trade portfolio and journal data across your devices.</li>
        <li>Monitor performance, track errors, and improve service reliability.</li>
        <li>Operate, maintain, and improve the service; comply with legal obligations.</li>
      </ul>

      <h2>Sharing &amp; processors</h2>
      <ul>
        <li><strong>Stripe</strong> (payments &amp; portal).</li>
        <li><strong>OpenAI</strong> (ARCA AI chatbot powered by GPT-4 - does not train on your data).</li>
        <li><strong>Alpha Vantage</strong> (real-time and historical market data provider).</li>
        <li><strong>Render</strong> (application hosting and web services).</li>
        <li><strong>Neon</strong> (PostgreSQL database hosting).</li>
      </ul>

      <h2>International transfers</h2>
      <p>Data may be processed outside your country; we use appropriate safeguards where required.</p>

      <h2>Retention</h2>
      <ul>
        <li><strong>Email &amp; Trial Records:</strong> Retained indefinitely to prevent trial abuse. Required for fraud prevention.</li>
        <li><strong>Subscription Data:</strong> Retained while subscription is active, plus 7 years for tax/legal compliance.</li>
        <li><strong>Workspace IDs:</strong> Retained for account continuity; deleted upon account deletion request.</li>
        <li><strong>Logs &amp; Analytics:</strong> Retained for 90 days, then automatically deleted.</li>
        <li><strong>Other Personal Data:</strong> Kept only as long as necessary for stated purposes or as required by law.</li>
      </ul>

      <h2>Your rights</h2>
      <p>You may request access, correction, deletion, or object to processing. Contact us to exercise rights.</p>

      <h2 id="gdpr">Your rights (GDPR)</h2>
      <p>If you are in the European Economic Area (EEA), United Kingdom, or Switzerland, you have the following rights under the GDPR:</p>
      <ul>
        <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
        <li><strong>Rectification:</strong> Request correction of inaccurate or incomplete data.</li>
        <li><strong>Erasure:</strong> Request deletion of your personal data (&ldquo;right to be forgotten&rdquo;).</li>
        <li><strong>Restriction:</strong> Request that we limit processing of your data.</li>
        <li><strong>Portability:</strong> Request your data in a machine-readable format.</li>
        <li><strong>Object:</strong> Object to processing based on legitimate interests or for direct marketing.</li>
      </ul>
      <p>To exercise these rights, email <a href="mailto:support@marketscannerpros.app">support@marketscannerpros.app</a> or use the &ldquo;Delete My Data&rdquo; button in your Account settings.</p>

      <h2 id="ccpa">California Privacy Rights (CCPA/CPRA)</h2>
      <p>If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA):</p>
      <ul>
        <li><strong>Right to Know:</strong> Request disclosure of the categories and specific pieces of personal information we have collected about you.</li>
        <li><strong>Right to Delete:</strong> Request deletion of personal information we have collected from you.</li>
        <li><strong>Right to Correct:</strong> Request correction of inaccurate personal information.</li>
        <li><strong>Right to Opt-Out:</strong> Opt out of the &ldquo;sale&rdquo; or &ldquo;sharing&rdquo; of your personal information.</li>
        <li><strong>Non-Discrimination:</strong> We will not discriminate against you for exercising your privacy rights.</li>
      </ul>
      <p><strong>Do Not Sell or Share My Personal Information:</strong> We do not sell your personal information to third parties. We do not share your personal information for cross-context behavioral advertising. Our third-party data processors (Stripe, OpenAI, Alpha Vantage) only process data on our behalf and are contractually prohibited from using it for their own purposes.</p>
      <p>To exercise your CCPA rights, email <a href="mailto:support@marketscannerpros.app">support@marketscannerpros.app</a> with the subject line &ldquo;CCPA Request&rdquo;.</p>

      <h2>Children</h2>
      <p>Not directed to individuals under 16. We do not knowingly collect children&rsquo;s data.</p>

      <h2>Security</h2>
      <p>We use reasonable technical and organizational measures; no method is 100% secure.</p>

      <h2>Changes</h2>
      <p>We may update this policy and change the effective date. Material changes may include additional notice.</p>

      <h2>Contact</h2>
      <p>Email: <a href="mailto:support@marketscannerpros.app">support@marketscannerpros.app</a></p>

          </div>
        </div>
      </div>
    </main>
  );
}
