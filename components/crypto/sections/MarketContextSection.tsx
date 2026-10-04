import SectionShell from '../SectionShell';
import {COPY} from '../copy';
import type {Section} from '@/lib/crypto/breakdown/types';
export default function MarketContextSection({data}:{data:Section}){return <SectionShell id="marketContext" title={COPY.titles.marketContext} data={data} ></SectionShell>;}
