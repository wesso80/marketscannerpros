export type FuturesExchange = 'CME' | 'NYMEX' | 'COMEX' | 'CBOT';

export type FuturesSessionState = {
  symbol: string;
  exchange: FuturesExchange;
  currentSession:
    | 'globex_overnight'
    | 'pre_rth'
    | 'rth'
    | 'post_rth'
    | 'maintenance_break'
    | 'closed';
  timezone: 'America/New_York';
  sessionOpenET: string;
  sessionCloseET: string;
  maintenanceStartET: string;
  maintenanceEndET: string;
  minutesToNextSessionEvent: number;
  nextSessionEvent:
    | 'globex_open'
    | 'rth_open'
    | 'rth_close'
    | 'maintenance_start'
    | 'maintenance_end';
  isRTH: boolean;
  isGlobex: boolean;
  isMaintenanceBreak: boolean;
};

type SessionPhase = FuturesSessionState['currentSession'];

const INDEX_ROOTS = new Set(['/ES', '/MES', '/NQ', '/MNQ']);
const ENERGY_ROOTS = new Set(['/CL', '/MCL']);
const METAL_ROOTS = new Set(['/GC', '/MGC', '/SI']);
const CBOT_ROOTS = new Set(['/YM', '/RTY', '/M2K']);

function normalizeFutureSymbol(symbol: string): string {
  const upper = symbol.toUpperCase().trim();
  return upper.startsWith('/') ? upper : `/${upper}`;
}

function inferExchange(symbol: string): FuturesExchange {
  const normalized = normalizeFutureSymbol(symbol);
  if (ENERGY_ROOTS.has(normalized)) return 'NYMEX';
  if (METAL_ROOTS.has(normalized)) return 'COMEX';
  if (CBOT_ROOTS.has(normalized)) return 'CBOT';
  if (INDEX_ROOTS.has(normalized)) return 'CME';
  return 'CME';
}

function getEtParts(date: Date): { weekday: number; hour: number; minute: number } {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const weekdayToken = formatted.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(formatted.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(formatted.find((p) => p.type === 'minute')?.value ?? '0');

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    weekday: weekdayMap[weekdayToken] ?? 0,
    hour,
    minute,
  };
}

function etMinuteOfDay(date: Date): number {
  const parts = getEtParts(date);
  return parts.hour * 60 + parts.minute;
}

function classifySession(date: Date): SessionPhase {
  const { weekday } = getEtParts(date);
  const minute = etMinuteOfDay(date);

  // Friday 17:00 ET through Sunday 18:00 ET is closed.
  if (weekday === 6) return 'closed';
  if (weekday === 0 && minute < 18 * 60) return 'closed';
  if (weekday === 5 && minute >= 17 * 60) return 'closed';

  const preRthStart = 8 * 60 + 30;
  const rthStart = 9 * 60 + 30;
  const rthEnd = 16 * 60;
  const maintenanceStart = 17 * 60;
  const maintenanceEnd = 18 * 60;

  if (weekday >= 1 && weekday <= 5) {
    if (minute >= maintenanceStart && minute < maintenanceEnd) {
      // Friday 17:00+ is already returned as closed above.
      return 'maintenance_break';
    }
    if (minute >= rthStart && minute < rthEnd) return 'rth';
    if (minute >= preRthStart && minute < rthStart) return 'pre_rth';
    if (minute >= rthEnd && minute < maintenanceStart) return 'post_rth';
    return 'globex_overnight';
  }

  return 'globex_overnight';
}

function transitionToEvent(current: SessionPhase, next: SessionPhase): FuturesSessionState['nextSessionEvent'] {
  if (next === 'rth') return 'rth_open';
  if (current === 'rth' && next === 'post_rth') return 'rth_close';
  if (next === 'maintenance_break') return 'maintenance_start';
  if (current === 'maintenance_break' && next === 'globex_overnight') return 'maintenance_end';
  if (next === 'globex_overnight') return 'globex_open';

  // Fallback for unusual transitions.
  return 'globex_open';
}

function findNextEvent(now: Date): {
  minutesToNextSessionEvent: number;
  nextSessionEvent: FuturesSessionState['nextSessionEvent'];
} {
  const current = classifySession(now);
  const maxLookaheadMinutes = 8 * 24 * 60;

  for (let i = 1; i <= maxLookaheadMinutes; i += 1) {
    const probe = new Date(now.getTime() + i * 60_000);
    const phase = classifySession(probe);
    if (phase !== current) {
      return {
        minutesToNextSessionEvent: i,
        nextSessionEvent: transitionToEvent(current, phase),
      };
    }
  }

  return {
    minutesToNextSessionEvent: maxLookaheadMinutes,
    nextSessionEvent: 'globex_open',
  };
}

export function buildFuturesSessionState(symbol: string, now: Date = new Date()): FuturesSessionState {
  const currentSession = classifySession(now);
  const next = findNextEvent(now);

  return {
    symbol: normalizeFutureSymbol(symbol),
    exchange: inferExchange(symbol),
    currentSession,
    timezone: 'America/New_York',
    sessionOpenET: '18:00',
    sessionCloseET: '17:00',
    maintenanceStartET: '17:00',
    maintenanceEndET: '18:00',
    minutesToNextSessionEvent: next.minutesToNextSessionEvent,
    nextSessionEvent: next.nextSessionEvent,
    isRTH: currentSession === 'rth',
    isGlobex: currentSession === 'globex_overnight' || currentSession === 'pre_rth' || currentSession === 'post_rth',
    isMaintenanceBreak: currentSession === 'maintenance_break',
  };
}
