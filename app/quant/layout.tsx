import type { Metadata } from 'next';

/**
 * /quant layout — Private operator terminal layout
 *
 * Minimal layout without the public header/footer.
 * Auth-gated at the API level (layout just provides structure).
 */

export const metadata: Metadata = {
  title: 'Quant Operator Console',
  description: 'Private educational operator console for internal MarketScanner Pros quant research observations.',
  alternates: { canonical: '/quant' },
  robots: { index: false, follow: false },
};

export default function QuantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-emerald-400 font-mono text-sm font-bold tracking-widest">
            MSP QUANT
          </span>
          <span className="text-gray-600 text-xs">|</span>
          <span className="text-gray-500 text-xs font-mono">INTERNAL OPERATOR TERMINAL</span>
        </div>
        <span className="text-gray-600 text-xs font-mono">
          {new Date().toISOString().slice(0, 10)}
        </span>
      </header>
      <main className="max-w-[1800px] mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
