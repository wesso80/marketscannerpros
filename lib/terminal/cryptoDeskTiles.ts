/**
 * Terminal Crypto tab tiles from feeds the Crypto Derivatives desk already reads.
 * Missing readings stay off the tiles. There is no liquidations tile: the public OKX
 * history does not cover 24 hours, and a missing total is never shown as zero.
 */
import { DERIVATIVE_FEED_BASIS } from '@/lib/crypto/derivativeDesk';

export type DeskTile = { label: string; value: string; warning?: boolean };

type Coin = { symbol?: string };

type FundingBody = { meta?: { freshnessStatus?: string }; stale?: boolean; coins?: Array<Coin & { fundingRatePercent?: number }> } | null;
type LongShortBody = { coins?: Array<Coin & { longAccount?: number; shortAccount?: number }> } | null;
type OpenInterestBody = {
  meta?: { freshnessStatus?: string };
  coins?: Array<Coin & { openInterestValue?: number; openInterestFormatted?: string }>;
} | null;

export function coinCode(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  const stripped = upper.replace(/[-/]?(USDT|USDC|USD)$/, '');
  return stripped.length >= 2 ? stripped : upper;
}

function matchCoin<T extends Coin>(coins: T[] | undefined, code: string): T | undefined {
  return coins?.find((coin) => String(coin.symbol || '').toUpperCase() === code);
}

function formatOi(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

export function selectCryptoDeskTiles(
  symbol: string,
  feeds: { funding: FundingBody; longShort: LongShortBody; openInterest: OpenInterestBody },
): { mode: 'tiles'; tiles: DeskTile[]; basis: string | null } | { mode: 'gate' } {
  const code = coinCode(symbol);
  const tiles: DeskTile[] = [];

  const fundingFresh = feeds.funding?.meta?.freshnessStatus === 'fresh' && !feeds.funding?.stale;
  const funding = fundingFresh ? matchCoin(feeds.funding?.coins, code) : undefined;
  if (funding && typeof funding.fundingRatePercent === 'number' && Number.isFinite(funding.fundingRatePercent)) {
    const rate = funding.fundingRatePercent;
    tiles.push({ label: 'Funding', value: `${rate > 0 ? '+' : ''}${rate.toFixed(4)}%` });
  }

  const oiFresh = feeds.openInterest?.meta?.freshnessStatus === 'fresh';
  const oi = oiFresh ? matchCoin(feeds.openInterest?.coins, code) : undefined;
  if (oi) {
    const formatted = typeof oi.openInterestFormatted === 'string' ? oi.openInterestFormatted.trim() : '';
    const raw = oi.openInterestValue;
    const value = formatted || (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? formatOi(raw) : '');
    if (value) tiles.push({ label: 'Open interest', value });
  }

  const ls = matchCoin(feeds.longShort?.coins, code);
  if (ls && typeof ls.longAccount === 'number' && Number.isFinite(ls.longAccount) && typeof ls.shortAccount === 'number' && Number.isFinite(ls.shortAccount)) {
    tiles.push({ label: 'Long/short', value: `${ls.longAccount.toFixed(1)} / ${ls.shortAccount.toFixed(1)}` });
  }

  if (tiles.length === 0) return { mode: 'gate' };
  const complete = tiles.length === 3;
  return { mode: 'tiles', tiles, basis: complete ? DERIVATIVE_FEED_BASIS : null };
}
