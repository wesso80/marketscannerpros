import SectionShell from '../SectionShell';
import {COPY} from '../copy';
import type {Section} from '@/lib/crypto/breakdown/types';
import RuleStatusTable from '../RuleStatusTable';
export default function EarlyContextSection({data}:{data:Section}){return <SectionShell id="earlyContext" title={COPY.titles.earlyContext} data={data}><RuleStatusTable/></SectionShell>;}
