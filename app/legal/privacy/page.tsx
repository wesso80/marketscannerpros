import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — MarketScanner Pros",
  description:
    "How MarketScanner Pros collects, uses, and protects your information. Your rights and choices explained.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/privacy" }
};

const lastUpdated = "26 September 2025";

console.log(">> Rendering PrivacyPage");
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm opacity-80">Last updated: {lastUpdated}</p>

      <div className="prose prose-invert mt-8">
        <p>
          MarketScanner Pros (“we”, “us”, “our”) provides educational market tools. This
          Privacy Policy explains what we collect, how we use it, and the choices you
          have. By using the app or website, you agree to this Policy.
        </p>

        <h2>Key Points</h2>
        <ul>
          <li>No financial advice. We provide tools only.</li>
          <li>We minimise personal data and keep it only as long as needed.</li>
          <li>You can request access, correction, or deletion at any time.</li>
        </ul>

        <h2>Who we are</h2>
        <p>
          MarketScanner Pros<br />
          Website: <a href="https://marketscannerpros.app">marketscannerpros.app</a><br />
          Contact: <a href="mailto:support@marketscannerpros.app">support@marketscannerpros.app</a>
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li><strong>Account &amp; Contact</strong> (if you sign up): name, email.</li>
          <li><strong>Purchase Data</strong>: subscription plan/status (no card numbers).</li>
          <li><strong>Usage</strong>: interactions, device type, crash logs, diagnostics.</li>
          <li><strong>Cookies</strong>: essential session cookies; optional analytics (see below).</li>
        </ul>

        <h2>How we use your information</h2>
        <ul>
          <li>Provide and improve features.</li>
          <li>Manage subscriptions, billing, and support.</li>
          <li>Security, fraud prevention, debugging.</li>
          <li>Legal compliance and enforcing Terms.</li>
        </ul>

        <h2>Payments</h2>
        <p>
          Payments may be handled by Apple, Google, or Stripe. They process card data; we
          don’t receive full card details.
        </p>

        <h2>Analytics &amp; Cookies</h2>
        <p>
          Essential cookies power login and sessions. If we use analytics, it’s
          privacy-respecting and, where required, based on your consent.
        </p>

        <h2>Sharing</h2>
        <p>
          We use service providers (hosting, error monitoring, email). They’re bound by
          confidentiality and security obligations. We don’t sell personal data.
        </p>

        <h2>International transfers</h2>
        <p>
          Data may be processed outside your region with appropriate safeguards (e.g.,
          standard contractual clauses).
        </p>

        <h2>Data retention</h2>
        <p>
          We keep personal data only as long as necessary, then delete or anonymise it.
        </p>

        <h2>Your rights</h2>
        <ul>
          <li>Access, correction, deletion.</li>
          <li>Object/restrict certain processing.</li>
          <li>Portability (where applicable).</li>
          <li>Withdraw consent at any time.</li>
        </ul>
        <p>
          Contact: <a href="mailto:support@marketscannerpros.app">support@marketscannerpros.app</a>
        </p>

        <h2>Children</h2>
        <p>Not directed to children under 16. We delete such data if discovered.</p>

        <h2>Security</h2>
        <p>We use appropriate administrative, technical, and organisational measures.</p>

        <h2>Region-specific</h2>
        <p>
          <strong>Australia:</strong> We follow the Privacy Act 1988 (Cth) and APPs.
          <br />
          <strong>EU/UK:</strong> Legal bases include contract, legitimate interests,
          consent, and legal obligations.
          <br />
          <strong>California:</strong> We don’t “sell” personal information (CCPA/CPRA).
        </p>

        <h2>Changes</h2>
        <p>
          We may update this Policy; the “Last updated” date will change and we’ll give
          additional notice if changes are material.
        </p>
      </div>
    </main>
  );
}
