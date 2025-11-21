import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy — MarketScanner Pros",
  description: "Refund and cancellation policy for MarketScanner Pros subscriptions.",
  alternates: { canonical: "/refund-policy" },
  robots: { index: true, follow: true }
};

const effective = "7 October 2025";

export default function RefundPolicyPage() {
  return (
    <main className="prose prose-invert mx-auto max-w-3xl px-4 py-10">
      <h1>Refund Policy</h1>
      <p><strong>Effective Date:</strong> {effective}</p>

      <h2>Overview</h2>
      <p>
        This Refund Policy explains our policy regarding refunds, cancellations, and subscription 
        management for MarketScanner Pros ("the App", "we", "our", "us").
      </p>

      <h2>Free Trial Period</h2>
      <ul>
        <li><strong>Pro Plan:</strong> 7-day free trial</li>
        <li><strong>Pro Trader Plan:</strong> 5-day free trial</li>
        <li>You will not be charged during the trial period.</li>
        <li>Cancel anytime during the trial to avoid charges.</li>
        <li>One trial per email address per plan (see Trial Abuse Prevention below).</li>
      </ul>

      <h2>Subscription Billing</h2>
      <ul>
        <li>After your trial ends, you will be charged the monthly subscription fee automatically.</li>
        <li>Subscriptions renew monthly until cancelled.</li>
        <li>Cancellations take effect at the end of the current billing period.</li>
      </ul>

      <h2>Refund Policy</h2>
      <p><strong>No Pro-Rated Refunds:</strong></p>
      <ul>
        <li>We do <strong>not</strong> provide refunds or credits for partial months of service.</li>
        <li>When you cancel, you retain access until the end of your current billing period.</li>
        <li>No refunds are given for unused time after cancellation.</li>
      </ul>

      <p><strong>Exceptions:</strong></p>
      <ul>
        <li><strong>Billing Errors:</strong> If you were charged incorrectly due to a system error, contact us immediately at <a href="mailto:support@marketscannerpros.app">support@marketscannerpros.app</a> with proof of the error.</li>
        <li><strong>Unauthorized Charges:</strong> If you believe you were charged without authorization, contact us within 48 hours of the charge.</li>
        <li><strong>Technical Issues:</strong> If the App was unavailable for 3+ consecutive days during your billing period, you may be eligible for a pro-rated credit.</li>
      </ul>

      <h2>Trial Abuse Prevention</h2>
      <ul>
        <li>Each email address is eligible for <strong>one free trial per plan</strong>.</li>
        <li>Attempting to circumvent trial limitations (using multiple emails, accounts, or devices) is prohibited.</li>
        <li>Violations may result in immediate subscription termination without refund.</li>
        <li>We track trial usage by email address and device to enforce this policy.</li>
      </ul>

      <h2>How to Cancel</h2>
      
      <h3>Web/Android Users (Stripe):</h3>
      <ol>
        <li>Log in to your account at <a href="https://app.marketscannerpros.app">app.marketscannerpros.app</a></li>
        <li>Go to Settings → Subscription Management</li>
        <li>Click "Manage Subscription" to open Stripe Customer Portal</li>
        <li>Click "Cancel Subscription"</li>
        <li>Your access continues until the end of the current billing period</li>
      </ol>

      <h3>iOS Users (Apple In-App Purchase):</h3>
      <ol>
        <li>Open Settings on your iPhone/iPad</li>
        <li>Tap your name at the top</li>
        <li>Tap "Subscriptions"</li>
        <li>Select "MarketScanner Pros"</li>
        <li>Tap "Cancel Subscription"</li>
      </ol>

      <h2>Platform-Specific Policies</h2>
      <ul>
        <li><strong>Stripe (Web/Android):</strong> Managed through Stripe Customer Portal. Refunds handled per this policy.</li>
        <li><strong>Apple (iOS):</strong> Managed through Apple App Store. Apple's refund policy applies. Request refunds through Apple, not us.</li>
      </ul>

      <h2>Contact for Billing Issues</h2>
      <p>
        For billing questions, errors, or refund requests (subject to this policy), contact us:
        <br />📧 <a href="mailto:support@marketscannerpros.app">support@marketscannerpros.app</a>
      </p>
      <p>Please include:</p>
      <ul>
        <li>Your email address used for subscription</li>
        <li>Transaction date and amount</li>
        <li>Description of the issue</li>
        <li>Screenshots if applicable</li>
      </ul>

      <h2>Changes to This Policy</h2>
      <p>
        We may update this Refund Policy from time to time. Changes will be posted on this page 
        with a revised effective date. Continued use of the App after changes constitutes acceptance.
      </p>

      <h2>Agreement</h2>
      <p>
        By subscribing to MarketScanner Pros, you acknowledge that you have read, understood, and 
        agree to this Refund Policy.
      </p>
    </main>
  );
}
