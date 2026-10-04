import SectionShell from '../SectionShell';
import {COPY} from '../copy';
import type {Section} from '@/lib/crypto/breakdown/types';
import RuleStatusTable from '../RuleStatusTable';
export default function RisksSection({data}:{data:Section}){return <SectionShell id="risks" title={COPY.titles.risks} data={data} ><RuleStatusTable/></SectionShell>;}
