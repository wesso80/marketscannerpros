// Research evidence supplied in crypto-breakdown-brief.md (4 Oct 2026). Underlying research files were not uploaded.
// Keep provenance explicit: these are supplied research results, not a live per-coin performance claim.
export const RULE_STATUS_HEADER='None of these rules has a proven edge. This page shows facts and rule status. It does not predict.';
export const RULE_STATUS=[
 ['Locked base-breakout v1 (gates on)','No demonstrated edge','Pooled 31 closed trades: -0.19R, 95% range -0.54 to +0.17R. Before 2025: 20 trades, -0.42R; 2025 onward: 11 trades, +0.23R; top five were 216% of profit. Too few events.'],
 ['Bull gate (BTC bull + breadth)','REJECTED','Random entries held for the same time: p = 0.34.'],
 ['Daily early-signal search','No edge found','83 variants, four validated; zero holdout runs. Not distinguishable from chance.'],
 ['TOTAL3 above its 50-day average + falling BTC.D','Did not help','2023–2024: universe 20-day return after these days: -5.1%.'],
 ['Hourly early-signal search','No edge found','60 variants; flat or negative after correction.'],
 ['Relative strength turning up inside a base','Hint only, failed pass rules','Validation +10.8% versus +6.8% random; p = 0.17; negative in 2023.'],
 ['Relative strength vs TOTAL3 for coins already moving','Positive, but momentum','Describes coins already moving; not an early result.'],
].map(([name,verdict,reason])=>({name,verdict,reason,date:'2026-10-04',sourceFile:'crypto-breakdown-brief.md · supplied research summary'}));
