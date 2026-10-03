import {NextResponse} from 'next/server';
/**
 * Reversible kill switch for admin Crypto Markets scheduled and click-to-spend work.
 * It is checked only at those entry points. It does not touch the worker scheduler, public ingestion,
 * user-facing pages or APIs, equity or public crons, or emails to users.
 *
 * CRYPTO_MARKETS_PAUSED defaults off. Unset, empty, false, 0, no, and off leave every job as it is.
 * true, 1, yes, or on skips scans, CoinGecko refreshes, Jev/AI Gateway stamps, setup and ops emails,
 * paper entries, and the in-cron history batch. Stored Redis keys, database rows, and paper ledgers
 * are not deleted or rewritten by the skip itself.
 *
 * Paper exit checks stay on. They read Coinbase and OKX public quotes and candles, then the simulated
 * ledger. They do not call CoinGecko or Jev. Set CRYPTO_MARKETS_PAUSE_EXITS=true as well to freeze
 * those checks. That second flag does nothing unless the main flag is on, so exits cannot stop while
 * scans are still spending. While exits are frozen, open simulated stops, targets, and time stops are
 * not applied until both flags are cleared.
 */
const ON = new Set(['1', 'true', 'yes', 'on']);

export function envFlagOn(name: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return ON.has((env[name] ?? '').trim().toLowerCase());
}

export function cryptoMarketsPaused(env: NodeJS.ProcessEnv = process.env): boolean {
  return envFlagOn('CRYPTO_MARKETS_PAUSED', env);
}

export function cryptoMarketsExitsPaused(env: NodeJS.ProcessEnv = process.env): boolean {
  return cryptoMarketsPaused(env) && envFlagOn('CRYPTO_MARKETS_PAUSE_EXITS', env);
}

export const CRYPTO_MARKETS_PAUSED_MESSAGE =
  'Crypto Markets background work is paused (CRYPTO_MARKETS_PAUSED=true). Scans, CoinGecko refresh, Jev calls, setup emails, and paper entries are skipped. Stored scans, Redis keys, and paper ledgers are unchanged. Paper exit checks keep running on Coinbase and OKX quotes unless CRYPTO_MARKETS_PAUSE_EXITS=true.';

export function pausedCryptoMarketsBody(extra: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    paused: true as const,
    skipped: true as const,
    reason: 'crypto_markets_paused' as const,
    message: CRYPTO_MARKETS_PAUSED_MESSAGE,
    ...extra,
  };
}

export function pausedCryptoMarketsResponse(extra: Record<string, unknown> = {}) {
  return NextResponse.json(pausedCryptoMarketsBody(extra), {status: 200, headers: {'Cache-Control': 'no-store'}});
}

export function cryptoMarketsPauseBanner() {
  const paused = cryptoMarketsPaused();
  return {
    paused,
    exitsPaused: cryptoMarketsExitsPaused(),
    pauseMessage: paused ? CRYPTO_MARKETS_PAUSED_MESSAGE : null,
  };
}
