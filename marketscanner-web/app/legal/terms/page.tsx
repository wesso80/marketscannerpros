import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — MarketScanner Pros",
  description: "Terms of Service for MarketScanner Pros.",
  // If your route is /legal/terms keep this canonical as /legal/terms
  // Or switch to "/terms" only if you also create an alias at /terms (see note below).
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true }
};

const effective = "26 September 2025";

export default function TermsPage() {
  return (
    <main>
      <h1>Terms of Service — MarketScanner Pros</h1>
      <p><strong>Effective Date:</strong> {effective}</p>

      <p>
        Welcome to MarketScanner Pros (“the App”, “we”, “our”, “us”). By accessing or using the
        App, you agree to these Terms of Service. Please read them carefully.
      </p>

      <nav
        aria-label="On this page"
        style={{ margin: "1rem 0", padding: ".75rem 1rem", border: "1px solid #27272a", borderRadius: ".75rem" }}
      >
        <strong style={{ display: "block", marginBottom: ".25rem" }}>On this page</strong>
        <a href="#eligibility">Eligibility</a> · <a href="#use">Use</a> · <a href="#billing">Subscriptions</a> ·{" "}
        <a href="#ip">IP</a> · <a href="#warranty">Warranties</a> · <a href="#liability">Liability</a> ·{" "}
        <a href="#privacy">Privacy</a> · <a href="#termination">Termination</a> ·{" "}
        <a href="#changes">Changes</a> · <a href="#contact">Contact</a>
      </nav>

      <h2 id="eligibility">1. Eligibility</h2>
      <p>You must be at least 16 years old to use the App. By using it, you confirm that you meet this requirement.</p>

      <h2 id="use">2. Use of the App</h2>
      <ul>
        <li>The App is provided for educational purposes only.</li>
        <li><strong>We do not provide financial, investment, or trading advice.</strong></li>
        <li>You are solely responsible for your trading and investment decisions.</li>
      </ul>

      <h2 id="billing">3. Subscriptions &amp; Billing</h2>
      <ul>
        <li>The App offers Free, Pro ($4.99/mo), and Full Pro Trader ($9.99/mo) plans.</li>
        <li>Payments are processed securely via platform providers (Apple, Google) or Stripe.</li>
        <li>Subscriptions renew automatically until cancelled through your account or app store settings.</li>
        <li>We do not provide pro-rated refunds for unused time after cancellation.</li>
      </ul>

      <h2 id="ip">4. Intellectual Property</h2>
      <p>
        All content, features, and code within the App are owned by MarketScanner Pros. You may not
        copy, modify, distribute, or resell without prior written permission.
      </p>

      <h2 id="warranty">5. Disclaimer of Warranties</h2>
      <p>
        The App is provided “as is” without warranties of any kind. We do not guarantee accuracy,
        completeness, or uninterrupted access.
      </p>

      <h2 id="liability">6. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, MarketScanner Pros shall not be liable for any losses
        or damages arising from use of the App, including but not limited to trading losses.
      </p>

      <h2 id="privacy">7. Privacy</h2>
      <p>Our use of your data is governed by our <a href="/privacy">Privacy Policy</a>.</p>

      <h2 id="termination">8. Termination</h2>
      <p>We may suspend or terminate your access if you violate these Terms. You may stop using the App at any time.</p>

      <h2 id="changes">9. Changes</h2>
      <p>We may update these Terms occasionally. Changes will be posted on this page with a revised effective date.</p>

      <h2 id="contact">10. Contact</h2>
      <p>
        For questions, please email us at:
        <br />📧 <a href="mailto:support@marketscannerpros.app">support@marketscannerpros.app</a>
      </p>
    </main>
  );
}
