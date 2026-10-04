import SectionShell from '../SectionShell';
import {COPY} from '../copy';
import type {Section} from '@/lib/crypto/breakdown/types';
export default function SourcesBadge({data}:{data:Section}){return <SectionShell id="sourcesCheck" title={COPY.titles.sourcesCheck} data={data} ></SectionShell>;}
