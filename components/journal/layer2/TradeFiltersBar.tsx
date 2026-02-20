import { FiltersMetaModel, JournalQueryState, TradeAssetClass, TradeSide } from '@/types/journal';

type TradeFiltersBarProps = {
  filtersMeta?: FiltersMetaModel;
  filters: JournalQueryState;
  onChange: (next: Partial<JournalQueryState>) => void;
  onReset: () => void;
};

export default function TradeFiltersBar({ filtersMeta, filters, onChange, onReset }: TradeFiltersBarProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
        <input
          value={filters.q || ''}
          onChange={(event) => onChange({ q: event.target.value, page: 1 })}
          placeholder="Search"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100"
        />
        <select value={filters.status} onChange={(event) => onChange({ status: event.target.value as JournalQueryState['status'], page: 1 })} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <select value={filters.assetClass || ''} onChange={(event) => onChange({ assetClass: (event.target.value || undefined) as TradeAssetClass | undefined, page: 1 })} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
          <option value="">Asset Class</option>
          <option value="crypto">Crypto</option>
          <option value="equity">Stocks</option>
          <option value="options">Options</option>
        </select>
        <select value={filters.side || ''} onChange={(event) => onChange({ side: (event.target.value || undefined) as TradeSide | undefined, page: 1 })} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
          <option value="">Side</option>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
        <select value={filters.symbol || ''} onChange={(event) => onChange({ symbol: event.target.value || undefined, page: 1 })} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
          <option value="">Symbol</option>
          {(filtersMeta?.symbols || []).map((symbol) => (
            <option key={symbol} value={symbol}>{symbol}</option>
          ))}
        </select>
        <select value={filters.strategyTag || ''} onChange={(event) => onChange({ strategyTag: event.target.value || undefined, page: 1 })} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
          <option value="">Strategy</option>
          {(filtersMeta?.strategyTags || []).map((tag) => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
        <button onClick={onReset} className="rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-100">Reset</button>
      </div>
    </div>
  );
}
