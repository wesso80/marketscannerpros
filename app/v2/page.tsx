import { redirect } from 'next/navigation';

/* V2 pages have been merged into V1 (/tools/*).
   Redirect any stale bookmarks. */
export default function V2Landing() {
  redirect('/tools/markets');
}
