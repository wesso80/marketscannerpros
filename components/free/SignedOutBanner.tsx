'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useUserTier } from '@/lib/useUserTier';
import { FREE_COPY } from './copy';
export default function SignedOutBanner() {
  const { isLoggedIn, isLoading } = useUserTier();
  const pathname = usePathname();
  const params = useSearchParams();
  if (isLoading || isLoggedIn) return null;
  const next = `${pathname}${params.toString() ? `?${params}` : ''}`;
  return <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm">{FREE_COPY.research}</p><Link className="inline-flex min-h-11 items-center rounded-lg border border-white/20 px-4" href={`/auth?next=${encodeURIComponent(next)}`}>{FREE_COPY.startFree}</Link></div>;
}
