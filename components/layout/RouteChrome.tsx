'use client';

import { ReactNode, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { publicDesignEnabled, publicDesignScope } from '@/lib/publicDesign';
const PublicDesignShell = dynamic(() => import('@/components/public-design/PublicDesignShell'));
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
  const isAdminRoute = pathname.startsWith('/admin');
  const isOperatorRoute = pathname.startsWith('/operator');
  const isV2Route = pathname.startsWith('/v2');
  const isAppRoute = pathname.startsWith('/tools') || isAdminRoute || isOperatorRoute;

  const designScope = publicDesignEnabled() ? publicDesignScope(pathname) : null;
  if (designScope) return <>
    <main className="msp-main-shell"><Suspense fallback={<div role="status">Loading research workspace…</div>}><PublicDesignShell workspace={designScope === 'workspace'}>{children}</PublicDesignShell></Suspense></main>
    <CookieBanner/><AlertToast/>
  </>;

  return (
    <>
      {!isAdminRoute && !isOperatorRoute && !isV2Route && <Header />}
      <main className="msp-main-shell">{children}</main>
      {!isAppRoute && !isV2Route ? <Footer /> : null}
      <CookieBanner />
      <AlertToast />
      {!isAppRoute && !isV2Route ? <BackToTop /> : null}
    </>
  );
}
