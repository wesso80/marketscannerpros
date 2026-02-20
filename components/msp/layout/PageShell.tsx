import type { ReactNode } from 'react';

type PageShellProps = {
  children: ReactNode;
};

export default function PageShell({ children }: PageShellProps) {
  return <div className="mx-auto w-full max-w-[1248px] space-y-8 px-4 py-6 lg:px-6">{children}</div>;
}
