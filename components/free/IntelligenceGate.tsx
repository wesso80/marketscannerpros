'use client';
import { useUserTier } from '@/lib/useUserTier';
import { isPaidTier } from '@/lib/tiers';
import Loading from './Loading';
import LockedPreview from './LockedPreview';
import { FREE_COPY } from './copy';
export default function IntelligenceGate({ children }: { children: React.ReactNode }) {
  const { tier, isAdmin, isLoading } = useUserTier();
  if (isLoading) return <Loading />;
  if (!isAdmin && !isPaidTier(tier)) return <LockedPreview tool={FREE_COPY.deepMacro} description={FREE_COPY.deepDescription} />;
  return <>{children}</>;
}
