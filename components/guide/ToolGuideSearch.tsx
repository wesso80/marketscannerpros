'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ToolGuide } from '@/lib/guides/toolGuides';
import { primaryNavTools, workflowArea } from '@/lib/toolWorkflows';

const references: ToolGuide[] = [
  { route: '/intelligence', badge: 'Intelligence', title: 'Intelligence overview', summary: 'Macro evidence, coverage and source limitations.', steps: ['Open the overview to review current evidence.', 'Expand a panel to inspect its supporting observations.'], tips: ['Check observation dates before comparing readings.'] },
  { route: '/guide/open-interest', badge: 'Learn', title: 'How to Read Open Interest', summary: 'Open-interest definitions and interpretation.', steps: ['Read the definitions and worked examples.'], tips: ['Compare the same expiry and contract when checking providers.'] },
];

export default function ToolGuideSearch({ guides }: { guides: ToolGuide[] }) {
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const matches = [...guides, ...references].filter(guide => [guide.title, guide.badge, guide.summary, ...guide.steps, ...guide.tips].join(' ').toLowerCase().includes(term));
  const groupFor = (route: string) => {
    const [pathname, search] = route.split('?');
    return workflowArea(pathname, new URLSearchParams(search).get('tab') ?? '') ?? 'scan';
  };
  return <section aria-label="Tool guides" className="space-y-3">
    <label className="block text-sm font-semibold">Search guides
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tool, topic or task" className="mt-2 block min-h-11 w-full rounded-lg border border-msp-border bg-msp-card px-3 text-sm" />
    </label>
    <p role="status" className="text-xs text-msp-text-muted">{matches.length} guides{term ? ' match your search' : ' across seven menu groups'}</p>
    {primaryNavTools.map(group => {
      const rows = matches.filter(guide => groupFor(guide.route) === group.id);
      if (term && !rows.length) return null;
      return <details key={`${group.id}-${term}`} open={term ? true : undefined} className="rounded-lg border border-msp-border bg-msp-card p-3">
        <summary className="min-h-8 cursor-pointer text-sm font-semibold">{group.label} <span className="font-normal text-msp-text-muted">· {rows.length}</span></summary>
        <div className="mt-2 space-y-2">{rows.map(guide => <details key={`${guide.route}-${guide.title}`} className="rounded border border-msp-border p-3">
          <summary className="cursor-pointer text-sm font-medium">{guide.title}</summary>
          <p className="mt-2 text-sm text-msp-text-muted">{guide.summary}</p>
          <h3 className="mt-3 text-sm font-semibold">How to use it</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-msp-text-muted">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol>
          <h3 className="mt-3 text-sm font-semibold">Pro tips</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-msp-text-muted">{guide.tips.map(tip => <li key={tip}>{tip}</li>)}</ul>
          <Link href={guide.route} className="mt-2 inline-flex min-h-10 items-center text-sm text-msp-accent">Open {guide.title} →</Link>
        </details>)}</div>
      </details>;
    })}
  </section>;
}
