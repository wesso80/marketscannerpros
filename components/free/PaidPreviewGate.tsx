'use client';
import { useUserTier } from '@/lib/useUserTier';
import { isPaidTier } from '@/lib/tiers';
import Loading from './Loading';
import LockedPreview from './LockedPreview';
/** Prevent mounting a paid tool's fetch hooks before entitlement is known. */
export default function PaidPreviewGate({ tool, children }: { tool: string; children: React.ReactNode }) {
  const { tier, isLoading, isAdmin } = useUserTier();
  if (isLoading) return <Loading />;
  return isAdmin || isPaidTier(tier) ? <>{children}</> : <LockedPreview tool={tool} />;
}
