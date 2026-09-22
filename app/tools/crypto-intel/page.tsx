import { redirect } from 'next/navigation';
export default async function CryptoIntelPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const input = await searchParams;
  const params = new URLSearchParams({ tab: 'crypto-intel' });
  for (const key of ['symbol', 'type', 'timeframe']) if (typeof input[key] === 'string') params.set(key, input[key]);
  redirect(`/tools/explorer?${params}`);
}
