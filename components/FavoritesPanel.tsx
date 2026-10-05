'use client';

import { useState } from 'react';
import SourceLine from '@/components/visual/SourceLine';
import Link from 'next/link';
import { useFavorites } from '@/hooks/useFavorites';
import { TOOL_CATALOG, TOOL_CATEGORIES, getToolByKey, resolveFavoriteTools } from '@/lib/toolCatalog';

export default function FavoritesPanel({ embeddedInDashboard = false }: { embeddedInDashboard?: boolean } = {}) {
  const { favorites, loading, error, degraded, toggleFavorite: toggleStoredFavorite } = useFavorites();
  const [showAll, setShowAll] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [filterCat, setFilterCat] = useState<string | null>(null);

  const favoriteTools = resolveFavoriteTools(favorites);
  const storedKeysFor = (key: string) => favorites.filter(saved => getToolByKey(saved)?.key === key);
  const isFavorite = (key: string) => storedKeysFor(key).length > 0;
  const toggleFavorite = async (key: string) => {
    const stored = storedKeysFor(key);
    if (stored.length) await Promise.all(stored.map(toggleStoredFavorite));
    else await toggleStoredFavorite(key);
  };

  if (loading) {
    return (
      <div aria-busy="true"><p role="status" data-my-pages-summary>Loading saved pages…</p><div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 bg-slate-800/50 rounded-xl animate-pulse" />
        ))}
      </div></div>
    );
  }

  if (error) {
    if (error.startsWith('Sign in')) {
      return (
        <section className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-8 text-center" aria-label="My Pages">
          <h2 className="text-lg font-semibold text-white">My Pages</h2>
          <p data-my-pages-summary role="status" className="mx-auto mt-2 max-w-md text-sm text-slate-400">Sign in to see the pages you save. This dashboard stays open without an account.</p>
          <a href="/auth?next=/tools/dashboard" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-emerald-500/20 px-4 text-sm font-semibold text-emerald-300">Sign in</a>
        </section>
      );
    }
    return (
      <div className="rounded-xl border border-amber-700/30 bg-amber-900/10 px-4 py-5 text-center">
        <p data-my-pages-summary role="status" className="text-sm font-semibold text-amber-300">Saved pages could not be loaded. Reload this page to try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <h2 className="text-lg font-semibold text-white">My Pages</h2>
        <p data-my-pages-summary role="status" className="text-sm text-slate-300">{degraded ? `${favoriteTools.length} saved pages shown from cache; sync could not be verified.` : favoriteTools.length ? `${favoriteTools.length} saved pages` : 'No pages saved yet.'}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-expanded={showBrowser} aria-controls="my-pages-browser" onClick={() => setShowBrowser(!showBrowser)} className="min-h-10 rounded-lg border border-slate-700 px-3 text-sm">{showBrowser ? 'Close browser' : 'Manage pages'}</button>
          <Link href="/tools" className="inline-flex min-h-10 items-center rounded-lg border border-slate-700 px-3 text-sm">All tools</Link>
        </div>
      </header>
      {/* ─── Favorite Cards ─── */}
      {favoriteTools.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(showAll ? favoriteTools : favoriteTools.slice(0, 5)).map(tool => (
            <div
              key={tool.key}
              data-favorite-card
              className="group relative rounded-xl border border-slate-700/50 bg-[rgba(15,23,42,0.6)] hover:border-emerald-500/40 hover:bg-[rgba(16,185,129,0.05)] transition-all"
            >
              <Link
                href={tool.href}
                className="flex min-w-0 min-h-10 flex-col gap-1.5 p-3 pr-14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 rounded-xl"
                aria-label={`Open ${tool.label}`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-950/50 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-300">{tool.icon}</span>
                  <span className="text-sm font-semibold text-white break-words">{tool.label}</span>
                </div>
                <span className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{tool.description}</span>
                {tool.tier && (
                  <span className="text-[9px] uppercase tracking-wider mt-auto" style={{ color: 'var(--msp-bull)' }}>
                    {tool.tier.replace('_', ' ')}
                  </span>
                )}
              </Link>
              <button
                type="button"
                onClick={() => toggleFavorite(tool.key)}
                aria-label={`Remove ${tool.label} from My Pages`}
                className="absolute top-1 right-1 inline-flex min-h-10 min-w-10 items-center justify-center rounded text-amber-400 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
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
        <div className="text-center py-4 rounded-xl border border-slate-700/30 bg-slate-800/20">
          <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-950/50 text-xs font-black uppercase text-slate-400">MY</div>
          <p className="text-xs text-slate-400 mb-4 max-w-sm mx-auto">
            Use Manage pages to save shortcuts to your most-used tools.
          </p>

        </div>
      )}

      {favoriteTools.length > 5 && <button type="button" className="min-h-10 rounded-lg border border-slate-700 px-3 text-sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show five' : `Show all ${favoriteTools.length}`}</button>}
      <SourceLine source={degraded ? 'Cached saved-page preferences' : 'Saved-page preferences'} basis="Personal shortcuts · sync observation time not supplied" />
      {/* ─── Tool Browser (toggled) ─── */}
      {showBrowser && (
        <div id="my-pages-browser" className="rounded-xl border border-slate-700/50 bg-[rgba(15,23,42,0.8)] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Browse Workflow Tools</h3>
            <button
              onClick={() => setShowBrowser(false)}
              className="min-h-10 min-w-10 text-xs text-slate-400 hover:text-white transition-colors"
            >
              ✕ Close
            </button>
          </div>

          {/* Category filters */}
          <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Filter by category">
            <button
              type="button"
              aria-pressed={!filterCat}
              onClick={() => setFilterCat(null)}
              className={`min-h-10 px-3 py-2 text-[10px] rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${!filterCat ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'}`}
            >
              All
            </button>
            {TOOL_CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                aria-pressed={filterCat === cat}
                onClick={() => setFilterCat(cat)}
                className={`min-h-10 px-3 py-2 text-[10px] rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${filterCat === cat ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'}`}
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
                    className={`min-h-10 flex items-center gap-2 rounded-lg p-2 border transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${faved ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700/30 bg-slate-800/20 hover:border-slate-600/50'}`}
                    onClick={() => toggleFavorite(tool.key)}
                  >
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-950/50 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{tool.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white break-words">{tool.label}</div>
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
