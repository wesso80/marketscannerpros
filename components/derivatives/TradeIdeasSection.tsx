import { DerivativesTradeIdea } from './types';

interface TradeIdeasSectionProps {
  ideas: DerivativesTradeIdea[];
}

export default function TradeIdeasSection({ ideas }: TradeIdeasSectionProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/10 p-3 md:p-4">
      <div className="text-xs text-white/50">Educational scenarios written from the current readings. Research only, not a trade instruction.</div>

      {ideas.length === 0 && <p className="mt-3 text-sm text-amber-200">Scenarios stay folded until funding, long/short and open interest are all present.</p>}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {ideas.map((idea) => (
          <div key={idea.id} className="rounded-xl border border-white/10 bg-black/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-white">{idea.symbol}</div>
              <div className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs font-semibold text-white/70">{idea.direction}</div>
            </div>

            <div className="mt-2 text-xs text-white/50">Study</div>
            <div className="text-sm font-semibold text-white/80">{idea.setupType}</div>

            <div className="mt-3 text-xs text-white/50">Reading</div>
            <div className="text-sm text-white/80">{idea.trigger}</div>

            <div className="mt-3 text-xs text-white/50">Invalidation</div>
            <div className="text-sm text-white/80">{idea.invalidation}</div>

            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-white/50">Conditions</div>
              <div className="text-xs font-semibold text-white/80">{idea.riskMode}</div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 overflow-hidden">
              <a
                href={`/tools/workspace?tab=alerts&symbol=${encodeURIComponent(idea.symbol)}`}
                aria-label={`Set alert for ${idea.symbol}`}
                className="flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-xs font-semibold text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              >
                Alert
              </a>
              <a
                href={`/tools/workspace?tab=watchlists&symbol=${encodeURIComponent(idea.symbol)}`}
                aria-label={`Add ${idea.symbol} to watchlist`}
                className="flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-xs font-semibold text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              >
                Watch
              </a>
              <a
                href={`/tools/workspace?tab=journal&note=${encodeURIComponent(`Scenario note: ${idea.symbol} ${idea.direction}`)}`}
                aria-label={`Journal scenario for ${idea.symbol}`}
                className="flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-xs font-semibold text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              >
                Journal
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
