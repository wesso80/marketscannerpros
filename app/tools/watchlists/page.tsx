import { redirect } from 'next/navigation';

export default function WatchlistsRedirect() {
  redirect('/tools/workspace?tab=watchlists');
}
