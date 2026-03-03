import { FiltersMetaModel, JournalQueryState, TradeAssetClass, TradeSide } from '@/types/journal';

type TradeFiltersBarProps = {
  filtersMeta?: FiltersMetaModel;
  filters: JournalQueryState;
  onChange: (next: Partial<JournalQueryState>) => void;
  onReset: () => void;
};

const selectCls = 'rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 [&>option]:bg-slate-900 [&>option]:text-slate-100';

export default function TradeFiltersBar({ filtersMeta, filters, onChange, onReset }: TradeFiltersBarProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-3">
      {/* Mobile: collapsible filters */}
      <details className="md:hidden">
        <summary className="flex items-center justify-between cursor-pointer list-none [&::-webkit-details-marker]:hidden text-sm font-semibold text-slate-300">
          <span>🔍 Filters</span>
          <span className="text-slate-500 text-xs">tap to expand ▸</span>
        </summary>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <input
            value={filters.q || ''}
            onChange={(event) => onChange({ q: event.target.value, page: 1 })}
            placeholder="Search"
            className="col-span-2 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
          <select value={filters.status} onChange={(event) => onChange({ status: event.target.value as JournalQueryState['status'], page: 1 })} className={selectCls}>
            <option value="all">All</option><option value="open">Open</option><option value="closed">Closed</option>
          </select>
          <select value={filters.assetClass || ''} onChange={(event) => onChange({ assetClass: (event.target.value || undefined) as TradeAssetClass | undefined, page: 1 })} className={selectCls}>
            <option value="">Asset Class</option><option value="crypto">Crypto</option><option value="equity">Stocks</option><option value="options">Options</option>
          </select>
          <select value={filters.side || ''} onChange={(event) => onChange({ side: (event.target.value || undefined) as TradeSide | undefined, page: 1 })} className={selectCls}>
            <option value="">Side</option><option value="long">Long</option><option value="short">Short</option>
          </select>
          <select value={filters.symbol || ''} onChange={(event) => onChange({ symbol: event.target.value || undefined, page: 1 })} className={selectCls}>
            <option value="">Symbol</option>
            {(filtersMeta?.symbols || []).map((symbol) => (<option key={symbol} value={symbol}>{symbol}</option>))}
          </select>
          <select value={filters.strategyTag || ''} onChange={(event) => onChange({ strategyTag: event.target.value || undefined, page: 1 })} className={selectCls}>
            <option value="">Strategy</option><option value="manual">Manual</option>
            {(filtersMeta?.strategyTags || []).map((tag) => (<option key={tag} value={tag}>{tag}</option>))}
          </select>
          <button onClick={onReset} className="rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-100">Reset</button>
        </div>
      </details>
      {/* Desktop: inline grid */}
      <div className="hidden md:grid grid-cols-7 gap-2">
        <input
          id="journal-search"
          name="journal-search"
          value={filters.q || ''}
          onChange={(event) => onChange({ q: event.target.value, page: 1 })}
          placeholder="Search"
          className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
        <select value={filters.status} onChange={(event) => onChange({ status: event.target.value as JournalQueryState['status'], page: 1 })} className={selectCls}>
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <select value={filters.assetClass || ''} onChange={(event) => onChange({ assetClass: (event.target.value || undefined) as TradeAssetClass | undefined, page: 1 })} className={selectCls}>
          <option value="">Asset Class</option>
          <option value="crypto">Crypto</option>
          <option value="equity">Stocks</option>
          <option value="options">Options</option>
        </select>
        <select value={filters.side || ''} onChange={(event) => onChange({ side: (event.target.value || undefined) as TradeSide | undefined, page: 1 })} className={selectCls}>
          <option value="">Side</option>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
        <select value={filters.symbol || ''} onChange={(event) => onChange({ symbol: event.target.value || undefined, page: 1 })} className={selectCls}>
          <option value="">Symbol</option>
          {(filtersMeta?.symbols || []).map((symbol) => (
            <option key={symbol} value={symbol}>{symbol}</option>
          ))}
        </select>
        <select value={filters.strategyTag || ''} onChange={(event) => onChange({ strategyTag: event.target.value || undefined, page: 1 })} className={selectCls}>
          <option value="">Strategy</option>
          <option value="manual">Manual</option>
          {(filtersMeta?.strategyTags || []).map((tag) => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
        <button onClick={onReset} className="rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-100">Reset</button>
      </div>
    </div>
  );
}
