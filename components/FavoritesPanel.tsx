'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFavorites } from '@/hooks/useFavorites';
import { TOOL_CATALOG, TOOL_CATEGORIES, type ToolPage } from '@/lib/toolCatalog';

export default function FavoritesPanel() {
  const { favorites, loading, toggleFavorite, isFavorite } = useFavorites();
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

  return (
    <div className="space-y-4">
      {/* ─── Favorite Cards ─── */}
      {favoriteTools.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {favoriteTools.map(tool => (
            <Link
              key={tool.key}
              href={tool.href}
              className="group relative rounded-xl border border-slate-700/50 bg-[rgba(15,23,42,0.6)] hover:border-emerald-500/40 hover:bg-[rgba(16,185,129,0.05)] transition-all p-3 flex flex-col gap-1.5"
            >
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(tool.key); }}
                className="absolute top-2 right-2 text-amber-400 hover:text-amber-300 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove from favourites"
              >
                ★
              </button>
              <div className="flex items-center gap-2">
                <span className="text-lg">{tool.icon}</span>
                <span className="text-xs font-semibold text-white truncate">{tool.label}</span>
              </div>
              <span className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{tool.description}</span>
              {tool.tier && (
                <span className="text-[9px] uppercase tracking-wider mt-auto" style={{ color: tool.tier === 'pro_trader' ? '#A78BFA' : '#10B981' }}>
                  {tool.tier.replace('_', ' ')}
                </span>
              )}
            </Link>
          ))}

          {/* Add more button */}
          <button
            onClick={() => setShowBrowser(true)}
            className="rounded-xl border border-dashed border-slate-600/50 hover:border-emerald-500/40 transition-colors p-3 flex flex-col items-center justify-center gap-1 min-h-[80px]"
          >
            <span className="text-xl text-slate-500">+</span>
            <span className="text-[10px] text-slate-500">Add Page</span>
          </button>
        </div>
      ) : (
        <div className="text-center py-12 rounded-xl border border-slate-700/30 bg-slate-800/20">
          <div className="text-3xl mb-3">⭐</div>
          <h3 className="text-sm font-semibold text-white mb-1">No favourites yet</h3>
          <p className="text-xs text-slate-400 mb-4 max-w-sm mx-auto">
            Add your most-used tools here for quick access. Your favourites sync across all your devices.
          </p>
          <button
            onClick={() => setShowBrowser(true)}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
          >
            Browse Tools
          </button>
        </div>
      )}

      {/* ─── Tool Browser (toggled) ─── */}
      {showBrowser && (
        <div className="rounded-xl border border-slate-700/50 bg-[rgba(15,23,42,0.8)] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Browse All Tools</h3>
            <button
              onClick={() => setShowBrowser(false)}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              ✕ Close
            </button>
          </div>

          {/* Category filters */}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setFilterCat(null)}
              className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${!filterCat ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'}`}
            >
              All
            </button>
            {TOOL_CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCat(cat)}
                className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${filterCat === cat ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'}`}
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
                  <div
                    key={tool.key}
                    className={`flex items-center gap-2 rounded-lg p-2 border transition-colors cursor-pointer ${faved ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700/30 bg-slate-800/20 hover:border-slate-600/50'}`}
                    onClick={() => toggleFavorite(tool.key)}
                  >
                    <span className="text-base flex-shrink-0">{tool.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{tool.label}</div>
                      <div className="text-[10px] text-slate-500 truncate">{tool.description}</div>
                    </div>
                    <span className={`text-sm flex-shrink-0 ${faved ? 'text-amber-400' : 'text-slate-600'}`}>
                      {faved ? '★' : '☆'}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
