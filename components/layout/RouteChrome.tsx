'use client';

import { ReactNode, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { publicDesignScope } from '@/lib/publicDesign';
const PublicDesignShell = dynamic(() => import('@/components/public-design/PublicDesignShell'));
import { usePathname } from 'next/navigation';
import CookieBanner from '@/components/CookieBanner';
import AlertToast from '@/components/AlertToast';

type RouteChromeProps = {
  children: ReactNode;
};

export default function RouteChrome({ children }: RouteChromeProps) {
  const pathname = usePathname() || '';
  const designScope = publicDesignScope(pathname);
  if (designScope) return <>
    <main className="msp-main-shell"><Suspense fallback={<div role="status">Loading research workspace…</div>}><PublicDesignShell workspace={designScope === 'workspace'}>{children}</PublicDesignShell></Suspense></main>
    <CookieBanner/><AlertToast/>
  </>;

  return (
    <>
      <main className="msp-main-shell">{children}</main>
      <CookieBanner />
      <AlertToast />
    </>
  );
}
