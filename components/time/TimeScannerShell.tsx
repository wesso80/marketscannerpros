import { ReactNode } from 'react';

export default function TimeScannerShell({ children, embedded = false }: { children: ReactNode; embedded?: boolean }) {
  return <div className={`${embedded ? '' : 'min-h-screen'} bg-[var(--msp-bg)] text-slate-100`}>{children}</div>;
}
