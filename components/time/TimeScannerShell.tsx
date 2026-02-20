import { ReactNode } from 'react';

export default function TimeScannerShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#060b14] text-slate-100">{children}</div>;
}
