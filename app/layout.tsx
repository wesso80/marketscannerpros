import "./globals.css";
import AnalyticsLoader from "../components/AnalyticsLoader";
import ErrorBoundary from "../components/ErrorBoundary";
import OperatorHeartbeat from "../components/OperatorHeartbeat";
import { validateEnv } from "@/lib/env";
import { Suspense } from "react";
import RouteChrome from "@/components/layout/RouteChrome";

// Validate environment variables on the server. In Vercel/production we require
// all mandatory envs; locally we allow missing to avoid blocking builds.
if (typeof window === 'undefined') {
  const isVercel = process.env.VERCEL === '1';
  try {
    validateEnv({ allowMissing: !isVercel });
  } catch (error) {
    console.error(error);
  }
}

export const metadata = { 
  title: {
    default: "MarketScanner Pros - AI-Powered Market Analysis",
    template: "%s | MarketScanner Pros",
  },
  description: "Professional market scanning tool with AI analysis, technical indicators, and real-time alerts for stocks, crypto, and forex trading.",
  metadataBase: new URL('https://marketscannerpros.app'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://marketscannerpros.app',
    siteName: 'MarketScanner Pros',
    title: 'MarketScanner Pros - AI-Powered Market Analysis',
    description: 'Professional market scanning tool with AI analysis, technical indicators, and real-time alerts for stocks, crypto, and forex trading.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MarketScanner Pros',
    description: 'AI-powered market scanning for stocks, crypto, and forex.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};
import AppUrlFixer from "@/components/AppUrlFixer";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body className="min-h-screen antialiased overflow-x-hidden">
        <ErrorBoundary>
          <AppUrlFixer />
          <Suspense>
            <OperatorHeartbeat />
          </Suspense>
          <RouteChrome>{children}</RouteChrome>
          <Suspense>
            <AnalyticsLoader />
          </Suspense>
        </ErrorBoundary>
      </body>
    </html>
  );
}