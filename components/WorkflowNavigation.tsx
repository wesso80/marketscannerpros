'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { areaLinks, primaryNavTools, workflowArea } from '@/lib/toolWorkflows';
import { parseResearchAsset, parseResearchTimeframe, researchHref } from '@/lib/researchContext';

export default function WorkflowNavigation() {
  const pathname = usePathname();
  const params = useSearchParams();
  const area = workflowArea(pathname, params.get('tab') || '');
  if (!area) return null;
  const symbol = params.get('symbol');
  return <nav aria-label={`${primaryNavTools.find((item) => item.id === area)?.label} tools`} className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/80 px-3 py-2 text-xs">
    <span className="mr-1 font-semibold text-slate-400">{primaryNavTools.find((item) => item.id === area)?.label}</span>
    {areaLinks[area].map((item) => {
      const [path, query = ''] = item.href.split('?');
      const tab = new URLSearchParams(query).get('tab');
      const active = pathname === path && (!tab || params.get('tab') === tab);
      const href = symbol && (area === 'research' || area === 'backtest') ? researchHref(item.href, symbol, { assetType: parseResearchAsset(params.get('type')), timeframe: parseResearchTimeframe(params.get('timeframe')) }) : item.href;
      return <Link key={item.href} href={href} aria-current={active ? 'page' : undefined} className={`rounded-md px-2 py-1 ${active ? 'bg-teal-500/15 text-teal-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>{item.label}</Link>;
    })}
    <Link href="/tools" className="ml-auto px-2 py-1 text-slate-400 hover:text-white">Find a tool</Link>
  </nav>;
}
