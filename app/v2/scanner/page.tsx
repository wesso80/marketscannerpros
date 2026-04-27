import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Market Scanner',
  alternates: { canonical: '/tools/scanner' },
  robots: { index: false, follow: true },
};

/* V2 scanner pages have been merged into /tools/scanner.
   Redirect any stale bookmarks. */
export default function V2ScannerRedirect() {
  redirect('/tools/scanner');
}
