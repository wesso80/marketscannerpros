'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import CookieBanner from '@/components/CookieBanner';
import AlertToast from '@/components/AlertToast';
import BackToTop from '@/components/BackToTop';
import ModeAwareLayout from './ModeAwareLayout';

/**
 * Routes that use the sidebar layout instead of the top Header.
 * These are the "app" routes; marketing pages keep the full header/footer.
 */
const SIDEBAR_ROUTE_PREFIXES = ['/tools', '/operator', '/dashboard'];

const TERMINAL_ROUTE_PREFIXES = ['/tools'];

type RouteChromeProps = {
  children: ReactNode;
};

export default function RouteChrome({ children }: RouteChromeProps) {
  const pathname = usePathname() || '';
  const isTerminalRoute = TERMINAL_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isSidebarRoute = SIDEBAR_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  // App routes: sidebar layout replaces Header entirely
  if (isSidebarRoute) {
    return (
      <>
        <ModeAwareLayout>{children}</ModeAwareLayout>
        <AlertToast />
      </>
    );
  }

  // Marketing / public routes: normal Header + Footer
  return (
    <>
      <Header />
      <main className="msp-main-shell">{children}</main>
      {!isTerminalRoute ? <Footer /> : null}
      {!isTerminalRoute ? <CookieBanner /> : null}
      <AlertToast />
      {!isTerminalRoute ? <BackToTop /> : null}
    </>
  );
}
