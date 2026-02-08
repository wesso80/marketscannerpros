'use client';
import { getSessionFromCookie } from "@/lib/auth";
import React,{Suspense} from 'react';
import ProCta from '@/components/ProCta';
import SessionBadge from '@/components/SessionBadge';
import PortalButton from '@/components/PortalButton';
import DashboardInner from './DashboardInner';
import DailyAIMarketFocus from '@/components/DailyAIMarketFocus';
import FearGreedHistory from '@/components/FearGreedHistory';
import TimeConfluenceWidget from '@/components/TimeConfluenceWidget';
import TrendingCoinsWidget from '@/components/TrendingCoinsWidget';
import TopMoversWidget from '@/components/TopMoversWidget';

export const dynamic = 'force-dynamic';

export default function DashboardPage(){
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-3xl font-bold">Dashboard</h1>
<ProCta />
        <SessionBadge/>
      </div>
      <Suspense fallback={null}><DashboardInner/></Suspense>
      
      {/* Crypto Market Pulse - Trending & Movers */}
      <div className="my-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TrendingCoinsWidget />
        <TopMoversWidget />
      </div>
      
      {/* Time Confluence Quick Status */}
      <div className="my-4">
        <TimeConfluenceWidget compact={true} />
      </div>
      
      {/* Fear & Greed Historical Chart */}
      <div className="my-6 max-w-2xl">
        <FearGreedHistory days={14} height={220} />
      </div>
      
      <Suspense fallback={null}>
        {/* Daily AI Market Focus Panel */}
        <div className="my-8">
          <DailyAIMarketFocus />
        </div>
      </Suspense>
      <PortalButton/>
    </main>
  );
}
