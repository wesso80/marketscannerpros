'use client';
import { useEffect } from 'react';

/** Keep a selected client tab's title after streamed route metadata settles. */
export function useDocumentTitle(name: string) {
  useEffect(() => {
    const title = `${name} | MarketScanner Pros`;
    const update = () => { if (document.title !== title) document.title = title; };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [name]);
}
