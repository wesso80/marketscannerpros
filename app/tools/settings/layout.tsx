import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings | MarketScanner Pros',
  description:
    'Configure your MarketScanner Pros workspace settings, preferences, and display options.',
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
