'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect to the Crypto Command Center heatmap view
export default function CryptoHeatmapPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/tools/crypto?section=heatmap');
  }, [router]);

  return (
    <main className="min-h-screen bg-[var(--msp-bg)] flex items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-14 w-14 overflow-hidden rounded-lg animate-pulse"><img src="/assets/platform-tools/crypto-heatmap.png" alt="Crypto Heatmap" className="h-full w-full object-contain p-1" /></div>
        <p className="text-slate-400">Redirecting to Crypto Command Center...</p>
      </div>
    </main>
  );
}
