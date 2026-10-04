'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { FREE_COPY } from '@/components/free/copy';
import FreeLoading from '@/components/free/Loading';
import { useUserTier } from '@/lib/useUserTier';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import TabBar from '@/components/visual/TabBar';

const MacroDashboard = dynamic(() => import('@/app/tools/macro/page'), { ssr: false, loading: () => <div data-macro-skeleton className="space-y-3 py-6" aria-busy="true"><div className="h-24 animate-pulse rounded bg-white/5" /><div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded bg-white/5" />)}</div><p className="text-xs text-slate-500">Loading macro regime…</p></div> });
const FavoritesPanel = dynamic(() => import('@/components/FavoritesPanel'), { ssr: false, loading: () => <div className="h-48 bg-slate-800/30 rounded-xl animate-pulse" /> });

/** My Pages and Macro only. The retired desk tab opens Overview. */
export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get('tab') || '').toLowerCase();
  const { tier, isLoading: tierLoading } = useUserTier();
  const isPro = tier === 'pro' || tier === 'pro_trader';

  useEffect(() => {
    if (tab === 'command') router.replace('/tools/command-center');
  }, [tab, router]);

  if (tab === 'command') return <p>Opening Overview…</p>;
  if (tierLoading) return <FreeLoading />;

  const active = tab === 'macro' ? 'macro' : 'pages';
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <TabBar
        label="Dashboard lens"
        activeId={active}
        items={[
          { id: 'pages', label: 'My Pages', href: '/tools/dashboard?tab=pages' },
          { id: 'macro', label: 'Macro', href: '/tools/dashboard?tab=macro' },
        ]}
      />
      <p className="text-sm"><a href="/tools/crypto-dashboard">Crypto Derivatives</a></p>
      <ComplianceDisclaimer compact />
      {active === 'pages' && <FavoritesPanel embeddedInDashboard />}
      {active === 'macro' && (!isPro ? (
        <div>
          <div className="mb-3 rounded-lg border border-slate-700/30 bg-slate-800/50 px-3 py-2 text-center text-xs text-slate-400">
            <a className="inline-flex min-h-10 items-center underline" href="/tools/macro">{FREE_COPY.freeMacro}</a>
          </div>
          <MacroDashboard embeddedInDashboard />
        </div>
      ) : <MacroDashboard embeddedInDashboard />)}
    </div>
  );
}
