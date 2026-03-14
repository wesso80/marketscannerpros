'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   MSP v2 — Landing Page
   Redirects to /v2/dashboard (the default surface).
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function V2Landing() {
  const router = useRouter();
  useEffect(() => { router.replace('/v2/dashboard'); }, [router]);

  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
    </div>
  );
}
