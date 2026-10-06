'use client';

import { useEffect, useState } from 'react';
import StatTile from '@/components/visual/StatTile';
import { boundedJsonFetch } from '@/lib/boundedFetch';
import { coinCode, selectCryptoDeskTiles, type DeskTile } from '@/lib/terminal/cryptoDeskTiles';

type DeskState =
  | { status: 'loading' }
  | { status: 'tiles'; tiles: DeskTile[]; basis: string | null }
  | { status: 'gate' };

export default function TerminalCryptoDesk({ symbol }: { symbol: string }) {
  const [state, setState] = useState<DeskState>({ status: 'loading' });
  const code = coinCode(symbol);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      const read = async (url: string) => {
        try {
          const { response, body } = await boundedJsonFetch<Record<string, unknown>>(url);
          return response.ok ? body : null;
        } catch {
          return null;
        }
      };
      // Funding, long/short and open interest. Liquidations are not requested: OKX public history does not cover 24 hours.
      const [funding, longShort, openInterest] = await Promise.all([
        read('/api/funding-rates'),
        read('/api/long-short-ratio'),
        read('/api/crypto/open-interest'),
      ]);
      if (cancelled) return;
      const selected = selectCryptoDeskTiles(symbol, {
        funding: funding as Parameters<typeof selectCryptoDeskTiles>[1]['funding'],
        longShort: longShort as Parameters<typeof selectCryptoDeskTiles>[1]['longShort'],
        openInterest: openInterest as Parameters<typeof selectCryptoDeskTiles>[1]['openInterest'],
      });
      setState(selected.mode === 'tiles'
        ? { status: 'tiles', tiles: selected.tiles, basis: selected.basis }
        : { status: 'gate' });
    })();
    return () => { cancelled = true; };
  }, [symbol]);

  if (state.status === 'loading') {
    return <p className="text-sm text-[var(--msp-text-muted)]">Loading crypto derivatives for {code}</p>;
  }

  if (state.status === 'gate') {
    return (
      <section aria-label="Crypto derivatives" className="rounded-lg border border-[var(--msp-warn)] bg-[var(--msp-panel)] p-4">
        <h2 className="text-base font-semibold text-[var(--msp-text)]">Not collected for {code}</h2>
        <p className="mt-2 text-sm text-[var(--msp-text-muted)]">
          Funding, open interest and long/short are not in this response.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Crypto derivatives" className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {state.tiles.map((tile) => (
          <StatTile key={tile.label} label={tile.label} value={tile.value} warning={tile.warning} />
        ))}
      </div>
      {state.basis ? <p className="text-xs text-[var(--msp-warn)]">{state.basis}</p> : null}
    </section>
  );
}
