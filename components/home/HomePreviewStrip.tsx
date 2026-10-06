import Link from 'next/link';

/**
 * HomePreviewStrip
 * --------------------------------------------------------------
 * Two layout-only cards under the hero showing what the Scanner and
 * Symbol tools look like. They carry no tickers, scores or other
 * numbers, so nothing here can be read as a live result. Each card
 * is labelled "Illustrative layout · not live results".
 */

const scannerColumns = ['Symbol', 'Market', 'Score'];
const SCANNER_PLACEHOLDER_ROWS = 3;

const symbolRows = ['Verdict', 'Reasons', 'Data quality', 'Invalidation'];

function PreviewLabel() {
  return (
    <span className="absolute right-3 top-3 rounded-full border border-white/10 bg-slate-950/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
      Illustrative layout · not live results
    </span>
  );
}

/** Grey bar standing in for a value, so the layout reads without inventing data. */
function Placeholder({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`h-2.5 rounded-full bg-slate-700/60 ${className}`} />;
}

function ScannerPreview() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-emerald-500/20 bg-slate-950/60 p-4 pt-10">
      <PreviewLabel />
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Scanner</span>
      </div>
      <div className="grid grid-cols-[2fr_1fr_1fr] items-center gap-x-3 gap-y-3 text-xs">
        {scannerColumns.map((col) => (
          <div key={col} className="text-slate-500">{col}</div>
        ))}
        {Array.from({ length: SCANNER_PLACEHOLDER_ROWS }, (_, i) => (
          <div key={i} className="contents">
            <Placeholder className="w-3/4" />
            <Placeholder className="w-1/2" />
            <Placeholder className="w-2/3" />
          </div>
        ))}
      </div>
      <div className="mt-auto pt-4 text-[11px] text-slate-500">
        Filter equities and crypto by structured technical conditions.
      </div>
    </div>
  );
}

function SymbolPreview() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-amber-500/20 bg-slate-950/60 p-4 pt-10">
      <PreviewLabel />
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">Symbol</span>
      </div>
      <div className="space-y-3">
        {symbolRows.map((label) => (
          <div key={label} className="grid grid-cols-[7rem_1fr] items-center gap-3 text-xs">
            <span className="text-slate-400">{label}</span>
            <Placeholder />
          </div>
        ))}
      </div>
      <div className="mt-auto pt-4 text-[11px] text-slate-500">
        One symbol: a verdict, the reasons behind it, and what would change it.
      </div>
    </div>
  );
}

export default function HomePreviewStrip() {
  return (
    <section className="border-b border-white/5 bg-gradient-to-b from-slate-950/80 to-slate-950/40">
      <div className="mx-auto max-w-7xl px-4 py-8 md:py-10">
        <div className="mb-4 md:mb-6">
          <h2 className="text-xl font-bold text-white sm:text-2xl">Inside the platform</h2>
          <p className="mt-1 text-sm text-slate-400">
            What the two main tools look like. Open them for real markets.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link href="/tools/scanner" className="block h-full transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 rounded-xl">
            <ScannerPreview />
          </Link>
          <Link href="/tools/golden-egg" className="block h-full transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 rounded-xl">
            <SymbolPreview />
          </Link>
        </div>
      </div>
    </section>
  );
}
