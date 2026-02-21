import { Suspense } from 'react';
import TimeScannerPage from '@/components/time/TimeScannerPage';

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--msp-bg)]" />}>
      <TimeScannerPage />
    </Suspense>
  );
}
