import { redirect } from 'next/navigation';

/* V2 scanner pages have been merged into /tools/scanner.
   Redirect any stale bookmarks. */
export default function V2ScannerRedirect() {
  redirect('/tools/scanner');
}
