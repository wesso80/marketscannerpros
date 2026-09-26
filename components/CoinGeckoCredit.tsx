/** CoinGecko paid-plan attribution (BP-5): "Data provided by CoinGecko" linked to the CoinGecko API page. */
export const COINGECKO_ATTRIBUTION_URL = 'https://www.coingecko.com/en/api';

export default function CoinGeckoCredit({ detail, className = '' }: { detail?: string; className?: string }) {
  return (
    <p className={`text-[11px] text-slate-500 ${className}`}>
      <a href={COINGECKO_ATTRIBUTION_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">
        Data provided by CoinGecko
      </a>
      {detail ? <span> · {detail}</span> : null}
    </p>
  );
}
