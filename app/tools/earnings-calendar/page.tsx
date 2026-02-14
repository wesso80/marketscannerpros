import { redirect } from 'next/navigation';

export default function EarningsCalendarLegacyRoute() {
  redirect('/tools/news?tab=earnings');
}
