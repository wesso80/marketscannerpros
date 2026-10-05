import Link from 'next/link';
import { marketText } from '@/lib/marketsPresentation';

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
        title={marketText(blockReason)}
        className="min-h-10 cursor-not-allowed rounded border border-slate-700 bg-slate-900 px-2 py-1 text-center text-[10px] text-slate-500"
      >
        {label}
      </button>
    );
  }

  return (
    <Link
      href={href}
      className="min-h-10 content-center rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-center text-[10px] text-slate-300"
    >
      {label}
    </Link>
  );
}

export default function ExplorerActionGrid({ assetType, symbol, blocked, blockReason }: ExplorerActionGridProps) {
  const upper = symbol.toUpperCase();

  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      <ActionItem blocked={blocked} blockReason={blockReason} href={`/tools/workspace?tab=watchlists&addSymbol=${encodeURIComponent(upper)}&type=${assetType}`} label="Add to Watchlist" />
      <ActionItem blocked={blocked} blockReason={blockReason} href={`/tools/workspace?tab=alerts&symbol=${upper}`} label="Create Alert" />
      <ActionItem
        blocked={blocked}
        blockReason={blockReason}
        href={symbolHref(upper,assetType)}
        label="Open Symbol"
      />
      <ActionItem
        blocked={blocked}
        blockReason={blockReason}
        href={`/tools/workspace?tab=journal&note=${encodeURIComponent(`Review ${upper} setup`)}`}
        label="Open Journal Draft"
      />
    </div>
  );
}
import {symbolHref} from '@/lib/market/links';
