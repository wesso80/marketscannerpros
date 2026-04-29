import { redirect } from 'next/navigation';

export default function EarningsCalendarLegacyRoute() {
  redirect('/tools/research?tab=earnings');
}
