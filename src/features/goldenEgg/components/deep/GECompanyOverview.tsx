import type { DeepAnalysisData } from '@/src/features/goldenEgg/types';

type Props = { company: NonNullable<DeepAnalysisData['company']>; price?: number | null };

function fmt(n: string | number | null | undefined, prefix = '') {
  if (n == null) return '—';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '—';
  if (num >= 1e12) return `${prefix}${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `${prefix}${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${prefix}${(num / 1e6).toFixed(2)}M`;
  return `${prefix}${num.toLocaleString()}`;
}

export default function GECompanyOverview({ company, price }: Props) {
  const totalAnalysts = company.strongBuy + company.buy + company.hold + company.sell + company.strongSell;
  const buyPct = totalAnalysts > 0 ? ((company.strongBuy + company.buy) / totalAnalysts) * 100 : 0;
  const holdPct = totalAnalysts > 0 ? (company.hold / totalAnalysts) * 100 : 0;
  const sellPct = totalAnalysts > 0 ? ((company.sell + company.strongSell) / totalAnalysts) * 100 : 0;

  const stats = [
    { label: 'Market Cap', value: fmt(company.marketCap, '$') },
    { label: 'P/E Ratio', value: company.peRatio?.toFixed(1) ?? '—' },
    { label: 'Forward P/E', value: company.forwardPE?.toFixed(1) ?? '—' },
    { label: 'EPS', value: company.eps != null ? `$${company.eps.toFixed(2)}` : '—' },
    { label: 'Div Yield', value: company.dividendYield != null ? `${company.dividendYield.toFixed(2)}%` : '—' },
    { label: '52W Range', value: company.week52Low != null && company.week52High != null ? `$${company.week52Low.toFixed(2)} – $${company.week52High.toFixed(2)}` : '—' },
  ];

  // 52-week position bar
  const w52Pct = price && company.week52Low != null && company.week52High != null && company.week52High > company.week52Low
    ? ((price - company.week52Low) / (company.week52High - company.week52Low)) * 100
    : null;

  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-5">
      <div className="mb-4 flex items-center gap-2 border-b border-white/5 pb-3">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400">Company Overview</h2>
      </div>

      <h3 className="text-lg font-bold text-white">{company.name}</h3>
      <p className="mt-1 text-xs text-slate-400">{company.sector} · {company.industry}</p>
      {company.description && (
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-300">{company.description}</p>
      )}

      {/* Stats grid */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{s.label}</div>
            <div className="text-sm font-semibold text-white">{s.value}</div>
          </div>
        ))}
      </div>

      {/* 52-week position */}
      {w52Pct != null && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[10px] text-slate-500">
            <span>52W Low ${company.week52Low?.toFixed(2)}</span>
            <span>52W High ${company.week52High?.toFixed(2)}</span>
          </div>
          <div className="relative h-2 rounded-full bg-white/10">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500"
              style={{ width: `${Math.max(2, Math.min(100, w52Pct))}%` }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-amber-400"
              style={{ left: `${Math.max(2, Math.min(98, w52Pct))}%` }}
            />
          </div>
        </div>
      )}

      {/* Analyst target */}
      {company.targetPrice != null && price != null && (
        <div className="mt-3 text-sm text-slate-300">
          Analyst Target: <span className="font-semibold text-white">${company.targetPrice.toFixed(2)}</span>
          <span className={`ml-2 text-xs ${company.targetPrice > price ? 'text-emerald-400' : 'text-rose-400'}`}>
            ({company.targetPrice > price ? '+' : ''}{(((company.targetPrice - price) / price) * 100).toFixed(1)}%)
          </span>
        </div>
      )}

      {/* Analyst ratings bar */}
      {totalAnalysts > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Analyst Consensus ({totalAnalysts} analysts)
          </div>
          <div className="flex h-3 overflow-hidden rounded-full">
            <div className="bg-emerald-500" style={{ width: `${buyPct}%` }} />
            <div className="bg-amber-400" style={{ width: `${holdPct}%` }} />
            <div className="bg-rose-500" style={{ width: `${sellPct}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span className="text-emerald-400">Buy {company.strongBuy + company.buy}</span>
            <span className="text-amber-400">Hold {company.hold}</span>
            <span className="text-rose-400">Sell {company.sell + company.strongSell}</span>
          </div>
        </div>
      )}
    </div>
  );
}
