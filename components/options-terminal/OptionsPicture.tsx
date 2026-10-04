/** Pictures from measured chain values. Missing inputs render nothing. */
export default function OptionsPicture({
  spot,
  expectedMove,
  callOi,
  putOi,
  walls,
}: {
  spot: number;
  expectedMove: number;
  callOi: number;
  putOi: number;
  walls: Array<{ strike: number; callOI: number; putOI: number }>;
}) {
  const move = Number.isFinite(spot) && spot > 0 && Number.isFinite(expectedMove) && expectedMove > 0;
  const oi = (Number.isFinite(callOi) ? callOi : 0) + (Number.isFinite(putOi) ? putOi : 0);
  const top = walls
    .filter((row) => row.callOI + row.putOI > 0)
    .sort((a, b) => b.callOI + b.putOI - (a.callOI + a.putOI))
    .slice(0, 8);
  const max = Math.max(...top.map((row) => row.callOI + row.putOI), 1);
  if (!move && oi <= 0 && !top.length) return null;
  return (
    <section data-options-visual className="grid gap-3 md:grid-cols-3">
      {move && (
        <div className="rounded-lg border border-[var(--msp-border)] p-3">
          <p className="text-xs text-[var(--msp-text-muted)]">Expected move</p>
          <div className="relative mt-3 h-3 rounded bg-white/10" aria-hidden="true">
            <div className="absolute inset-y-0 rounded bg-[var(--msp-warn)]" style={{ left: '20%', right: '20%' }} />
          </div>
          <p className="mt-2 text-sm">{(spot - expectedMove).toFixed(2)} to {(spot + expectedMove).toFixed(2)}</p>
        </div>
      )}
      {oi > 0 && (
        <div className="rounded-lg border border-[var(--msp-border)] p-3">
          <p className="text-xs text-[var(--msp-text-muted)]">Put / call open interest</p>
          <div className="mt-3 flex h-3 overflow-hidden rounded" aria-hidden="true">
            <div style={{ width: `${(callOi / oi) * 100}%`, background: 'var(--msp-bull)' }} />
            <div style={{ width: `${(putOi / oi) * 100}%`, background: 'var(--msp-bear)' }} />
          </div>
          <p className="mt-2 text-sm">Calls {Math.round((callOi / oi) * 100)}% · Puts {Math.round((putOi / oi) * 100)}%</p>
        </div>
      )}
      {top.length > 0 && (
        <div data-oi-walls className="rounded-lg border border-[var(--msp-border)] p-3">
          <p className="text-xs text-[var(--msp-text-muted)]">Open-interest walls</p>
          <ul className="mt-2 space-y-1">
            {top.map((row) => (
              <li key={row.strike} className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs">
                <span>{row.strike}</span>
                <span className="h-2 rounded bg-white/10" aria-hidden="true">
                  <span className="block h-2 rounded" style={{ width: `${((row.callOI + row.putOI) / max) * 100}%`, background: row.callOI >= row.putOI ? 'var(--msp-bull)' : 'var(--msp-bear)' }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
