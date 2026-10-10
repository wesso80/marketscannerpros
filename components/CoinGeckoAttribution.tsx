/** CoinGecko commercial-plan attribution. 14px is above 13px and above 10pt. */
export const COINGECKO_ATTRIBUTION_URL = 'https://www.coingecko.com/en/api';
export const COINGECKO_ATTRIBUTION_TEXT = 'Data provided by CoinGecko';

export function coinGeckoAttributionHtml(): string {
  return `<p style="font-size:14px;line-height:1.4;margin:12px 0 0;"><a href="${COINGECKO_ATTRIBUTION_URL}" target="_blank" rel="noopener noreferrer" style="color:#94a3b8;">${COINGECKO_ATTRIBUTION_TEXT}</a></p>`;
}

export function coinGeckoAttributionText(): string {
  return `${COINGECKO_ATTRIBUTION_TEXT}: ${COINGECKO_ATTRIBUTION_URL}`;
}

export default function CoinGeckoAttribution({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[14px] leading-snug text-slate-400 ${className}`}>
      <a
        href={COINGECKO_ATTRIBUTION_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-slate-200"
      >
        {COINGECKO_ATTRIBUTION_TEXT}
      </a>
    </p>
  );
}
