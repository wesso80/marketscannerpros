/**
 * Server-side mark for ONE recorded option contract (per-share premium), shared by
 * /api/journal/option-quote (Journal marks and Portfolio) and the journal auto-close job.
 *
 * Source: the Alpha Vantage chain via fetchOptionsChain (REALTIME_OPTIONS when entitled and quoted,
 * otherwise HISTORICAL_OPTIONS = previous-session EOD). A contract that is not in the chain, is
 * unpriced, or is not from the current/previous session is ok:false with a reason. It never falls
 * back to the underlying's price or the entry price.
 */
import { fetchOptionsChain } from '@/lib/options-confluence-analyzer';
import { findOptionContractMark, isOptionMarkCurrent, type OptionContractSpec } from '@/lib/options/contractQuote';

type Chain = Awaited<ReturnType<typeof fetchOptionsChain>>;

export type OptionContractMarkResult =
  | {
      ok: true;
      price: number;
      priceField: 'mark' | 'mid' | 'last';
      asOfDate: string | null;
      basis: 'REALTIME' | 'EOD';
      source: string;
      contractId: string | null;
    }
  | { ok: false; reason: 'contract_not_found' | 'stale_quote' | 'provider_error'; asOfDate?: string | null };

// EOD chains change once a session; cache per underlying+expiry so repeated marks don't spend AV calls.
const CHAIN_TTL_MS = 10 * 60_000;
const MISS_TTL_MS = 2 * 60_000;
const chainCache = new Map<string, { chain: Chain; expires: number }>();

async function getChain(underlying: string, expiration: string): Promise<Chain> {
  const key = `${underlying}|${expiration}`;
  const hit = chainCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.chain;
  const chain = await fetchOptionsChain(underlying, expiration);
  chainCache.set(key, { chain, expires: Date.now() + (chain ? CHAIN_TTL_MS : MISS_TTL_MS) });
  if (chainCache.size > 500) chainCache.delete(chainCache.keys().next().value as string);
  return chain;
}

export async function fetchOptionContractMark(spec: OptionContractSpec): Promise<OptionContractMarkResult> {
  let chain: Chain;
  try {
    chain = await getChain(spec.underlying, spec.expiration);
  } catch (error) {
    console.warn('[options/contractMark] chain fetch failed:', error instanceof Error ? error.message : error);
    return { ok: false, reason: 'provider_error' };
  }
  // fetchOptionsChain falls back to another expiry when the requested one is absent — that is not this contract.
  if (!chain || chain.selectedExpiry !== spec.expiration) return { ok: false, reason: 'contract_not_found' };
  const mark = findOptionContractMark(spec.right === 'call' ? chain.calls : chain.puts, spec);
  if (!mark) return { ok: false, reason: 'contract_not_found' };
  const asOfDate = mark.asOfDate ?? chain.dataDate;
  if (!isOptionMarkCurrent(asOfDate)) return { ok: false, reason: 'stale_quote', asOfDate };
  return {
    ok: true,
    price: mark.price,
    priceField: mark.priceField,
    asOfDate,
    basis: chain.freshness,
    source: chain.sourceFunction,
    contractId: mark.contractId,
  };
}
