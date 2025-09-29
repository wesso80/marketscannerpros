import "./globals.css";
import BackToTop from "../components/BackToTop";
import Footer from "../components/Footer";
import AnalyticsLoader from "../components/AnalyticsLoader";
import CookieBanner from "../components/CookieBanner";

export const metadata = { title: "MarketScanner Pros" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <div
            className="container"
            style={{ display: "flex", alignItems: "center", gap: "1rem" }}
          >
            <a className="title" href="/">
              MarketScanner<span style={{ color: "#34d399" }}>Pros</span>
            </a>
            <nav className="nav">
              <a href="/guide">User Guide</a>
              <a href="/disclaimer">Disclaimer</a>
              <a href="/pricing">Pricing</a>
              <a href="/privacy">Privacy</a>
              <a href="/legal/terms">Terms</a>

              <a href="/contact">Contact</a>
              <a href="/signin">Sign in</a>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
        <Footer />
        <CookieBanner />
        <AnalyticsLoader />
        <BackToTop />
      </body>
    </html>
  );
}
