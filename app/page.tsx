'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserTier } from '@/lib/useUserTier';
import CommandHub from '@/components/home/CommandHub';

export default function HomePage() {
  const { isLoggedIn, isLoading } = useUserTier();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      router.replace('/tools/dashboard');
    }
  }, [isLoggedIn, isLoading, router]);

  if (isLoading || isLoggedIn) return null;

  return <CommandHub />;
}
