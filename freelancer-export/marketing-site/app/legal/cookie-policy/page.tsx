import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy — MarketScanner Pros",
  description: "How MarketScanner Pros uses cookies and similar tracking technologies.",
  alternates: { canonical: "/cookie-policy" },
  robots: { index: true, follow: true }
};

const effective = "7 October 2025";

export default function CookiePolicyPage() {
  return (
    <main className="prose prose-invert mx-auto max-w-3xl px-4 py-10">
      <h1>Cookie Policy</h1>
      <p><strong>Effective Date:</strong> {effective}</p>

      <h2>Overview</h2>
      <p>
        MarketScanner Pros ("we", "us", "our") uses cookies and similar tracking technologies to 
        provide, secure, and improve our services. This Cookie Policy explains what these technologies 
        are, how we use them, and your choices.
      </p>

      <h2>What Are Cookies?</h2>
      <p>
        Cookies are small text files stored on your device (computer, phone, or tablet) when you visit 
        a website. They help websites remember your preferences, authenticate your identity, and track 
        usage patterns.
      </p>

      <h2>Cookies We Use</h2>

      <h3>1. Essential Cookies (Required)</h3>
      <p>These cookies are necessary for the App to function. They cannot be disabled.</p>
      <ul>
        <li><strong>Workspace ID Cookie:</strong> Tracks your unique device/session identifier to maintain your subscription, settings, and data across visits.</li>
        <li><strong>Authentication Cookies:</strong> Keeps you logged in and secures access to your account.</li>
        <li><strong>Session Cookies:</strong> Manages your active session and temporary preferences.</li>
        <li><strong>Security Tokens:</strong> CSRF protection and request validation for security.</li>
      </ul>

      <h3>2. Fraud Prevention & Trial Tracking</h3>
      <p>These cookies help prevent abuse and trial fraud:</p>
      <ul>
        <li><strong>Trial Usage Tracking:</strong> Records trial usage by device to enforce "one trial per email" policy.</li>
        <li><strong>Device Fingerprinting:</strong> Creates anonymous device signatures to detect repeat trial attempts.</li>
        <li><strong>Rate Limiting Tokens:</strong> Prevents API abuse and protects server resources.</li>
      </ul>

      <h3>3. Analytics & Performance (Optional)</h3>
      <p>These help us understand how users interact with the App:</p>
      <ul>
        <li><strong>Error Tracking (Sentry):</strong> Captures errors and performance metrics to improve reliability.</li>
        <li><strong>Usage Analytics:</strong> Tracks feature usage to prioritize improvements (anonymized).</li>
      </ul>

      <h2>Third-Party Cookies</h2>
      <p>Some features require third-party services that may set their own cookies:</p>
      <ul>
        <li><strong>Stripe:</strong> Payment processing and subscription management (required for checkout).</li>
        <li><strong>Apple:</strong> In-App Purchase processing on iOS devices (required for iOS subscriptions).</li>
        <li><strong>Sentry:</strong> Error monitoring and performance tracking.</li>
      </ul>
      <p>
        These third parties have their own cookie policies. We recommend reviewing:
      </p>
      <ul>
        <li><a href="https://stripe.com/privacy" target="_blank" rel="noopener">Stripe Privacy Policy</a></li>
        <li><a href="https://www.apple.com/legal/privacy/" target="_blank" rel="noopener">Apple Privacy Policy</a></li>
        <li><a href="https://sentry.io/privacy/" target="_blank" rel="noopener">Sentry Privacy Policy</a></li>
      </ul>

      <h2>Local Storage & Similar Technologies</h2>
      <p>In addition to cookies, we use browser storage technologies:</p>
      <ul>
        <li><strong>Local Storage:</strong> Saves user preferences (theme, chart settings, watchlists).</li>
        <li><strong>Session Storage:</strong> Temporary data that clears when you close your browser.</li>
        <li><strong>IndexedDB:</strong> Stores larger datasets for offline functionality and performance.</li>
      </ul>

      <h2>Why We Use Cookies</h2>
      <p>We use cookies and tracking technologies to:</p>
      <ul>
        <li>Authenticate your account and maintain secure sessions</li>
        <li>Remember your preferences and settings</li>
        <li>Track your subscription tier and workspace across devices</li>
        <li>Prevent trial abuse and fraud (one trial per email enforcement)</li>
        <li>Protect against unauthorized access and API abuse</li>
        <li>Monitor performance and fix errors</li>
        <li>Improve user experience and develop new features</li>
        <li>Comply with legal and security requirements</li>
      </ul>

      <h2>Cookie Duration</h2>
      <ul>
        <li><strong>Session Cookies:</strong> Deleted when you close your browser.</li>
        <li><strong>Workspace ID:</strong> Persistent (7 days), refreshed on each visit to maintain account continuity.</li>
        <li><strong>Trial Tracking:</strong> Persistent (indefinite) to prevent trial abuse.</li>
        <li><strong>Authentication:</strong> Persistent (7-30 days) unless you log out.</li>
        <li><strong>Analytics:</strong> Typically 1-2 years for trend analysis.</li>
      </ul>

      <h2>Your Choices</h2>

      <h3>Browser Controls</h3>
      <p>
        Most browsers let you control cookies through settings. You can:
      </p>
      <ul>
        <li>Block all cookies (may break essential App functionality)</li>
        <li>Delete existing cookies</li>
        <li>Block third-party cookies only</li>
        <li>Set cookies to delete when you close your browser</li>
      </ul>
      <p><strong>Warning:</strong> Blocking essential cookies will prevent the App from working properly, including authentication, subscription access, and data persistence.</p>

      <h3>Do Not Track (DNT)</h3>
      <p>
        We currently do not respond to "Do Not Track" browser signals because there is no universal 
        standard for how to interpret them. However, you can control tracking through your browser settings.
      </p>

      <h3>Opt-Out Options</h3>
      <ul>
        <li><strong>Analytics:</strong> You can disable analytics cookies in your browser settings (essential cookies remain).</li>
        <li><strong>Third-Party Cookies:</strong> Configure your browser to block third-party cookies from Stripe, Sentry, etc.</li>
      </ul>

      <h2>Mobile Apps</h2>
      <p>
        Our iOS and Android apps use similar tracking technologies through device identifiers and local 
        storage. You can manage these through your device settings:
      </p>
      <ul>
        <li><strong>iOS:</strong> Settings → Privacy & Security → Tracking</li>
        <li><strong>Android:</strong> Settings → Privacy → Ads → Delete advertising ID</li>
      </ul>

      <h2>International Users</h2>
      <p>
        If you're located in the EU/EEA, UK, or California, you have additional rights under GDPR and 
        CCPA. See our <a href="/privacy">Privacy Policy</a> for details on data rights.
      </p>

      <h2>Updates to This Policy</h2>
      <p>
        We may update this Cookie Policy to reflect changes in technology or legal requirements. 
        Changes will be posted with a new effective date. Continued use constitutes acceptance.
      </p>

      <h2>Contact Us</h2>
      <p>
        For questions about cookies or to exercise your data rights:
        <br />📧 <a href="mailto:support@marketscannerpros.app">support@marketscannerpros.app</a>
      </p>

      <h2>Related Policies</h2>
      <ul>
        <li><a href="/privacy">Privacy Policy</a></li>
        <li><a href="/terms">Terms of Service</a></li>
        <li><a href="/refund-policy">Refund Policy</a></li>
      </ul>
    </main>
  );
}
