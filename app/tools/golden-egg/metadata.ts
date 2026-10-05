import type { Metadata } from 'next';
import { symbolFromSearchParams, symbolShareMetadata } from '@/lib/og/linkPreview';

type Search = { symbol?: string | string[] };

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const params = await searchParams;
  return symbolShareMetadata(symbolFromSearchParams(params));
}
