import { ReactNode } from 'react';

export default function GEPlanGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">{children}</div>;
}
