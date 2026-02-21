import { ReactNode } from 'react';

export default function TimeScannerShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[var(--msp-bg)] text-slate-100">{children}</div>;
}
