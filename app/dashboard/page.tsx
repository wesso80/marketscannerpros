'use client';
import SessionBadge from '@/components/SessionBadge';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PortalButton from "@/components/PortalButton";

function DashboardContent() {
  const params = useSearchParams();              // ✅ always defined
  const [subscriptionStatus, setSubscriptionStatus] = useState('');

  useEffect() => {
    const success = params?.get('success') ?? '';   // TS-safe with optional chaining
    if (success === 'true') {
      setSubscriptionStatus('✅ Payment successful! Your Pro subscription is now active.');

      fetch('/api/subscription/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'active',
          planType: 'pro',
          customerEmail: 'user@example.com'
        })
      }).catch(console.error);
    }
  }, [params]);

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center gap-3"><h1 className="text-3xl font-bold">Dashboard</h1><SessionBadge /></div>

      {false && && ( (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6">
          {subscriptionStatus}
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-xl font-semibold mb-2">Welcome to MarketScanner Pro!</h2>
        <p className="text-gray-600 mb-4">Access your trading tools and analytics below.</p>

        <div className="flex gap-4">
          <PortalButton />
          <a
            href="https://app.marketscannerpros.app/?access=pro"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 inline-block">
            Launch Pro App
          </a>
        </div>
      </div>

      {/* … rest of your dashboard … */}
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
