import SectionShell from '../SectionShell';
import {COPY} from '../copy';
import type {Section} from '@/lib/crypto/breakdown/types';
export default function RuleCheckSection({data}:{data:Section}){return <SectionShell id="ruleCheck" title={COPY.titles.ruleCheck} data={data} collapsible={false}></SectionShell>;}
