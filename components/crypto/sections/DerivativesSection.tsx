import SectionShell from '../SectionShell';
import {COPY} from '../copy';
import type {Section} from '@/lib/crypto/breakdown/types';
import Link from 'next/link';
export default function DerivativesSection({data}:{data:Section}){return <SectionShell id="derivatives" title={COPY.titles.derivatives} data={data}><Link className="text-sky-300 underline" href="/tools/crypto-dashboard">{COPY.marketWide}</Link></SectionShell>;}
