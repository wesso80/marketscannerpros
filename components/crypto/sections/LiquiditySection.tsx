import SectionShell from '../SectionShell';
import {COPY} from '../copy';
import type {Section} from '@/lib/crypto/breakdown/types';
export default function LiquiditySection({data}:{data:Section}){return <SectionShell id="liquidity" title={COPY.titles.liquidity} data={data} ></SectionShell>;}
