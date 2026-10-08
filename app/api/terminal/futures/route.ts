import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import {
  buildFuturesSessionState,
  type FuturesSessionState,
} from '@/lib/terminal/futures/futuresSessionEngine';
import {
  buildFuturesCloseCalendar,
  type FuturesAnchorMode,
  type FuturesCloseCalendarResponse,
} from '@/lib/terminal/futures/futuresCloseCalendar';
import {
  getCashBridge,
  getCashBridgeFallbackMessage,
  type CashBridgeState,
} from '@/lib/terminal/futures/cashBridgeMap';
import { buildPhantomTimeState, type PhantomTimeState } from '@/lib/terminal/futures/phantomTimeEngine';
import { toPublicFuturesCloseCalendar, type PublicFuturesCloseCalendar } from '@/lib/research/publicFuturesCloseCalendar';

export type FuturesTerminalResponse = {
  symbol: string;
  marketPath: 'futures';
  session: FuturesSessionState;
  /** Public close calendar: close times and counts only (no category weight or stack score). */
  closeCalendar: PublicFuturesCloseCalendar;
  phantomTime?: PhantomTimeState;
  cashBridge?: CashBridgeState;
  riskNotice: string;
  dataState: 'ready' | 'partial' | 'error';
  errors: string[];
};

const RISK_NOTICE =
  'Futures Risk - Educational Only. Futures are leveraged products and may involve rapid losses, margin calls, liquidity gaps, overnight risk, contract rollover risk, and exchange maintenance interruptions. This page displays educational market-structure observations only and is not trading advice, broker execution, or a recommendation to trade futures.';

function normalizeFuturesSymbol(symbol: string): string {
  const upper = symbol.toUpperCase().trim();
  return upper.startsWith('/') ? upper : `/${upper}`;
}

function parseAnchorMode(value: string | null): FuturesAnchorMode {
  if (value === 'rth' || value === 'cash_bridge') return value;
  return 'globex';
}

function parseHorizon(value: string | null): number {
  const normalized = (value ?? '1').toLowerCase().replace(/d$/, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(30, Math.round(parsed)));
}

function fallbackSession(symbol: string): FuturesSessionState {
  return {
    symbol,
    exchange: 'CME',
    currentSession: 'closed',
    timezone: 'America/New_York',
    sessionOpenET: '18:00',
    sessionCloseET: '17:00',
    maintenanceStartET: '17:00',
    maintenanceEndET: '18:00',
    minutesToNextSessionEvent: 0,
    nextSessionEvent: 'globex_open',
    isRTH: false,
    isGlobex: false,
    isMaintenanceBreak: false,
  };
}

function fallbackCalendar(symbol: string, anchorMode: FuturesAnchorMode, horizonDays: number): FuturesCloseCalendarResponse {
  return {
    symbol,
    anchorMode,
    timezone: 'America/New_York',
    horizonDays,
    schedule: [],
    clusters: [],
    timeline: [],
    warnings: ['Data unavailable from current feed'],
  };
}

/** Logs the internal error server-side; the public response only names the part that could not be computed. */
function reportPartFailure(errors: string[], part: 'session' | 'closeCalendar' | 'cashBridge' | 'phantomTime', error: unknown) {
  console.error(`[terminal/futures] ${part} failed`, error);
  errors.push(`${part}: could not be computed`);
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Please log in to use the Futures Terminal' }, { status: 401 });
  }
  if (!hasPaidSessionAccess(session)) {
    return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = normalizeFuturesSymbol(searchParams.get('symbol') || '/ES');
  const anchorMode = parseAnchorMode(searchParams.get('anchorMode'));
  const horizon = parseHorizon(searchParams.get('horizon'));

  const errors: string[] = [];

  let sessionState: FuturesSessionState = fallbackSession(symbol);
  let closeCalendar: FuturesCloseCalendarResponse = fallbackCalendar(symbol, anchorMode, horizon);
  let phantomTime: PhantomTimeState | undefined;
  let cashBridge: CashBridgeState | undefined;

  try {
    sessionState = buildFuturesSessionState(symbol);
  } catch (error) {
    reportPartFailure(errors, 'session', error);
  }

  try {
    closeCalendar = buildFuturesCloseCalendar(symbol, anchorMode, horizon);
  } catch (error) {
    reportPartFailure(errors, 'closeCalendar', error);
  }

  try {
    const bridge = getCashBridge(symbol);
    if (bridge) {
      cashBridge = bridge;
    }
  } catch (error) {
    reportPartFailure(errors, 'cashBridge', error);
  }

  try {
    const phantom = buildPhantomTimeState(symbol);
    if (phantom) {
      phantomTime = phantom;
    }
  } catch (error) {
    reportPartFailure(errors, 'phantomTime', error);
  }

  if (!cashBridge && (symbol === '/ES' || symbol === '/NQ' || symbol === '/YM' || symbol === '/RTY')) {
    errors.push('cashBridge: Data unavailable from current feed');
  }

  if (!cashBridge && !phantomTime) {
    closeCalendar.warnings = Array.from(new Set([...closeCalendar.warnings, getCashBridgeFallbackMessage()]));
  }

  const dataState: FuturesTerminalResponse['dataState'] =
    errors.length === 0 ? 'ready' : (errors.length < 3 ? 'partial' : 'error');

  const response: FuturesTerminalResponse = {
    symbol,
    marketPath: 'futures',
    session: sessionState,
    closeCalendar: toPublicFuturesCloseCalendar(closeCalendar),
    ...(phantomTime ? { phantomTime } : {}),
    ...(cashBridge ? { cashBridge } : {}),
    riskNotice: RISK_NOTICE,
    dataState,
    errors,
  };

  return NextResponse.json(response);
}
