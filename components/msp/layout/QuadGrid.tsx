import type { ReactNode } from 'react';

type QuadGridProps = {
  children: ReactNode;
};

export default function QuadGrid({ children }: QuadGridProps) {
  return <div className="grid grid-cols-12 gap-6">{children}</div>;
}
