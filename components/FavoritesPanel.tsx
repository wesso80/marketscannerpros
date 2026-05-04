'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFavorites } from '@/hooks/useFavorites';
import { TOOL_CATALOG, TOOL_CATEGORIES, type ToolPage } from '@/lib/toolCatalog';

function MyPagesMetric({ label, value, tone = '#CBD5E1', detail }: { label: string; value: string; tone?: string; detail: string }) {
  return (
    <div className="min-h-[3.1rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
      <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-black" style={{ color: tone }}>{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-slate-500" title={detail}>{detail}</div>
    </div>
  );
}

export default function FavoritesPanel({ embeddedInDashboard = false }: { embeddedInDashboard?: boolean } = {}) {
  const { favorites, loading, error, degraded, toggleFavorite, isFavorite } = useFavorites();
  const [showBrowser, setShowBrowser] = useState(false);
  const [filterCat, setFilterCat] = useState<string | null>(null);

  const favoriteTools = favorites
    .map(k => TOOL_CATALOG.find(t => t.key === k))
    .filter(Boolean) as ToolPage[];

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 bg-slate-800/50 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-700/30 bg-amber-900/10 px-4 py-5 text-center">
        <p className="text-sm font-semibold text-amber-300">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {degraded && (
        <div className="rounded-lg border border-amber-700/30 bg-amber-900/10 px-3 py-2 text-xs text-amber-300">
          Saved pages loaded from cache — database temporarily unavailable.
        </div>
      )}
      {embeddedInDashboard && (
        <section
          className="rounded-lg border border-emerald-400/20 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,13,24,0.98))] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
          aria-label="My Pages command header"
        >
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(26rem,0.9fr)]">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-extrabold uppercase tracking-[0.16em]">
                <span className="text-emerald-300">Saved workspace</span>
                <span className="rounded-md border border-white/10 bg-slate-950/40 px-1.5 py-0.5 text-[0.6rem] tracking-[0.12em] text-slate-400">{favoriteTools.length} pinned</span>
              </div>
              <h2 className="mt-1 text-xl font-black tracking-normal text-white md:text-2xl">My Pages.</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">Pinned research pages for the tools you open most often. Pages persist across devices.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {favoriteTools[0] ? (
                  <Link href={favoriteTools[0].href} className="rounded-md border border-emerald-400/35 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-200 no-underline transition-colors hover:bg-emerald-400/15">Open {favoriteTools[0].label}</Link>
                ) : (
                  <Link href="/tools/scanner" className="rounded-md border border-emerald-400/35 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-200 no-underline transition-colors hover:bg-emerald-400/15">Open Scanner</Link>
                )}
                <button type="button" onClick={() => setShowBrowser((current) => !current)} className="rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-amber-200 transition-colors hover:bg-amber-400/15">
                  {showBrowser ? 'Close Browser' : 'Manage Pages'}
                </button>
                <Link href="/tools" className="rounded-md border border-sky-400/35 bg-sky-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-sky-200 no-underline transition-colors hover:bg-sky-400/15">All Tools</Link>
              </div>
            </div>

            <div className="grid self-start gap-1.5 sm:grid-cols-2">
              <MyPagesMetric label="Saved" value={favoriteTools.length ? `${favoriteTools.length} pages` : 'Empty'} tone={favoriteTools.length ? '#10B981' : '#94A3B8'} detail={favoriteTools.length ? `Top: ${favoriteTools[0]?.label}` : 'Use Manage Pages to pin tools'} />
              <MyPagesMetric label="Catalog" value={`${TOOL_CATALOG.length} tools`} tone="#A5B4FC" detail={`${TOOL_CATEGORIES.length} categories available`} />
              <MyPagesMetric label="Coverage" value={favoriteTools.length ? `${Math.round((favoriteTools.length / TOOL_CATALOG.length) * 100)}%` : '0%'} tone="#F59E0B" detail="Share of catalog pinned" />
              <MyPagesMetric label="Next Check" value={favoriteTools[0] ? `Open ${favoriteTools[0].label}` : 'Pin a page'} tone={favoriteTools[0] ? '#FBBF24' : '#94A3B8'} detail={favoriteTools[0] ? 'Resume from your top page' : 'Click Manage Pages to start'} />
            </div>
          </div>
        </section>
      )}
      {/* ─── Favorite Cards ─── */}
      {favoriteTools.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {favoriteTools.map(tool => (
            <div
              key={tool.key}
              className="group relative rounded-xl border border-slate-700/50 bg-[rgba(15,23,42,0.6)] hover:border-emerald-500/40 hover:bg-[rgba(16,185,129,0.05)] transition-all"
            >
              <Link
                href={tool.href}
                className="flex flex-col gap-1.5 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 rounded-xl"
                aria-label={`Open ${tool.label}`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-950/50 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-300">{tool.icon}</span>
                  <span className="text-xs font-semibold text-white truncate">{tool.label}</span>
                </div>
                <span className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{tool.description}</span>
                {tool.tier && (
                  <span className="text-[9px] uppercase tracking-wider mt-auto" style={{ color: tool.tier === 'pro_trader' ? '#A78BFA' : '#10B981' }}>
                    {tool.tier.replace('_', ' ')}
                  </span>
                )}
              </Link>
              <button
                type="button"
                onClick={() => toggleFavorite(tool.key)}
                aria-label={`Remove ${tool.label} from My Pages`}
                className="absolute top-2 right-2 text-amber-400 hover:text-amber-300 text-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 rounded transition-opacity"
              >
                ★
              </button>
            </div>
          ))}

          {/* Add more button */}
          {!embeddedInDashboard && <button
            onClick={() => setShowBrowser(true)}
            className="rounded-xl border border-dashed border-slate-600/50 hover:border-emerald-500/40 transition-colors p-3 flex flex-col items-center justify-center gap-1 min-h-[80px]"
          >
            <span className="text-xl text-slate-500">+</span>
            <span className="text-[10px] text-slate-500">Add Page</span>
          </button>}
        </div>
      ) : (
        <div className="text-center py-12 rounded-xl border border-slate-700/30 bg-slate-800/20">
          <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-950/50 text-xs font-black uppercase text-slate-400">MY</div>
          <h3 className="text-sm font-semibold text-white mb-1">No favourites yet</h3>
          <p className="text-xs text-slate-400 mb-4 max-w-sm mx-auto">
            Add your most-used tools here for quick access. Your favourites sync across all your devices.
          </p>
          <button
            onClick={() => setShowBrowser(true)}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
          >
            {embeddedInDashboard ? 'Manage Pages' : 'Browse Tools'}
          </button>
        </div>
      )}

      {/* ─── Tool Browser (toggled) ─── */}
      {showBrowser && (
        <div className="rounded-xl border border-slate-700/50 bg-[rgba(15,23,42,0.8)] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Browse Workflow Tools</h3>
            <button
              onClick={() => setShowBrowser(false)}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              ✕ Close
            </button>
          </div>

          {/* Category filters */}
          <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Filter by category">
            <button
              type="button"
              onClick={() => setFilterCat(null)}
              className={`px-2 py-0.5 text-[10px] rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${!filterCat ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'}`}
            >
              All
            </button>
            {TOOL_CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCat(cat)}
                className={`px-2 py-0.5 text-[10px] rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${filterCat === cat ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Tool grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {TOOL_CATALOG
              .filter(t => !filterCat || t.category === filterCat)
              .map(tool => {
                const faved = isFavorite(tool.key);
                return (
                  <button
                    key={tool.key}
                    type="button"
                    aria-pressed={faved}
                    aria-label={`${faved ? 'Remove' : 'Add'} ${tool.label} ${faved ? 'from' : 'to'} My Pages`}
                    className={`flex items-center gap-2 rounded-lg p-2 border transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${faved ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700/30 bg-slate-800/20 hover:border-slate-600/50'}`}
                    onClick={() => toggleFavorite(tool.key)}
                  >
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-950/50 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{tool.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{tool.label}</div>
                      <div className="text-[10px] text-slate-500 truncate">{tool.description}</div>
                    </div>
                    <span className={`text-sm flex-shrink-0 ${faved ? 'text-amber-400' : 'text-slate-600'}`} aria-hidden="true">
                      {faved ? '★' : '☆'}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
