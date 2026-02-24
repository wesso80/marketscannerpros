"use client";

import { retailAuthBadge, retailSizeLabel, RETAIL_COLORS } from "@/lib/displayMode";
import Link from "next/link";

export interface OpportunityCard {
  symbol: string;
  name?: string;
  authorization?: string;
  ru?: number;
  expectedMove?: string;
  keyLevel?: string;
  riskZone?: string;
  setupType?: string;
  /** Warning badges, e.g. "Earnings in 3 days" */
  warnings?: string[];
  /** Info badges, e.g. "Options Flow Active" */
  infoBadges?: string[];
}

interface WatchlistOpportunityGridProps {
  opportunities: OpportunityCard[];
  loading?: boolean;
}

/**
 * Watchlist Opportunities — 3–6 large ticker cards.
 * Retail-friendly: No RU, no reason codes, no percentile stats.
 * Clear. Visual. Actionable.
 */
export default function WatchlistOpportunityGrid({
  opportunities,
  loading,
}: WatchlistOpportunityGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-5 animate-pulse h-48"
          />
        ))}
      </div>
    );
  }

  if (!opportunities.length) {
    return (
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-8 text-center">
        <p className="text-slate-400 text-lg">No opportunities detected right now</p>
        <p className="text-slate-500 text-sm mt-1">Check back when markets are open</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-4">Opportunities</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {opportunities.slice(0, 6).map((opp) => (
          <TickerCard key={opp.symbol} data={opp} />
        ))}
      </div>
    </div>
  );
}

function TickerCard({ data }: { data: OpportunityCard }) {
  const badge = retailAuthBadge(data.authorization, data.ru);
  const bc = RETAIL_COLORS[badge.color];
  const sizeHint = retailSizeLabel(data.ru);

  return (
    <Link
      href={`/tools/markets?symbol=${data.symbol}`}
      className="bg-slate-800/60 hover:bg-slate-800/90 border border-slate-700/50 hover:border-slate-600/70 rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200 group"
    >
      {/* Header: Symbol + Badge */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xl font-bold text-white group-hover:text-teal-300 transition-colors">
            {data.symbol}
          </span>
          {data.name && (
            <span className="block text-xs text-slate-400 mt-0.5 truncate max-w-[160px]">
              {data.name}
            </span>
          )}
        </div>
        <span
          className={`${bc.bg} ${bc.border} border rounded-lg px-2.5 py-1 text-xs font-semibold ${bc.text} flex items-center gap-1.5`}
        >
          {badge.icon} {badge.label}
        </span>
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        {data.expectedMove && (
          <StatItem label="Expected Move" value={data.expectedMove} />
        )}
        {data.keyLevel && (
          <StatItem label="Key Level" value={data.keyLevel} />
        )}
        {data.riskZone && (
          <StatItem label="Risk Zone" value={data.riskZone} />
        )}
        {data.setupType && (
          <StatItem label="Setup" value={data.setupType} />
        )}
      </div>

      {/* Suggested Size - retail-friendly */}
      {data.ru != null && (
        <div className="text-xs text-slate-400">
          💰 {sizeHint}
        </div>
      )}

      {/* Warning / Info Badges */}
      <div className="flex flex-wrap gap-1.5 mt-auto">
        {data.warnings?.map((w, i) => (
          <span
            key={i}
            className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] px-2 py-0.5 rounded-md"
          >
            ⚠️ {w}
          </span>
        ))}
        {data.infoBadges?.map((b, i) => (
          <span
            key={i}
            className="bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] px-2 py-0.5 rounded-md"
          >
            🔵 {b}
          </span>
        ))}
      </div>

      {/* CTA */}
      <div className="text-teal-400 text-xs font-medium group-hover:text-teal-300 transition-colors mt-1">
        View Full Breakdown →
      </div>
    </Link>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-slate-200 font-medium">{value}</div>
    </div>
  );
}
