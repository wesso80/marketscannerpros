import SectionShell from '../SectionShell';
import {COPY} from '../copy';
import type {Section} from '@/lib/crypto/breakdown/types';
export default function LevelsSection({data}:{data:Section}){return <SectionShell id="levels" title={COPY.titles.levels} data={data} ></SectionShell>;}
