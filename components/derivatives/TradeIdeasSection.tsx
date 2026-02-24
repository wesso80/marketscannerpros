import { DerivativesTradeIdea } from './types';

interface TradeIdeasSectionProps {
  ideas: DerivativesTradeIdea[];
}

export default function TradeIdeasSection({ ideas }: TradeIdeasSectionProps) {
  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
      <div className="text-sm font-semibold text-white">Today’s Permissioned Trades</div>
      <div className="text-xs text-white/50">Trade idea output aligned to shared state — max 3 cards.</div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {ideas.map((idea) => (
          <div key={idea.id} className="rounded-xl border border-white/10 bg-black/10 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">{idea.symbol}</div>
              <div className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs font-semibold text-white/70">{idea.direction}</div>
            </div>

            <div className="mt-2 text-xs text-white/50">Setup</div>
            <div className="text-sm font-semibold text-white/80">{idea.setupType}</div>

            <div className="mt-3 text-xs text-white/50">Trigger</div>
            <div className="text-sm text-white/80">{idea.trigger}</div>

            <div className="mt-3 text-xs text-white/50">Invalidation</div>
            <div className="text-sm text-white/80">{idea.invalidation}</div>

            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-white/50">Risk mode</div>
              <div className="text-xs font-semibold text-white/80">{idea.riskMode}</div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 overflow-hidden">
              <a
                href={`/tools/alerts?symbol=${encodeURIComponent(idea.symbol)}`}
                className="h-9 rounded-lg border border-white/10 bg-black/20 text-xs font-semibold text-white/80 hover:bg-white/10 flex items-center justify-center"
              >
                Alert
              </a>
              <a
                href={`/tools/watchlists?symbol=${encodeURIComponent(idea.symbol)}`}
                className="h-9 rounded-lg border border-white/10 bg-black/20 text-xs font-semibold text-white/80 hover:bg-white/10 flex items-center justify-center"
              >
                Watch
              </a>
              <a
                href={`/tools/journal?note=${encodeURIComponent(`Derivatives idea: ${idea.symbol} ${idea.direction}`)}`}
                className="h-9 rounded-lg border border-white/10 bg-black/20 text-xs font-semibold text-white/80 hover:bg-white/10 flex items-center justify-center"
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
