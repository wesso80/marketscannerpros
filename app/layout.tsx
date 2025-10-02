import "./globals.css";
import BackToTop from "../components/BackToTop";
import Footer from "../components/Footer";
import AnalyticsLoader from "../components/AnalyticsLoader";
import CookieBanner from "../components/CookieBanner";
import MobileNav from "../components/MobileNav";

export const metadata = { title: "MarketScanner Pros" };
import { APP_URL } from 'lib/appUrl';
import AppUrlFixer from "@/components/AppUrlFixer";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
      <AppUrlFixer />
        <header className="header">
          <div
            className="container"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}
          >
            <a className="title" href="/">
              MarketScanner<span style={{ color: "#34d399" }}>Pros</span>
            </a>
            <MobileNav />
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
