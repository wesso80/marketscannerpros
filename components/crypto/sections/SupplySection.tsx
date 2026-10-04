import SectionShell from '../SectionShell';
import {COPY} from '../copy';
import type {Section} from '@/lib/crypto/breakdown/types';
export default function SupplySection({data}:{data:Section}){return <SectionShell id="supply" title={COPY.titles.supply} data={data} ></SectionShell>;}
