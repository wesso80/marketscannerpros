import "./globals.css";
import BackToTop from "../components/BackToTop";
import Footer from "../components/Footer";
import AnalyticsLoader from "../components/AnalyticsLoader";
import CookieBanner from "../components/CookieBanner";
import MobileNav from "../components/MobileNav";

export const metadata = { 
  title: "MarketScanner Pros",
  viewport: "width=device-width, initial-scale=1, maximum-scale=5"
};
import { APP_URL } from 'lib/appUrl';
import AppUrlFixer from "@/components/AppUrlFixer";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased overflow-x-hidden">
      <AppUrlFixer />
        <header className="header">
          <div className="container flex items-center justify-between py-4">
            <a className="text-xl md:text-2xl font-bold whitespace-nowrap" href="/">
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
