'use client';
import { usePathname } from 'next/navigation';
import { m2ResearchEnabled } from '@/lib/publicDesign';
import { useUserTier } from '@/lib/useUserTier';
import { isPaidTier } from '@/lib/tiers';
import Loading from './Loading';
import LockedPreview from './LockedPreview';
import { FREE_COPY } from './copy';
export default function IntelligenceGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { tier, isAdmin, isLoading, isLoggedIn } = useUserTier();
  if (isLoading) return <Loading />;
  if (m2ResearchEnabled() && pathname === '/intelligence/global-m2' && isLoggedIn) return <>{children}</>;
  if (!isAdmin && !isPaidTier(tier)) return <LockedPreview tool={FREE_COPY.deepMacro} description={FREE_COPY.deepDescription} />;
  return <>{children}</>;
}
