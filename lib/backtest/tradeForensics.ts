import type { BacktestTrade } from './engine';

export type TradeForensicsInput = {
  entryDate: string;
  exitDate: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  direction?: 'long' | 'short';
  entryTs?: string;
  exitTs?: string;
  entry: number;
  exit: number;
  return: number;
  returnPercent: number;
  mfe?: number;
  mae?: number;
  exitReason?: BacktestTrade['exitReason'];
  holdingPeriodDays: number;
};

export function enrichTradesWithMetadata(
  trades: TradeForensicsInput[],
  dates: string[],
  highs: number[],
  lows: number[],
): BacktestTrade[] {
  const dateToIndex = new Map<string, number>();
  for (let index = 0; index < dates.length; index++) {
    dateToIndex.set(dates[index], index);
  }

  return trades.map((trade) => {
    const entryIdx = dateToIndex.get(trade.entryDate);
    const exitIdx = dateToIndex.get(trade.exitDate);
    const normalizedDirection = trade.direction ?? (trade.side === 'SHORT' ? 'short' : 'long');

    if (entryIdx == null || exitIdx == null || exitIdx < entryIdx) {
      return {
        ...trade,
        direction: normalizedDirection,
        entryTs: trade.entryTs ?? trade.entryDate,
        exitTs: trade.exitTs ?? trade.exitDate,
      };
    }

    const tradeHigh = Math.max(...highs.slice(entryIdx, exitIdx + 1));
    const tradeLow = Math.min(...lows.slice(entryIdx, exitIdx + 1));

    const mfe = normalizedDirection === 'short'
      ? ((trade.entry - tradeLow) / trade.entry) * 100
      : ((tradeHigh - trade.entry) / trade.entry) * 100;

    const mae = normalizedDirection === 'short'
      ? ((trade.entry - tradeHigh) / trade.entry) * 100
      : ((tradeLow - trade.entry) / trade.entry) * 100;

    return {
      ...trade,
      direction: normalizedDirection,
      entryTs: trade.entryTs ?? trade.entryDate,
      exitTs: trade.exitTs ?? trade.exitDate,
      mfe,
      mae,
    };
  });
}