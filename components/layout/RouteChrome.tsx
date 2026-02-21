'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import CookieBanner from '@/components/CookieBanner';
import AlertToast from '@/components/AlertToast';
import BackToTop from '@/components/BackToTop';

const TERMINAL_ROUTE_PREFIXES = [
  '/tools',
];

type RouteChromeProps = {
  children: ReactNode;
};

export default function RouteChrome({ children }: RouteChromeProps) {
  const pathname = usePathname() || '';
  const isTerminalRoute = TERMINAL_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  return (
    <>
      {!isTerminalRoute ? <Header /> : null}
      <main className="msp-main-shell">{children}</main>
      {!isTerminalRoute ? <Footer /> : null}
      {!isTerminalRoute ? <CookieBanner /> : null}
      <AlertToast />
      {!isTerminalRoute ? <BackToTop /> : null}
    </>
  );
}
