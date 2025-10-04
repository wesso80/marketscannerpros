import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AnalyticsLoader from '@/components/AnalyticsLoader';
import CookieBanner from '@/components/CookieBanner';
import BackToTop from '@/components/BackToTop';
import AppUrlFixer from '@/components/AppUrlFixer';

export const metadata = {
  title: 'MarketScanner Pros',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body className="min-h-screen overflow-x-hidden bg-neutral-950 text-neutral-100 antialiased">
        <AppUrlFixer />
        <Header />

        {/* Reserve vertical space for the fixed header */}
        <div className="h-16" />

        {/* Main content */}
        <main>{children}</main>

        <Footer />
        <CookieBanner />
        <AnalyticsLoader />
        <BackToTop />
      </body>
    </html>
  );
}
