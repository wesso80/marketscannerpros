'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import CookieBanner from '@/components/CookieBanner';
import AlertToast from '@/components/AlertToast';
import BackToTop from '@/components/BackToTop';

type RouteChromeProps = {
  children: ReactNode;
};

export default function RouteChrome({ children }: RouteChromeProps) {
  const pathname = usePathname() || '';
  const isOperatorRoute = pathname.startsWith('/operator');
  const isAppRoute = pathname.startsWith('/tools') || isOperatorRoute;

  return (
    <>
      {!isOperatorRoute && <Header />}
      <main className="msp-main-shell">{children}</main>
      {!isAppRoute ? <Footer /> : null}
      {!isAppRoute ? <CookieBanner /> : null}
      <AlertToast />
      {!isAppRoute ? <BackToTop /> : null}
    </>
  );
}
