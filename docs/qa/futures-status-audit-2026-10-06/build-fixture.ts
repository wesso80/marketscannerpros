/**
 * Builds the same Futures Terminal payload the route assembles, at a fixed clock.
 * Session, calendar, bridge, and phantom values come from the existing engines.
 * Status overlays are applied later by the capture script and do not edit these numbers.
 */
import { writeFileSync } from 'node:fs';
import { buildFuturesSessionState } from '../../../lib/terminal/futures/futuresSessionEngine';
import { buildFuturesCloseCalendar } from '../../../lib/terminal/futures/futuresCloseCalendar';
import { buildPhantomTimeState } from '../../../lib/terminal/futures/phantomTimeEngine';
import { getCashBridge, getCashBridgeFallbackMessage } from '../../../lib/terminal/futures/cashBridgeMap';

const now = new Date('2026-10-05T15:00:00Z');
const RISK_NOTICE =
  'Futures Risk - Educational Only. Futures are leveraged products and may involve rapid losses, margin calls, liquidity gaps, overnight risk, contract rollover risk, and exchange maintenance interruptions. This page displays educational market-structure observations only and is not trading advice, broker execution, or a recommendation to trade futures.';

function assemble(symbol: string) {
  const errors: string[] = [];
  const session = buildFuturesSessionState(symbol, now);
  const closeCalendar = buildFuturesCloseCalendar(symbol, 'globex', 1, now);
  const cashBridge = getCashBridge(symbol) ?? undefined;
  const phantomTime = buildPhantomTimeState(symbol, now) ?? undefined;
  if (!cashBridge && (symbol === '/ES' || symbol === '/NQ' || symbol === '/YM' || symbol === '/RTY')) {
    errors.push('cashBridge: Data unavailable from current feed');
  }
  if (!cashBridge && !phantomTime) {
    closeCalendar.warnings = Array.from(new Set([...closeCalendar.warnings, getCashBridgeFallbackMessage()]));
  }
  const dataState = errors.length === 0 ? 'ready' : errors.length < 3 ? 'partial' : 'error';
  return {
    symbol,
    marketPath: 'futures' as const,
    session,
    closeCalendar,
    ...(phantomTime ? { phantomTime } : {}),
    ...(cashBridge ? { cashBridge } : {}),
    riskNotice: RISK_NOTICE,
    dataState,
    errors,
  };
}

const fixture = {
  clock: now.toISOString(),
  es: assemble('/ES'),
  gc: assemble('/GC'),
};
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2));
console.log('/ES', fixture.es.dataState, fixture.es.errors, fixture.es.session.currentSession);
console.log('/GC', fixture.gc.dataState, fixture.gc.errors, fixture.gc.session.currentSession, 'bridge', Boolean(fixture.gc.cashBridge));
