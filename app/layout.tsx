import "./globals.css";
import BackToTop from "../components/BackToTop";
import Footer from "../components/Footer";
import AnalyticsLoader from "../components/AnalyticsLoader";
import CookieBanner from "../components/CookieBanner";
import Header from "../components/Header";

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
        <Header />
        <main>{children}</main>
        <Footer />
        <CookieBanner />
        <AnalyticsLoader />
        <BackToTop />
      </body>
    </html>
  );
}
