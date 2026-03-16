import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Workspace',
  description: 'Watchlists, trade journal, portfolio tracker, alerts, and account settings.',
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
