'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PortalButton from "@/components/PortalButton";

function DashboardContent() {
  const searchParams = useSearchParams();
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('');
  
  useEffect(() => {
    const success = searchParams.get('success');
    if (success === 'true') {
      // User just completed Stripe checkout successfully
      setSubscriptionStatus('✅ Payment successful! Your Pro subscription is now active.');
      
      // Optional: Call API to ensure subscription is recorded
      fetch('/api/subscription/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'active',
          planType: 'pro', // Default to Pro, could be determined from URL params
          customerEmail: 'user@example.com' // Would get from session in real app
        })
      }).catch(console.error);
    }
  }, [searchParams]);

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      
      {subscriptionStatus && (
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
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2">Market Scans</h3>
          <p className="text-gray-600">Your automated market scanning results will appear here.</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2">Watchlists</h3>
          <p className="text-gray-600">Manage your custom watchlists and alerts.</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2">Analytics</h3>
          <p className="text-gray-600">View your trading performance and insights.</p>
        </div>
      </div>
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
