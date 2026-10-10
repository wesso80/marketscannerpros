import { symbolText } from '@/lib/presentation/symbolDisplay';

export function StalePriceMark({ stale }: { stale?: boolean | null }) {
  if (!stale) return null;
  return (
    <span
      data-testid="price-stale-mark"
      className="ml-1 inline-flex items-center rounded border border-slate-600 bg-slate-800/60 px-1 py-px text-[10px] font-medium normal-case tracking-normal text-slate-300"
    >
      Stale
    </span>
  );
}

export function PriceAsOfStamp({ priceText, label, stale }: { priceText: string; label?: string | null; stale?: boolean | null }) {
  return (
    <span>
      {priceText}
      {label ? (
        <small className="mt-0.5 block text-[10px] font-normal text-slate-500" data-testid="price-as-of">
          {label}
          <StalePriceMark stale={stale} />
        </small>
      ) : null}
    </span>
  );
}

export function SymbolAsOfLine({ label, stale }: { label: string; stale?: boolean | null }) {
  return (
    <div className="text-[10px] text-slate-500" data-testid="symbol-as-of">
      {symbolText(label)}
      <StalePriceMark stale={stale} />
    </div>
  );
}
