import {STAGE_TONE,type TopRule} from '@/lib/crypto/breakdown/top';
export default function StageBadge({stage}:{stage:TopRule['stage']}){return <span data-stage-badge className="max-w-full break-words rounded-full border px-3 py-1 text-sm font-semibold" style={{color:STAGE_TONE[stage],borderColor:'currentColor'}}>{stage}</span>;}
