/**
 * Re-export of PR #554's shared resolver (lib/signals/outcomeGuard.ts).
 * Outcome labelling keeps FTM and MATIC unknown via resolveOutcomeLabelAsset.
 * Alert pricing does not live here.
 */
export {
  symbolBase,
  resolveOutcomeAsset,
  resolveScanAsset,
  type AssetResolution,
} from '@/lib/signals/outcomeGuard';
