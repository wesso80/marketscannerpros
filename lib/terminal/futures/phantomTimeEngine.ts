import { getCashBridge, type CashBridgeState } from '@/lib/terminal/futures/cashBridgeMap';
import { buildFuturesSessionState } from '@/lib/terminal/futures/futuresSessionEngine';

export type PhantomTimeState = {
  symbol: string;
  bridgeSymbol: string;
  cashIndexSymbol: string;
  phantomZone:
    | 'pre_market_bridge'
    | 'post_close_bridge'
    | 'pure_futures'
    | 'cash_session'
    | 'maintenance_break';
  activeInstruments: string[];
  inactiveInstruments: string[];
  phantomChargeScore: number;
  overnightRangeBuilt: boolean;
  cashGapRisk: 'low' | 'moderate' | 'high' | 'extreme';
  interpretation: string;
};

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
  const { hour, minute } = getEtParts(date);
  return hour * 60 + minute;
}

function classifyPhantomZone(date: Date): PhantomTimeState['phantomZone'] {
  const { weekday } = getEtParts(date);
  const minute = etMinuteOfDay(date);

  if (minute >= 17 * 60 && minute < 18 * 60 && weekday >= 1 && weekday <= 5) {
    return 'maintenance_break';
  }

  const isWeekday = weekday >= 1 && weekday <= 5;
  if (isWeekday && minute >= 9 * 60 + 30 && minute < 16 * 60) {
    return 'cash_session';
  }
  if (isWeekday && minute >= 4 * 60 && minute < 9 * 60 + 30) {
    return 'pre_market_bridge';
  }
  if (isWeekday && minute >= 16 * 60 && minute < 20 * 60) {
    return 'post_close_bridge';
  }

  return 'pure_futures';
}

function scoreFromZone(zone: PhantomTimeState['phantomZone'], sessionActive: boolean): number {
  if (!sessionActive) return 0;
  switch (zone) {
    case 'cash_session':
      return 20;
    case 'pre_market_bridge':
      return 72;
    case 'post_close_bridge':
      return 68;
    case 'pure_futures':
      return 84;
    case 'maintenance_break':
      return 12;
    default:
      return 30;
  }
}

function toGapRisk(score: number): PhantomTimeState['cashGapRisk'] {
  if (score >= 80) return 'extreme';
  if (score >= 65) return 'high';
  if (score >= 45) return 'moderate';
  return 'low';
}

function buildInterpretation(bridge: CashBridgeState, zone: PhantomTimeState['phantomZone']): string {
  if (zone === 'maintenance_break') {
    return `${bridge.future} is in maintenance break. Market observation is limited until Globex resumes.`;
  }
  if (zone === 'cash_session') {
    return `${bridge.future}, ${bridge.etf}, and ${bridge.cashIndex} are in overlapping cash-session context. Observe alignment and confluence instead of directional assumptions.`;
  }
  if (zone === 'pre_market_bridge') {
    return `${bridge.future} and ${bridge.etf} are active while ${bridge.cashIndex} is offline. Futures can build phantom structure that may appear at the next cash open.`;
  }
  if (zone === 'post_close_bridge') {
    return `${bridge.future} and ${bridge.etf} remain active after ${bridge.cashIndex} closes. This can carry structure into the next timing window.`;
  }
  return `${bridge.future} is carrying overnight structure while cash-index instruments are mostly inactive. Use this as setup context, not execution advice.`;
}

export function buildPhantomTimeState(symbol: string, now: Date = new Date()): PhantomTimeState | null {
  const bridge = getCashBridge(symbol);
  if (!bridge) return null;

  const session = buildFuturesSessionState(symbol, now);
  const zone = classifyPhantomZone(now);

  const activeInstruments: string[] = [];
  const inactiveInstruments: string[] = [];

  if (zone === 'cash_session') {
    activeInstruments.push(bridge.future, bridge.etf, bridge.cashIndex);
  } else if (zone === 'pre_market_bridge' || zone === 'post_close_bridge') {
    activeInstruments.push(bridge.future, bridge.etf);
    inactiveInstruments.push(bridge.cashIndex);
  } else if (zone === 'maintenance_break') {
    inactiveInstruments.push(bridge.future, bridge.etf, bridge.cashIndex);
  } else {
    if (session.currentSession === 'closed') {
      inactiveInstruments.push(bridge.future, bridge.etf, bridge.cashIndex);
    } else {
      activeInstruments.push(bridge.future);
      inactiveInstruments.push(bridge.etf, bridge.cashIndex);
    }
  }

  const phantomChargeScore = scoreFromZone(zone, session.currentSession !== 'closed');

  return {
    symbol: bridge.future,
    bridgeSymbol: bridge.etf,
    cashIndexSymbol: bridge.cashIndex,
    phantomZone: zone,
    activeInstruments,
    inactiveInstruments,
    phantomChargeScore,
    overnightRangeBuilt: zone === 'pure_futures' || zone === 'pre_market_bridge',
    cashGapRisk: toGapRisk(phantomChargeScore),
    interpretation: buildInterpretation(bridge, zone),
  };
}
