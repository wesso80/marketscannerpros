import CoinGeckoAttribution from '@/components/CoinGeckoAttribution';

/** Existing call sites keep this name. The visible credit is CoinGeckoAttribution. */
export default function CoinGeckoCredit({ detail, className = '' }: { detail?: string; className?: string }) {
  return (
    <div className={className}>
      <CoinGeckoAttribution />
      {detail ? <p className="text-[14px] leading-snug text-slate-400">{detail}</p> : null}
    </div>
  );
}
