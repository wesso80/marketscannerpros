import { EvidenceModuleKey, OptionsScannerPayload } from '@/types/optionsScanner';

export function getAutoOpenKeys(payload: OptionsScannerPayload): EvidenceModuleKey[] {
  if (payload.decision.permission !== 'GO') {
    const blocker = payload.decision.primaryBlocker?.toLowerCase() || '';
    if (blocker.includes('gamma') || blocker.includes('iv') || blocker.includes('vol')) {
      return ['riskCompliance', 'greeksIv'];
    }
    if (blocker.includes('flow') || blocker.includes('options') || blocker.includes('oi')) {
      return ['riskCompliance', 'optionsFlow'];
    }
    if (blocker.includes('liquidity') || blocker.includes('tape')) {
      return ['riskCompliance', 'liquidityTape'];
    }
    return ['riskCompliance', 'structure'];
  }

  if (payload.evidenceSummary.conflicts > payload.evidenceSummary.confirmations) {
    return ['structure', 'greeksIv'];
  }

  return [];
}

export function buildInitialEvidenceOpen(
  autoOpen: EvidenceModuleKey[],
): Record<EvidenceModuleKey, boolean> {
  return {
    structure: autoOpen.includes('structure'),
    optionsFlow: autoOpen.includes('optionsFlow'),
    greeksIv: autoOpen.includes('greeksIv'),
    liquidityTape: autoOpen.includes('liquidityTape'),
    aiNarrative: autoOpen.includes('aiNarrative'),
    riskCompliance: autoOpen.includes('riskCompliance'),
  };
}
