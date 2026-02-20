import Link from 'next/link';

type AssetType = 'equity' | 'crypto';

interface ExplorerActionGridProps {
  assetType: AssetType;
  symbol: string;
  blocked: boolean;
  blockReason: string;
}

function ActionItem({
  blocked,
  blockReason,
  href,
  label,
}: {
  blocked: boolean;
  blockReason: string;
  href: string;
  label: string;
}) {
  if (blocked) {
    return (
      <button
        type="button"
        disabled
        title={blockReason}
        className="cursor-not-allowed rounded border border-slate-700 bg-slate-900 px-2 py-1 text-center text-[10px] text-slate-500"
      >
        {label}
      </button>
    );
  }

  return (
    <Link
      href={href}
      className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-center text-[10px] text-slate-300"
    >
      {label}
    </Link>
  );
}

export default function ExplorerActionGrid({ assetType, symbol, blocked, blockReason }: ExplorerActionGridProps) {
  const upper = symbol.toUpperCase();

  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      <ActionItem blocked={blocked} blockReason={blockReason} href={`/tools/watchlists?symbol=${upper}`} label="Add to Watchlist" />
      <ActionItem blocked={blocked} blockReason={blockReason} href={`/tools/alerts?symbol=${upper}`} label="Create Alert" />
      <ActionItem
        blocked={blocked}
        blockReason={blockReason}
        href={assetType === 'crypto' ? `/tools/scanner?asset=crypto&symbol=${upper}` : `/tools/confluence-scanner?symbol=${upper}`}
        label="Run Confluence Scan"
      />
      <ActionItem
        blocked={blocked}
        blockReason={blockReason}
        href={`/tools/journal?note=${encodeURIComponent(`Review ${upper} setup`)}`}
        label="Open Journal Draft"
      />
    </div>
  );
}
