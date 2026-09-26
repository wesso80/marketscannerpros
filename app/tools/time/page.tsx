import { redirect } from 'next/navigation';

/**
 * /tools/time had no page, so Journal "Open Time Context", "Time Snapshot Context" and
 * Evidence "Time" links (/tools/time?symbol=...) returned 404 (TR-33). Send them to the
 * Time Confluence tab of the Terminal for the same symbol, like the other retired tool
 * routes do.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams({ tab: 'time-confluence' });
  for (const key of ['symbol', 'type', 'timeframe']) {
    const value = params[key];
    if (typeof value === 'string' && value.trim()) query.set(key, value.trim());
  }
  redirect(`/tools/terminal?${query.toString()}`);
}
