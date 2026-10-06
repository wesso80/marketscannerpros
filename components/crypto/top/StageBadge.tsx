import {symbolVerdictLabel} from '@/lib/presentation/symbolDisplay';
import {type TopRule} from '@/lib/crypto/breakdown/top';
/** Visible text is a reader label. Colour and data-engine-stage keep the raw stage. */
export default function StageBadge({stage}:{stage:TopRule['stage']|string}){return <span data-stage-badge data-engine-stage={stage} className="max-w-full break-words rounded-full border px-3 py-1 text-sm font-semibold" style={{color:stage==='FELL BACK'?'var(--msp-bear)':'var(--msp-warn)',borderColor:'currentColor'}}>{symbolVerdictLabel(stage)}</span>;}
