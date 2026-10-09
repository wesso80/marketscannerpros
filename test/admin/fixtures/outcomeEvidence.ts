import type {EvidenceRecord} from '@/lib/admin/verifiedOutcomes';
export const evidence=():EvidenceRecord=>{
 const e={direction:'LONG',signalAt:'2026-10-01T12:00:00Z',entryPrice:100,observedPrice:102,observedAt:'2026-10-02T12:00:00Z',processedAt:'2026-10-02T12:03:00Z',outcome:'correct',pctMove:2};
 return {...e,provenance:{...e,writer:'label-ai-outcomes',method:'first-completed-close-v1',horizon:'24h',thresholdPct:1,barSource:'intraday'}};
};
