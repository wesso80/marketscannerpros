import { expectancyScoreBoost, profileFromRow } from './expectancy';
import { evidenceStatus, type EvidenceRecord } from './verifiedOutcomes';
export interface ShadowRow {
 id:string; symbol_match:boolean; playbook_match:boolean; signed_move:string|number;
 outcome:string; signal_at:string; provenance_evidence?:EvidenceRecord;
}
function profile(rows:ShadowRow[]) {
 let wins=0,losses=0,total=0,grossWin=0,grossLoss=0;
 for(const row of rows){
  if(row.outcome==='correct')wins++;if(row.outcome==='wrong')losses++;
  // pct_move_24h is NUMERIC(10,4); integer accumulation preserves SQL decimal sums.
  const move=Math.round(Number(row.signed_move)*10000);total+=move;grossWin+=Math.max(move,0);grossLoss+=Math.min(move,0);
 }
 return rows.length ? profileFromRow({sample:rows.length,wins,losses,total_move:total/10000,gross_win:grossWin/10000,gross_loss:grossLoss/10000}) : profileFromRow(null);
}
function scenario(rows:ShadowRow[],baseScore:number|null) {
 const symbol=profile(rows.filter(r=>r.symbol_match)),playbook=profile(rows.filter(r=>r.playbook_match));
 const weight=symbol.sample+playbook.sample;
 const blended=weight ? (symbol.avgMovePct*symbol.sample+playbook.avgMovePct*playbook.sample)/weight : 0;
 const eligibilitySample=Math.max(symbol.sample,playbook.sample);
 const boost=expectancyScoreBoost(blended,eligibilitySample);
 return {symbol,playbook,uniqueRecords:rows.length,overlap:rows.filter(r=>r.symbol_match&&r.playbook_match).length,
 eligibilitySample,blendedAvgMovePct:Math.round(blended*100)/100,scoreBoost:Math.round(boost*10)/10,
 hypotheticalEliteScore:baseScore==null?null:Math.max(0,Math.min(100,Math.round((baseScore+boost)*10)/10))};
}
export function compareExpectancy(rows:ShadowRow[],baseScore:number|null) {
 const provenance={total:rows.length,verified:0,unknown:0,inconsistent:0};
 const verifiedRows=rows.filter(row=>{const status=evidenceStatus(row.provenance_evidence);provenance[status]++;return status==='verified';});
 const current=scenario(rows,baseScore),verified=scenario(verifiedRows,baseScore);
 return {provenance,current,verified,baseScore,
  scoreBoostDelta:Math.round((verified.scoreBoost-current.scoreBoost)*10)/10,
  hypotheticalScoreDelta:current.hypotheticalEliteScore==null||verified.hypotheticalEliteScore==null?null:Math.round((verified.hypotheticalEliteScore-current.hypotheticalEliteScore)*10)/10,
  unrecognizedDirections:rows.filter(r=>!['LONG','SHORT'].includes(String(r.provenance_evidence?.direction??'').toUpperCase())).length,
  verifiedSampleAvailable:verifiedRows.length>0};
}
