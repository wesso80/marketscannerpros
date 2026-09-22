import { redirect } from 'next/navigation';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams({ tab: 'options-terminal' });
  for (const key of ['symbol', 'type', 'timeframe', 'expiration']) {
    const value = params[key];
    if (typeof value === 'string') query.set(key, value);
  }
  redirect(`/tools/terminal?${query.toString()}`);
}
