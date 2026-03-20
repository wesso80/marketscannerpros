'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Small star button to toggle the current page as a favourite.
 * Renders inline — parent controls positioning.
 */
export default function FavoriteButton({ pageKey }: { pageKey: string }) {
  const [isFav, setIsFav] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/favorites')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return;
        setIsFav((data.favorites || []).includes(pageKey));
        setLoaded(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pageKey]);

  const toggle = useCallback(async () => {
    const next = !isFav;
    setIsFav(next);
    await fetch('/api/favorites', {
      method: next ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageKey }),
    });
  }, [isFav, pageKey]);

  if (!loaded) return null;

  return (
    <button
      onClick={toggle}
      title={isFav ? 'Remove from My Pages' : 'Add to My Pages'}
      className="transition-all hover:scale-110 active:scale-95"
      style={{
        fontSize: 16,
        lineHeight: 1,
        color: isFav ? '#FBBF24' : '#475569',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px 4px',
      }}
    >
      {isFav ? '★' : '☆'}
    </button>
  );
}
