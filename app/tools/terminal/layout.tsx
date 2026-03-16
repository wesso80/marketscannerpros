import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trade Terminal',
  description: 'Close calendar, options chain, crypto derivatives, and capital flow analysis.',
};

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
