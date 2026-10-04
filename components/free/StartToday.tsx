'use client';
import Link from 'next/link';
import SavedPicks from './SavedPicks';
import RadarPreview from './RadarPreview';
import DemoScan from './DemoScan';
import { FREE_COPY } from './copy';
export default function StartToday() { return <main className="mx-auto max-w-5xl space-y-4 p-4"><h1 className="text-2xl font-semibold">{FREE_COPY.today}</h1><div className="grid min-w-0 gap-4 md:grid-cols-[2fr_1fr]"><SavedPicks /><RadarPreview /></div><DemoScan /><Link href="/tools/command-center" className="inline-flex min-h-10 items-center underline">{FREE_COPY.overview}</Link></main>; }
