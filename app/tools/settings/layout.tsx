import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Account settings',
  description:
    'Configure your MarketScanner Pros workspace settings, preferences, and display options.',
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
