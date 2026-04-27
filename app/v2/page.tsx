import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Markets Cockpit',
  alternates: { canonical: '/tools/markets' },
  robots: { index: false, follow: true },
};

/* V2 pages have been merged into V1 (/tools/*).
   Redirect any stale bookmarks. */
export default function V2Landing() {
  redirect('/tools/markets');
}
