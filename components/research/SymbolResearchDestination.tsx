'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useUserTier, canAccessUnlimitedScanning } from '@/lib/useUserTier';
import studio from '@/components/public-design/FindSymbolsStudio.module.css';
import FreeLoading from '@/components/free/Loading';

const FindSymbols = dynamic(() => import('@/components/scanner/FindSymbols'), { loading: () => <FreeLoading /> });
const FreeScannerModes = dynamic(() => import('@/components/scanner/FreeScannerModes'), { loading: () => <FreeLoading /> });

function Discovery() {
  const { tier, isAdmin, isLoading } = useUserTier();
  if (isLoading) return <FreeLoading />;
  // The retained admin Scanner uses its existing private response and controls.
  if (isAdmin) return <p className="p-4"><Link className="underline" href="/tools/scanner">Open admin Scanner</Link></p>;
  return canAccessUnlimitedScanning(tier) ? <FindSymbols /> : <FreeScannerModes />;
}

/** Selecting discovery does not mount report hooks or spend a Symbol report. */
export default function SymbolResearchDestination({ children }: { children: ReactNode }) {
  const search = useSearchParams();
  const finding = search.get('view') === 'find';
  const report = new URLSearchParams(search.toString()); report.delete('view');
  const find = new URLSearchParams(report); find.set('view', 'find');
  const reportHref = `/tools/golden-egg${report.size ? `?${report}` : ''}`;
  return <div>
    <nav aria-label="Symbol research navigation" className={studio.navigation}>
      <Link href={reportHref} aria-current={!finding ? 'page' : undefined} >Symbol report</Link>
      <Link href={`/tools/golden-egg?${find}`} aria-current={finding ? 'page' : undefined} >Find symbols</Link>
    </nav>
    {finding ? <Discovery /> : children}
  </div>;
}
