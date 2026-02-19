import type { BacktestTrade } from './engine';

export function enrichTradesWithMetadata(
  trades: BacktestTrade[],
  dates: string[],
  highs: number[],
  lows: number[],
): BacktestTrade[] {
  if (!trades.length || !dates.length || !highs.length || !lows.length) {
    return trades;
  }

  const dateIndex = new Map<string, number>();
  for (let i = 0; i < dates.length; i++) {
    dateIndex.set(dates[i], i);
  }

  return trades.map((trade) => {
    const entryIdx = dateIndex.get(trade.entryDate);
    const exitIdx = dateIndex.get(trade.exitDate);

    if (entryIdx === undefined || exitIdx === undefined || entryIdx > exitIdx) {
      return trade;
    }

    const tradeHigh = Math.max(...highs.slice(entryIdx, exitIdx + 1));
    const tradeLow = Math.min(...lows.slice(entryIdx, exitIdx + 1));

    const rawMfe = trade.side === 'LONG'
      ? ((tradeHigh - trade.entry) / trade.entry) * 100
      : ((trade.entry - tradeLow) / trade.entry) * 100;

    const rawMae = trade.side === 'LONG'
      ? ((tradeLow - trade.entry) / trade.entry) * 100
      : ((trade.entry - tradeHigh) / trade.entry) * 100;

    return {
      ...trade,
      mfe: Math.max(0, rawMfe),
      mae: Math.min(0, rawMae),
    };
  });
}
