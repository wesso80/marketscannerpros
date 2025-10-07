'use client';
import React,{Suspense} from 'react';
import SessionBadge from '@/components/SessionBadge';
import PortalButton from '@/components/PortalButton';
import DashboardInner from './DashboardInner';

export const dynamic = 'force-dynamic';

export default function DashboardPage(){
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <SessionBadge/>
      </div>
      <Suspense fallback={null}><DashboardInner/></Suspense>
      <PortalButton/>
    </main>
  );
}
