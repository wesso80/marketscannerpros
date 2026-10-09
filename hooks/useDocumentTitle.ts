'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/** Keep a selected client tab's title after streamed route metadata settles. */
export function useDocumentTitle(name: string) {
  const pathname = usePathname();
  // Lock to the route that first mounted this hook. Navigation can update the
  // URL, and even this hook's pathname, before the page unmounts.
  const ownedPath = useRef<string | null>(null);
  if (ownedPath.current === null && pathname) ownedPath.current = pathname;

  useEffect(() => {
    const route = ownedPath.current;
    if (!route || (pathname && pathname !== route) || window.location.pathname !== route) return;
    const title = `${name} | MarketScannerPros`;
    const update = () => {
      if (window.location.pathname !== route) return;
      if (document.title !== title) document.title = title;
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [name, pathname]);
}
