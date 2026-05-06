// Broker factory. Only 'paper' is wired right now. Adding 'tradovate' or
// 'ibkr' here later requires also enabling TRADE_BROKER_LIVE_OPT_IN=true.

import { PaperBroker } from './paperBroker';
import type { BrokerAdapter } from './types';

let cached: BrokerAdapter | null = null;

export function getBroker(): BrokerAdapter {
  if (cached) return cached;
  const choice = (process.env.TRADE_BROKER ?? 'paper').toLowerCase();
  switch (choice) {
    case 'paper':
      cached = new PaperBroker();
      break;
    default:
      // Refuse to silently degrade to paper — surface the misconfig.
      throw new Error(
        `Unsupported TRADE_BROKER="${choice}". Only "paper" is implemented.`
      );
  }
  return cached;
}

export type * from './types';
